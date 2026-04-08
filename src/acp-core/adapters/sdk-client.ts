/**
 * SdkAcpClient - IAcpClient adapter using @anthropic-ai/claude-agent-sdk
 *
 * Uses the official Claude Agent SDK to spawn Claude Code CLI as subprocess.
 * Works with Claude subscriptions (Pro/Max) since it uses the official CLI.
 * Supports session resume via SDK's `resume` option.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import EventEmitter from "node:events";

// Polyfill: Electron's Node.js may not support setMaxListeners(n, EventTarget)
// The SDK calls events.setMaxListeners(50, abortSignal) which crashes on older Node.
// Patch the module-level function so the SDK picks it up.
const origSetMaxListeners = EventEmitter.setMaxListeners;
if (origSetMaxListeners) {
  EventEmitter.setMaxListeners = function (n: number, ...args: unknown[]) {
    try {
      origSetMaxListeners(n, ...(args as [never]));
    } catch {
      // Silently ignore if EventTarget not supported
    }
  } as typeof EventEmitter.setMaxListeners;
}

import type {
  IAcpClient,
  ITerminalHandle,
  CreateTerminalOptions,
  AcpClientConfig,
  SessionConfig,
  Session,
  StreamEvent,
  SendMessageOptions,
  PermissionHandler,
  SessionMode,
  SessionModeState,
  ModelInfo,
  SessionConfigOption,
  AgentCapabilities,
  ListSessionsParams,
  ListSessionsResult,
} from "../interfaces";

import type {
  Query,
  Options as SdkOptions,
  SDKMessage,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";

export class SdkAcpClient implements IAcpClient {
  private config: AcpClientConfig;
  private permissionHandler: PermissionHandler | null = null;
  private session: Session | null = null;
  private connected = false;
  private cwd: string | null = null;
  private currentQuery: Query | null = null;
  private abortController: AbortController;
  private closedPromise: Promise<void>;
  private closedResolve: (() => void) | null = null;
  private claudeSessionId: string | null = null;
  private claudePath: string | null = null;

  constructor(config?: AcpClientConfig) {
    this.config = config ?? {};
    if (config?.permissionHandler) {
      this.permissionHandler = config.permissionHandler;
    }
    this.abortController = new AbortController();
    this.closedPromise = new Promise((resolve) => {
      this.closedResolve = resolve;
    });
  }

  // ============================================================================
  // Connection Lifecycle
  // ============================================================================

  connect(sessionConfig: SessionConfig): Promise<Session> {
    this.cwd = sessionConfig.cwd;

    // Resolve claude CLI path (import.meta.url is polyfilled in esbuild bundle)
    const candidates = ["/opt/homebrew/bin/claude", "/usr/local/bin/claude", "/usr/bin/claude"];
    try {
      this.claudePath = execSync("which claude", {
        encoding: "utf-8",
        env: {
          ...process.env,
          PATH: process.env.PATH ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin",
        },
      }).trim();
    } catch {
      this.claudePath = candidates.find((p) => existsSync(p)) ?? null;
    }

    if (!this.claudePath) {
      return Promise.reject(new Error("Claude CLI not found. Install: https://claude.ai/code"));
    }

    console.debug("[SdkAcpClient] Claude CLI path:", this.claudePath);

    const sessionId = `sdk-${Date.now()}`;
    this.session = {
      id: sessionId,
      cwd: sessionConfig.cwd,
      createdAt: new Date(),
      isActive: true,
    };

    this.connected = true;
    this.config.onConnect?.();

    return Promise.resolve(this.session);
  }

  disconnect(): Promise<void> {
    if (this.currentQuery) {
      try {
        void this.currentQuery.interrupt();
      } catch {
        // Ignore interrupt errors
      }
      this.currentQuery = null;
    }
    this.connected = false;
    this.session = null;
    this.claudeSessionId = null;
    this.closedResolve?.();
    this.config.onDisconnect?.();
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this.connected;
  }

  getSession(): Session | null {
    return this.session;
  }

  /**
   * Get the Claude Code session ID (for vault session linking)
   */
  getClaudeSessionId(): string | null {
    return this.claudeSessionId;
  }

  /**
   * Set a Claude session ID to resume on next sendMessage
   */
  setResumeSessionId(sessionId: string): void {
    this.claudeSessionId = sessionId;
    console.debug("[SdkAcpClient] Resume session ID set:", sessionId);
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  get closed(): Promise<void> {
    return this.closedPromise;
  }

  // ============================================================================
  // Messaging via SDK query()
  // ============================================================================

  async *sendMessage(
    text: string,
    _options?: SendMessageOptions
  ): AsyncGenerator<StreamEvent, void, unknown> {
    if (!this.connected || !this.cwd || !this.claudePath) {
      throw new Error("Not connected");
    }

    try {
      yield { type: "message_start", messageId: `msg-${Date.now()}` };

      // Build SDK options
      const sdkOptions: SdkOptions = {
        cwd: this.cwd,
        pathToClaudeCodeExecutable: this.claudePath,
        includePartialMessages: true,
        permissionMode: "default",
      };

      // Resume existing session if we have a valid Claude UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (this.claudeSessionId && uuidRegex.test(this.claudeSessionId)) {
        sdkOptions.resume = this.claudeSessionId;
      }

      // Wire permission handler
      if (this.permissionHandler) {
        const handler = this.permissionHandler;
        sdkOptions.canUseTool = async (
          toolName: string,
          input: Record<string, unknown>,
          _opts: { signal: AbortSignal }
        ): Promise<PermissionResult> => {
          try {
            const result = await handler({
              toolCall: {
                id: `tool-${Date.now()}`,
                name: toolName,
                input,
                status: "pending",
              },
              description: `${toolName}: ${JSON.stringify(input).slice(0, 100)}`,
            });
            if (result.granted) {
              return { behavior: "allow" };
            } else {
              return { behavior: "deny", message: result.reason ?? "Denied by user" };
            }
          } catch {
            return { behavior: "deny", message: "Permission handler error" };
          }
        };
      }

      // Import SDK and call query()
      const { query: sdkQuery } = await import("@anthropic-ai/claude-agent-sdk");

      this.currentQuery = sdkQuery({ prompt: text, options: sdkOptions });

      // Iterate SDK messages and convert to StreamEvent
      for await (const msg of this.currentQuery) {
        const events = this.convertSdkMessage(msg);
        for (const event of events) {
          yield event;
        }

        // Track Claude session ID -- may change on resume/fork
        if ("session_id" in msg && msg.session_id) {
          const newId = msg.session_id;
          if (newId !== this.claudeSessionId) {
            this.claudeSessionId = newId;
            console.debug("[SdkAcpClient] Claude session ID:", newId);
            // Notify via session update so ChatView can persist it
            this.config.onSessionUpdate?.({
              sessionUpdate: "session_id",
              sessionId: newId,
            } as unknown as import("../interfaces").SessionUpdate);
          }
        }
      }

      this.currentQuery = null;

      yield { type: "message_complete", stopReason: "end_turn" };
    } catch (error) {
      this.currentQuery = null;
      yield { type: "error", error: error as Error };
    }
  }

  sendMessageSync(text: string, options?: SendMessageOptions): Promise<StreamEvent[]> {
    const collect = async (): Promise<StreamEvent[]> => {
      const events: StreamEvent[] = [];
      for await (const event of this.sendMessage(text, options)) {
        events.push(event);
        this.config.onEvent?.(event);
      }
      return events;
    };
    return collect();
  }

  cancel(): Promise<void> {
    if (this.currentQuery) {
      void this.currentQuery.interrupt();
      this.currentQuery = null;
    }
    return Promise.resolve();
  }

  // ============================================================================
  // SDK Message → StreamEvent Conversion
  // ============================================================================

  private convertSdkMessage(msg: SDKMessage): StreamEvent[] {
    const events: StreamEvent[] = [];

    switch (msg.type) {
      case "assistant": {
        // Skip full assistant messages -- content already streamed via stream_event.
        // Only extract tool_use blocks which don't come via streaming.
        if (msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "tool_use") {
              const toolBlock = block as unknown as {
                id: string;
                name: string;
                input: Record<string, unknown>;
              };
              events.push({
                type: "tool_call_start",
                toolCallId: toolBlock.id,
                toolName: toolBlock.name,
              });
            }
          }
        }
        break;
      }

      case "stream_event": {
        const streamEvent = msg.event;
        if (streamEvent.type === "content_block_delta") {
          const delta = streamEvent.delta;
          if ("text" in delta) {
            events.push({ type: "text_delta", text: (delta as { text: string }).text });
          } else if ("thinking" in delta) {
            events.push({ type: "thinking_delta", text: (delta as { thinking: string }).thinking });
          }
        }
        break;
      }

      case "result": {
        // Capture session ID from result
        if (msg.session_id && !this.claudeSessionId) {
          this.claudeSessionId = msg.session_id;
        }
        if (msg.subtype !== "success") {
          const errorMsg =
            "errors" in msg ? (msg as { errors: string[] }).errors.join(", ") : "Unknown error";
          events.push({ type: "error", error: new Error(errorMsg) });
        }
        break;
      }

      case "system": {
        if ("session_id" in msg && msg.session_id && !this.claudeSessionId) {
          this.claudeSessionId = msg.session_id;
        }
        if ("subtype" in msg && msg.subtype === "init") {
          console.debug("[SdkAcpClient] Init:", {
            model: (msg as unknown as { model?: string }).model,
            session_id: msg.session_id,
          });
        }
        break;
      }

      case "tool_progress": {
        events.push({
          type: "tool_call_delta",
          toolCallId: msg.tool_use_id,
          status: "in_progress",
        });
        break;
      }

      default:
        break;
    }

    return events;
  }

  // ============================================================================
  // Permissions
  // ============================================================================

  setPermissionHandler(handler: PermissionHandler): void {
    this.permissionHandler = handler;
  }

  // ============================================================================
  // Session Management (stubs)
  // ============================================================================

  getAgentCapabilities(): AgentCapabilities | null {
    return { loadSession: false, sessionCapabilities: {} };
  }
  supportsSessionLoad(): boolean {
    return false;
  }
  supportsSessionResume(): boolean {
    return false;
  }
  supportsSessionFork(): boolean {
    return false;
  }
  listSessions(_params?: ListSessionsParams): Promise<ListSessionsResult> {
    return Promise.resolve({ sessions: [] });
  }
  loadSession(_sessionId: string): Promise<Session> {
    return Promise.reject(new Error("Not supported"));
  }
  resumeSession(_sessionId: string): Promise<Session> {
    return Promise.reject(new Error("Not supported"));
  }
  forkSession(_sessionId: string, _atMessageIndex?: number): Promise<string> {
    return Promise.reject(new Error("Not supported"));
  }

  // ============================================================================
  // Modes / Models / Config (stubs)
  // ============================================================================

  getAvailableModes(): SessionMode[] {
    return [];
  }
  getCurrentMode(): SessionModeState | null {
    return null;
  }
  setMode(_modeId: string): Promise<void> {
    return Promise.resolve();
  }
  getAvailableModels(): ModelInfo[] {
    return [];
  }
  getCurrentModel(): SessionModeState | null {
    return null;
  }
  setModel(_modelId: string): Promise<void> {
    return Promise.resolve();
  }
  getConfigOptions(): SessionConfigOption[] {
    return [];
  }
  setConfigOption(_configId: string, _valueId: string): Promise<SessionConfigOption[]> {
    return Promise.resolve([]);
  }

  // ============================================================================
  // Terminal (stub)
  // ============================================================================

  supportsTerminal(): boolean {
    return false;
  }
  createTerminal(_command: string, _options?: CreateTerminalOptions): Promise<ITerminalHandle> {
    return Promise.reject(new Error("Not supported"));
  }
}

/**
 * Factory function for creating SdkAcpClient instances
 */
export function createSdkClient(config?: AcpClientConfig): IAcpClient {
  return new SdkAcpClient(config);
}
