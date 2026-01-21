/**
 * Obsidian ACP Client
 *
 * Wrapper around acp-core NativeAcpClient that provides
 * Obsidian-specific integration and maintains compatibility
 * with the existing plugin interface.
 */

import { existsSync, promises as fs } from "node:fs";
import {
  createAcpClient,
  type IAcpClient,
  type AcpClientConfig,
  type StreamEvent,
  type SessionUpdate,
  type PermissionRequest,
  type PermissionHandler,
  type ContentBlock,
  type ToolKind,
  type ToolCallStatus,
  type ToolCallLocation,
  type ToolCallContent,
  type AvailableCommand,
} from "./acp-core";
import { ensureBinaryAvailable, ProgressCallback } from "./binaryManager";

/**
 * Extended event interface for Phase 4.1 components
 */
export interface AcpClientEvents {
  // Message streaming
  onMessageChunk: (content: ContentBlock) => void;
  onThoughtChunk: (content: ContentBlock) => void;
  onMessageComplete: () => void;

  // Tool calls - use SDK-compatible types
  onToolCall: (toolCall: ToolCallData & { sessionUpdate: "tool_call" }) => void;
  onToolCallUpdate: (update: ToolCallUpdateData & { sessionUpdate: "tool_call_update" }) => void;

  // Plan
  onPlan: (plan: PlanData & { sessionUpdate: "plan" }) => void;

  // Permission
  onPermissionRequest: (params: PermissionRequestParams) => Promise<PermissionResponseParams>;

  // Connection lifecycle
  onError: (error: Error) => void;
  onConnected: () => void;
  onDisconnected: () => void;

  // Slash commands
  onAvailableCommandsUpdate?: (commands: AvailableCommand[]) => void;

  // Legacy (for backward compatibility)
  onMessage?: (text: string) => void;
}

// Re-export for consumers
export type { AvailableCommand };

// Types that match the SDK's structure
export interface ToolCallData {
  toolCallId: string;
  title: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  locations?: ToolCallLocation[];
  content?: ToolCallContent[];
}

export interface ToolCallUpdateData {
  toolCallId: string;
  title?: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  locations?: ToolCallLocation[];
  content?: ToolCallContent[];
}

export interface PlanEntry {
  content: string;
  status: "pending" | "in_progress" | "completed";
  priority?: "high" | "medium" | "low";
}

export interface PlanData {
  entries: PlanEntry[];
}

export interface PermissionRequestParams {
  toolCall: {
    toolCallId: string;
    title?: string;
    kind?: ToolKind;
    status?: ToolCallStatus;
    locations?: ToolCallLocation[];
  };
  options: Array<{
    optionId: string;
    name: string;
    kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
  }>;
}

export interface PermissionResponseParams {
  outcome: { outcome: "cancelled" } | { outcome: "selected"; optionId: string };
}

export class ObsidianAcpClient {
  private client: IAcpClient | null = null;
  private currentSessionId: string | null = null;
  private events: AcpClientEvents;
  private availableCommands: AvailableCommand[] = [];

  constructor(events: AcpClientEvents) {
    this.events = events;
  }

  getAvailableCommands(): AvailableCommand[] {
    return this.availableCommands;
  }

  async connect(
    workingDirectory: string,
    pluginDir: string,
    apiKey?: string,
    onDownloadProgress?: ProgressCallback
  ): Promise<void> {
    try {
      // Find or download claude-code-acp binary using BinaryManager
      console.debug(`[ACP] Ensuring binary available, plugin dir: ${pluginDir}`);
      const binaryInfo = await ensureBinaryAvailable(pluginDir, onDownloadProgress);

      if (!binaryInfo) {
        throw new Error(
          "Failed to find or download claude-code-acp binary. Please install Node.js and npm."
        );
      }

      console.debug(`[ACP] Using binary: ${binaryInfo.path} (${binaryInfo.type})`);

      // Create permission handler that delegates to events
      const permissionHandler: PermissionHandler = async (request: PermissionRequest) => {
        // Convert our internal PermissionRequest to SDK-compatible format
        const sdkRequest: PermissionRequestParams = {
          toolCall: {
            toolCallId: request.toolCall.id,
            title: request.toolCall.title,
            kind: request.toolCall.kind,
            status: request.toolCall.status,
            locations: request.toolCall.locations?.map((path) => ({ path })),
          },
          options: request.options ?? [
            { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
            { optionId: "reject_once", name: "Reject", kind: "reject_once" },
          ],
        };

        const response = await this.events.onPermissionRequest(sdkRequest);

        if (response.outcome.outcome === "selected") {
          const optionId = response.outcome.optionId;
          const selectedOption = sdkRequest.options.find((o) => o.optionId === optionId);
          const isAllow = selectedOption?.kind.includes("allow");
          return { granted: isAllow ?? false, optionId };
        }
        return { granted: false };
      };

      // Create the ACP client config
      const config: AcpClientConfig = {
        permissionHandler,
        onEvent: (event: StreamEvent) => this.handleStreamEvent(event),
        onSessionUpdate: (update: SessionUpdate) => this.handleSessionUpdate(update),
        onConnect: () => {
          this.events.onConnected();
        },
        onDisconnect: () => {
          this.events.onDisconnected();
        },
        onError: (error: Error) => {
          this.events.onError(error);
        },
        // Provide file system handlers
        fileSystem: {
          readFile: async (path: string) => {
            if (!existsSync(path)) {
              return "";
            }
            return fs.readFile(path, { encoding: "utf-8" });
          },
          writeFile: async (path: string, content: string) => {
            await fs.writeFile(path, content, { encoding: "utf-8" });
          },
          exists: (path: string) => {
            return Promise.resolve(existsSync(path));
          },
        },
      };

      // Create the client using acp-core factory with native implementation
      this.client = createAcpClient(config, "native");

      // Connect with session config
      const session = await this.client.connect({
        cwd: workingDirectory,
        apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
        binaryPath: binaryInfo.path,
        mcpServers: [],
      });

      this.currentSessionId = session.id;
      console.debug(`[ACP] Connected, session: ${this.currentSessionId}`);
    } catch (error) {
      this.events.onError(error as Error);
      throw error;
    }
  }

  private handleStreamEvent(event: StreamEvent): void {
    switch (event.type) {
      case "text_delta":
        // Convert to ContentBlock for message chunk
        this.events.onMessageChunk({
          type: "text",
          text: event.text,
        });
        // Legacy fallback
        this.events.onMessage?.(event.text);
        break;

      case "thinking_delta":
        this.events.onThoughtChunk({
          type: "text",
          text: event.text,
        });
        break;

      case "tool_call_start":
        this.events.onToolCall({
          sessionUpdate: "tool_call",
          toolCallId: event.toolCallId,
          title: event.title ?? event.toolName,
          kind: event.kind,
          status: "in_progress",
          locations: event.locations,
        });
        break;

      case "tool_call_delta":
        this.events.onToolCallUpdate({
          sessionUpdate: "tool_call_update",
          toolCallId: event.toolCallId,
          status: event.status,
          content: event.content,
        });
        break;

      case "tool_call_complete":
        this.events.onToolCallUpdate({
          sessionUpdate: "tool_call_update",
          toolCallId: event.toolCallId,
          status: event.isError ? "failed" : "completed",
        });
        break;

      case "plan":
        this.events.onPlan({
          sessionUpdate: "plan",
          entries: event.entries.map((e) => ({
            content: e.title,
            status: e.status,
            priority: e.priority,
          })),
        });
        break;

      case "message_complete":
        this.events.onMessageComplete();
        break;

      case "commands_update": {
        // Stream event for commands update
        this.availableCommands = event.commands;
        console.debug(
          "[ACP] Commands update (stream):",
          this.availableCommands.length,
          this.availableCommands.map((c) => c.name)
        );
        this.events.onAvailableCommandsUpdate?.(this.availableCommands);
        break;
      }

      case "error":
        this.events.onError(event.error);
        break;

      default:
        console.debug("[ACP] Unhandled stream event:", event);
    }
  }

  private handleSessionUpdate(update: SessionUpdate): void {
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        this.events.onMessageChunk(update.content);
        // Legacy fallback
        if (update.content.type === "text") {
          this.events.onMessage?.(update.content.text ?? "");
        }
        break;

      case "agent_thought_chunk":
        this.events.onThoughtChunk(update.content);
        break;

      case "tool_call":
        this.events.onToolCall({
          ...update,
          sessionUpdate: "tool_call",
        });
        break;

      case "tool_call_update":
        this.events.onToolCallUpdate({
          ...update,
          sessionUpdate: "tool_call_update",
        });
        break;

      case "plan": {
        this.events.onPlan({
          sessionUpdate: "plan",
          entries: update.entries.map((e) => ({
            content: e.title,
            status: e.status,
            priority: e.priority,
          })),
        });
        break;
      }

      case "user_message_chunk":
        console.debug("[ACP] User message echo:", update.content);
        break;

      case "available_commands_update": {
        this.availableCommands = update.availableCommands;
        console.debug(
          "[ACP] Available commands updated:",
          this.availableCommands.length,
          this.availableCommands.map((c) => c.name)
        );
        this.events.onAvailableCommandsUpdate?.(this.availableCommands);
        break;
      }

      case "current_mode_update":
      case "config_option_update":
      case "session_info_update":
        console.debug(`[ACP] ${update.sessionUpdate}:`, update);
        break;

      default:
        console.debug("[ACP] Unknown session update:", update);
    }
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.client || !this.currentSessionId) {
      throw new Error("Not connected");
    }

    // Use the streaming interface and consume all events
    for await (const event of this.client.sendMessage(text)) {
      this.handleStreamEvent(event);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    this.currentSessionId = null;
  }

  isConnected(): boolean {
    return this.client?.isConnected() ?? false;
  }

  getSessionId(): string | null {
    return this.currentSessionId;
  }

  getCurrentMode(): { modeId: string } | null {
    return this.client?.getCurrentMode() ?? null;
  }

  getAvailableModes(): Array<{ id: string; name: string; description?: string }> {
    return this.client?.getAvailableModes() ?? [];
  }

  getCurrentModel(): { modeId?: string; id?: string } | null {
    return this.client?.getCurrentModel() ?? null;
  }

  getAvailableModels(): Array<{ id: string; name: string; description?: string }> {
    return this.client?.getAvailableModels() ?? [];
  }

  getConfigOptions(): Array<{
    id: string;
    name: string;
    currentValue?: string;
    category?: string;
  }> {
    return this.client?.getConfigOptions() ?? [];
  }
}
