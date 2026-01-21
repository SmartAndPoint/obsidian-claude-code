/**
 * Zed ACP Adapter
 *
 * Version: 1.1.0 (aligned with @agentclientprotocol/sdk 0.13.0)
 *
 * Wraps the @zed-industries/claude-code-acp implementation
 * to conform to our IAcpClient interface.
 *
 * This adapter allows us to:
 * 1. Test the interface contract with a working implementation
 * 2. Gradually migrate to our native implementation
 * 3. Keep backward compatibility during transition
 */

import { spawn, ChildProcess } from "node:child_process";
import { Writable, Readable } from "node:stream";
import { existsSync, promises as fs } from "node:fs";
import * as acp from "@agentclientprotocol/sdk";

import type {
  IAcpClient,
  ITerminalHandle,
  Session,
  SessionConfig,
  SessionMode,
  SessionModeState,
  ModelInfo,
  SessionConfigOption,
  StreamEvent,
  PermissionHandler,
  PermissionRequest,
  AcpClientConfig,
  AgentCapabilities,
  ListSessionsParams,
  ListSessionsResult,
  McpServerConfig,
  SendMessageOptions,
  CreateTerminalOptions,
  StopReason,
  ToolCallStatus,
} from "../interfaces";

import {
  ensureBinaryAvailable,
  getSpawnArgs,
} from "../../binaryManager";

/**
 * Zed ACP Adapter
 *
 * Implements IAcpClient using the Zed binary
 */
export class ZedAcpAdapter implements IAcpClient {
  private process: ChildProcess | null = null;
  private connection: acp.ClientSideConnection | null = null;
  private session: Session | null = null;
  private permissionHandler: PermissionHandler | null = null;
  private config: AcpClientConfig;
  private initResult: acp.InitializeResponse | null = null;
  private abortController: AbortController;
  private closedPromise: Promise<void>;
  private closedResolve: (() => void) | null = null;
  private availableModes: SessionMode[] = [];
  private currentMode: SessionModeState | null = null;
  private availableModels: ModelInfo[] = [];
  private currentModel: SessionModeState | null = null;
  private configOptions: SessionConfigOption[] = [];
  private sessionCwd: string = "";

  // Client implementation for acp.Client interface
  private acpClient: acp.Client;

  constructor(config?: AcpClientConfig) {
    this.config = config ?? {};
    if (config?.permissionHandler) {
      this.permissionHandler = config.permissionHandler;
    }
    this.abortController = new AbortController();
    this.closedPromise = new Promise((resolve) => {
      this.closedResolve = resolve;
    });

    // Create the acp.Client implementation
    this.acpClient = this.createAcpClientImpl();
  }

  private createAcpClientImpl(): acp.Client {
    return {
      requestPermission: async (
        params: acp.RequestPermissionRequest
      ): Promise<acp.RequestPermissionResponse> => {
        return this.handleRequestPermission(params);
      },

      sessionUpdate: (params: acp.SessionNotification): Promise<void> => {
        this.handleSessionUpdate(params);
        return Promise.resolve();
      },

      writeTextFile: async (
        params: acp.WriteTextFileRequest
      ): Promise<acp.WriteTextFileResponse> => {
        return this.handleWriteTextFile(params);
      },

      readTextFile: async (
        params: acp.ReadTextFileRequest
      ): Promise<acp.ReadTextFileResponse> => {
        return this.handleReadTextFile(params);
      },

      createTerminal: (
        _params: acp.CreateTerminalRequest
      ): Promise<acp.CreateTerminalResponse> => {
        // Terminal creation is agent-side, not available for client
        return Promise.reject(new Error("Terminal creation not supported from client side"));
      },
    };
  }

  // ============================================================================
  // IAcpClient Implementation - Connection Lifecycle
  // ============================================================================

  async connect(sessionConfig: SessionConfig): Promise<Session> {
    try {
      this.config.onEvent?.({
        type: "message_start",
        messageId: "connect",
      });

      // Find or download the Zed binary
      const binaryInfo = await ensureBinaryAvailable(sessionConfig.cwd);

      if (!binaryInfo) {
        throw new Error("Failed to find or download claude-code-acp binary");
      }

      const spawnArgs = getSpawnArgs(binaryInfo);

      // Check for API key
      const apiKey = sessionConfig.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.warn("[ZedAdapter] Warning: ANTHROPIC_API_KEY not found");
      }

      // Store cwd for later use
      this.sessionCwd = sessionConfig.cwd;

      // Spawn the process
      this.process = spawn(spawnArgs.command, spawnArgs.args, {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: sessionConfig.cwd,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: apiKey,
          PATH: `${process.env.PATH ?? ""}:/opt/homebrew/bin:/usr/local/bin`,
        },
      });

      this.process.on("error", (err) => {
        this.config.onError?.(err);
      });

      this.process.on("exit", () => {
        this.closedResolve?.();
        this.abortController.abort();
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        console.debug("[ZedAdapter stderr]", data.toString());
      });

      if (!this.process.stdin || !this.process.stdout) {
        throw new Error("Failed to get process streams");
      }

      // Create ACP connection
      const input = Writable.toWeb(this.process.stdin);
      const output = Readable.toWeb(this.process.stdout) as ReadableStream<Uint8Array>;
      const stream = acp.ndJsonStream(input, output);

      this.connection = new acp.ClientSideConnection((_agent) => this.acpClient, stream);

      // Initialize
      this.initResult = await this.connection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: {
            readTextFile: true,
            writeTextFile: true,
          },
        },
      });

      // Debug: log initialization result
      console.debug("[ZedAdapter] Init result:", JSON.stringify(this.initResult, null, 2));

      // Create session
      // Convert MCP servers config to ACP format
      const mcpServers: acp.McpServer[] = (sessionConfig.mcpServers ?? []).map((s) => ({
        name: s.name,
        command: s.command,
        args: s.args ?? [],
        // Convert Record<string, string> to EnvVariable[]
        env: s.env ? Object.entries(s.env).map(([name, value]) => ({ name, value })) : [],
      })) as acp.McpServer[];

      const sessionResult = await this.connection.newSession({
        cwd: sessionConfig.cwd,
        mcpServers,
      });

      // Debug: log full session result
      console.debug("[ZedAdapter] Session result:", JSON.stringify(sessionResult, null, 2));

      // Store session mode info if available
      if (sessionResult.modes) {
        this.availableModes = sessionResult.modes.availableModes.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description ?? undefined,
        }));
        this.currentMode = { modeId: sessionResult.modes.currentModeId };
      }

      // Store model info if available (experimental)
      if (sessionResult.models) {
        this.availableModels = sessionResult.models.availableModels.map((m) => ({
          id: m.modelId,
          name: m.name,
          description: m.description ?? undefined,
        }));
        this.currentModel = { modeId: sessionResult.models.currentModelId };
      }

      // Store config options if available (experimental)
      if (sessionResult.configOptions) {
        this.configOptions = this.mapConfigOptions(sessionResult.configOptions);
      }

      this.session = {
        id: sessionResult.sessionId,
        cwd: sessionConfig.cwd,
        createdAt: new Date(),
        isActive: true,
        availableModes: this.availableModes,
        currentMode: this.currentMode ?? undefined,
      };

      this.config.onConnect?.();

      return this.session;
    } catch (error) {
      this.config.onError?.(error as Error);
      throw error;
    }
  }

  disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connection = null;

    if (this.session) {
      this.session.isActive = false;
    }
    this.session = null;
    this.initResult = null;

    this.config.onDisconnect?.();
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this.connection !== null && this.session !== null;
  }

  getSession(): Session | null {
    return this.session;
  }

  getAgentCapabilities(): AgentCapabilities | null {
    if (!this.initResult) {
      return null;
    }
    const caps = this.initResult.agentCapabilities;
    if (!caps) {
      return null;
    }
    return {
      loadSession: caps.loadSession ?? undefined,
      mcpCapabilities: caps.mcpCapabilities ? {
        // Note: ACP SDK 0.13.0 mcpCapabilities has http/sse, not servers
        servers: true, // Assume servers are supported if mcpCapabilities exists
      } : undefined,
      sessionCapabilities: caps.sessionCapabilities ? {
        // Note: ACP SDK 0.13.0 sessionCapabilities has fork/list/resume, but not modes/configOptions/modelSelection
        fork: caps.sessionCapabilities.fork !== null && caps.sessionCapabilities.fork !== undefined,
        resume: caps.sessionCapabilities.resume !== null && caps.sessionCapabilities.resume !== undefined,
        list: caps.sessionCapabilities.list !== null && caps.sessionCapabilities.list !== undefined,
      } : undefined,
    };
  }

  // ============================================================================
  // IAcpClient Implementation - Messaging
  // ============================================================================

  async *sendMessage(
    text: string,
    options?: SendMessageOptions
  ): AsyncGenerator<StreamEvent, void, unknown> {
    if (!this.connection || !this.session) {
      throw new Error("Not connected");
    }

    try {
      // Build prompt content - use ContentBlock array
      const prompt: acp.ContentBlock[] = [{ type: "text", text }];

      // Add additional content if provided
      if (options?.additionalContent) {
        for (const content of options.additionalContent) {
          if (content.type === "text") {
            prompt.push({ type: "text", text: content.text });
          } else if (content.type === "image") {
            prompt.push({ type: "image", data: content.data, mimeType: content.mimeType });
          }
        }
      }

      const result = await this.connection.prompt({
        sessionId: this.session.id,
        prompt,
      });

      // Yield completion event
      yield {
        type: "message_complete",
        stopReason: this.mapStopReason(result.stopReason),
      };
    } catch (error) {
      yield {
        type: "error",
        error: error as Error,
      };
    }
  }

  async sendMessageSync(
    text: string,
    options?: SendMessageOptions
  ): Promise<StreamEvent[]> {
    const events: StreamEvent[] = [];

    for await (const event of this.sendMessage(text, options)) {
      events.push(event);
      this.config.onEvent?.(event);
    }

    return events;
  }

  async cancel(): Promise<void> {
    if (!this.connection || !this.session) {
      return;
    }
    await this.connection.cancel({ sessionId: this.session.id });
  }

  setPermissionHandler(handler: PermissionHandler): void {
    this.permissionHandler = handler;
  }

  // ============================================================================
  // IAcpClient Implementation - Session Modes
  // ============================================================================

  getAvailableModes(): SessionMode[] {
    return this.availableModes;
  }

  getCurrentMode(): SessionModeState | null {
    return this.currentMode;
  }

  async setMode(modeId: string): Promise<void> {
    if (!this.connection || !this.session) {
      throw new Error("Not connected");
    }
    await this.connection.setSessionMode({
      sessionId: this.session.id,
      modeId,
    });
    this.currentMode = { modeId };
  }

  // ============================================================================
  // IAcpClient Implementation - Session Models (Experimental)
  // ============================================================================

  getAvailableModels(): ModelInfo[] {
    return this.availableModels;
  }

  getCurrentModel(): SessionModeState | null {
    return this.currentModel;
  }

  async setModel(modelId: string): Promise<void> {
    if (!this.connection || !this.session) {
      throw new Error("Not connected");
    }
    await this.connection.unstable_setSessionModel({
      sessionId: this.session.id,
      modelId,
    });
    this.currentModel = { modeId: modelId };
  }

  // ============================================================================
  // IAcpClient Implementation - Session Config (Experimental)
  // ============================================================================

  getConfigOptions(): SessionConfigOption[] {
    return this.configOptions;
  }

  async setConfigOption(configId: string, valueId: string): Promise<SessionConfigOption[]> {
    if (!this.connection || !this.session) {
      throw new Error("Not connected");
    }
    const result = await this.connection.unstable_setSessionConfigOption({
      sessionId: this.session.id,
      configId,
      value: valueId,
    });
    this.configOptions = this.mapConfigOptions(result.configOptions);
    return this.configOptions;
  }

  // ============================================================================
  // IAcpClient Implementation - Session Management (Experimental)
  // ============================================================================

  async listSessions(params?: ListSessionsParams): Promise<ListSessionsResult> {
    if (!this.connection) {
      throw new Error("Not connected");
    }
    const result = await this.connection.unstable_listSessions({
      cwd: params?.cwd,
      cursor: params?.cursor,
      // Note: limit is not supported in ACP SDK 0.13.0
    });
    return {
      sessions: result.sessions.map((s) => ({
        sessionId: s.sessionId,
        cwd: s.cwd,
        title: s.title ?? undefined,
        lastUpdated: s.updatedAt ? new Date(s.updatedAt) : undefined,
      })),
      nextCursor: result.nextCursor ?? undefined,
    };
  }

  async loadSession(sessionId: string, mcpServers?: McpServerConfig[]): Promise<Session> {
    if (!this.connection) {
      throw new Error("Not connected");
    }

    const acpMcpServers: acp.McpServer[] = (mcpServers ?? []).map((s) => ({
      name: s.name,
      command: s.command,
      args: s.args ?? [],
      env: s.env ? Object.entries(s.env).map(([name, value]) => ({ name, value })) : [],
    })) as acp.McpServer[];

    const result = await this.connection.loadSession({
      sessionId,
      cwd: this.sessionCwd,
      mcpServers: acpMcpServers,
    });

    // Update local state from modes
    if (result.modes) {
      this.availableModes = result.modes.availableModes.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description ?? undefined,
      }));
      this.currentMode = { modeId: result.modes.currentModeId };
    }

    this.session = {
      id: sessionId,
      cwd: this.sessionCwd,
      createdAt: new Date(),
      isActive: true,
      availableModes: this.availableModes,
      currentMode: this.currentMode ?? undefined,
    };

    return this.session;
  }

  async forkSession(sessionId: string, _atMessageIndex?: number): Promise<string> {
    if (!this.connection) {
      throw new Error("Not connected");
    }
    // Note: atMessageIndex is not supported in ACP SDK 0.13.0
    const result = await this.connection.unstable_forkSession({
      sessionId,
      cwd: this.sessionCwd,
    });
    return result.sessionId;
  }

  async resumeSession(sessionId: string, mcpServers?: McpServerConfig[]): Promise<Session> {
    if (!this.connection) {
      throw new Error("Not connected");
    }

    const acpMcpServers: acp.McpServer[] = (mcpServers ?? []).map((s) => ({
      name: s.name,
      command: s.command,
      args: s.args ?? [],
      env: s.env ? Object.entries(s.env).map(([name, value]) => ({ name, value })) : [],
    })) as acp.McpServer[];

    const result = await this.connection.unstable_resumeSession({
      sessionId,
      cwd: this.sessionCwd,
      mcpServers: acpMcpServers,
    });

    // Update local state from modes
    if (result.modes) {
      this.availableModes = result.modes.availableModes.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description ?? undefined,
      }));
      this.currentMode = { modeId: result.modes.currentModeId };
    }

    this.session = {
      id: sessionId,
      cwd: this.sessionCwd,
      createdAt: new Date(),
      isActive: true,
      availableModes: this.availableModes,
      currentMode: this.currentMode ?? undefined,
    };

    return this.session;
  }

  // ============================================================================
  // IAcpClient Implementation - Terminal Operations
  // ============================================================================

  supportsTerminal(): boolean {
    // Terminal operations are agent-side only in ACP SDK
    // The client cannot create terminals
    return false;
  }

  createTerminal(
    _command: string,
    _options?: CreateTerminalOptions
  ): Promise<ITerminalHandle> {
    // Terminal creation is not supported from client side in ACP SDK
    return Promise.reject(new Error("Terminal creation not supported from client side. Use agent-side terminal."));
  }

  // ============================================================================
  // IAcpClient Implementation - Connection Events
  // ============================================================================

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  get closed(): Promise<void> {
    return this.closedPromise;
  }

  // ============================================================================
  // ACP Client Interface Handlers
  // ============================================================================

  private async handleRequestPermission(
    params: acp.RequestPermissionRequest
  ): Promise<acp.RequestPermissionResponse> {
    if (!this.permissionHandler) {
      // Auto-deny if no handler
      return { outcome: { outcome: "cancelled" } };
    }

    // Convert ToolCallLocation[] to string[] for our interface
    const locations = params.toolCall.locations?.map((loc) => loc.path);

    const request: PermissionRequest = {
      toolCall: {
        id: params.toolCall.toolCallId,
        name: params.toolCall.title ?? "unknown",
        title: params.toolCall.title ?? undefined,
        input: {},
        status: "pending",
        locations,
      },
      options: params.options.map((opt) => ({
        optionId: opt.optionId,
        name: opt.name,
        kind: opt.kind as "allow_once" | "allow_always" | "reject_once" | "reject_always",
      })),
    };

    const response = await this.permissionHandler(request);

    if (response.granted) {
      const allowOption = params.options.find((opt) => opt.kind === "allow_once");
      const optionId = response.optionId ?? allowOption?.optionId ?? params.options[0]?.optionId ?? "allow";
      return { outcome: { outcome: "selected", optionId } };
    } else {
      return { outcome: { outcome: "cancelled" } };
    }
  }

  private handleSessionUpdate(params: acp.SessionNotification): void {
    const update = params.update;

    // Debug: log all session updates
    console.debug("[ZedAdapter] Session update:", update.sessionUpdate, JSON.stringify(update, null, 2));

    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content.type === "text") {
          this.config.onEvent?.({
            type: "text_delta",
            text: update.content.text ?? "",
          });
        }
        break;

      case "agent_thought_chunk":
        if (update.content.type === "text") {
          this.config.onEvent?.({
            type: "thinking_delta",
            text: update.content.text ?? "",
          });
        }
        break;

      case "tool_call":
        this.config.onEvent?.({
          type: "tool_call_start",
          toolCallId: update.toolCallId,
          toolName: update.title ?? "unknown",
          title: update.title,
        });
        break;

      case "tool_call_update":
        this.config.onEvent?.({
          type: "tool_call_delta",
          toolCallId: update.toolCallId,
          status: this.mapToolStatus(update.status ?? undefined),
        });
        break;

      case "plan":
        this.config.onEvent?.({
          type: "plan",
          entries: update.entries.map((e, idx) => ({
            id: `plan-entry-${idx}`,
            title: e.content,
            status: e.status as "pending" | "in_progress" | "completed",
            priority: e.priority as "high" | "medium" | "low" | undefined,
          })),
        });
        break;

      case "current_mode_update":
        this.currentMode = { modeId: update.currentModeId };
        this.config.onEvent?.({
          type: "mode_change",
          mode: this.currentMode,
        });
        break;

      case "available_commands_update":
        this.config.onEvent?.({
          type: "commands_update",
          commands: update.availableCommands.map((c) => ({
            name: c.name,
            description: c.description,
            input: c.input ? { hint: (c.input as { hint: string }).hint } : undefined,
          })),
        });
        break;

      case "session_info_update":
        this.config.onEvent?.({
          type: "session_info",
          info: {
            title: update.title ?? undefined,
            lastUpdated: update.updatedAt
              ? new Date(update.updatedAt)
              : undefined,
          },
        });
        break;

      case "config_option_update":
        this.configOptions = this.mapConfigOptions(update.configOptions);
        break;

      default:
        console.debug("[ZedAdapter] Unknown update:", update);
    }
  }

  private async handleWriteTextFile(
    params: acp.WriteTextFileRequest
  ): Promise<acp.WriteTextFileResponse> {
    if (this.config.fileSystem) {
      await this.config.fileSystem.writeFile(params.path, params.content);
    } else {
      await fs.writeFile(params.path, params.content, { encoding: "utf-8" });
    }
    return {};
  }

  private async handleReadTextFile(
    params: acp.ReadTextFileRequest
  ): Promise<acp.ReadTextFileResponse> {
    if (this.config.fileSystem) {
      const content = await this.config.fileSystem.readFile(params.path);
      return { content };
    } else {
      if (!existsSync(params.path)) {
        return { content: "" };
      }
      const content = await fs.readFile(params.path, { encoding: "utf-8" });
      return { content };
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private mapStopReason(reason: string): StopReason {
    const reasonMap: Record<string, StopReason> = {
      end_turn: "end_turn",
      tool_use: "tool_use",
      max_tokens: "max_tokens",
      max_turn_requests: "max_turn_requests",
      refusal: "refusal",
      cancelled: "cancelled",
    };
    return reasonMap[reason] ?? "end_turn";
  }

  private mapToolStatus(status?: string): ToolCallStatus | undefined {
    if (!status) return undefined;
    const statusMap: Record<string, ToolCallStatus> = {
      pending: "pending",
      in_progress: "in_progress",
      completed: "completed",
      failed: "failed",
    };
    return statusMap[status] ?? "pending";
  }

  private mapConfigOptions(options: acp.SessionConfigOption[]): SessionConfigOption[] {
    return options.map((opt) => ({
      id: opt.id,
      name: opt.name,
      category: opt.category as SessionConfigOption["category"],
      currentValue: opt.currentValue ?? undefined,
      options: opt.options?.map((o) => {
        // Handle both SessionConfigSelectOption and SessionConfigSelectGroup
        if ("options" in o) {
          // It's a group - extract group info
          return {
            id: o.group,
            label: o.name,
          };
        }
        // It's a regular option
        return {
          id: o.value,
          label: o.name,
          description: o.description ?? undefined,
        };
      }),
    }));
  }
}

/**
 * Factory function for ZedAcpAdapter
 */
export function createZedAdapter(config?: AcpClientConfig): IAcpClient {
  return new ZedAcpAdapter(config);
}
