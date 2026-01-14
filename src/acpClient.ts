import { spawn, ChildProcess } from "node:child_process";
import { Writable, Readable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

export interface AcpClientEvents {
  onMessage: (text: string) => void;
  onToolCall: (title: string, status: string) => void;
  onPermissionRequest: (params: acp.RequestPermissionRequest) => Promise<acp.RequestPermissionResponse>;
  onError: (error: Error) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

export class ObsidianAcpClient implements acp.Client {
  private process: ChildProcess | null = null;
  private connection: acp.ClientSideConnection | null = null;
  private currentSessionId: string | null = null;
  private events: AcpClientEvents;

  constructor(events: AcpClientEvents) {
    this.events = events;
  }

  // ACP Client interface implementation
  async requestPermission(
    params: acp.RequestPermissionRequest
  ): Promise<acp.RequestPermissionResponse> {
    return this.events.onPermissionRequest(params);
  }

  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    const update = params.update;

    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content.type === "text") {
          this.events.onMessage(update.content.text);
        }
        break;
      case "tool_call":
        this.events.onToolCall(update.title ?? "Tool", update.status ?? "running");
        break;
      case "tool_call_update":
        this.events.onToolCall(`Tool ${update.toolCallId ?? "unknown"}`, update.status ?? "updated");
        break;
      default:
        break;
    }
  }

  async writeTextFile(
    params: acp.WriteTextFileRequest
  ): Promise<acp.WriteTextFileResponse> {
    // Will be implemented with Obsidian vault integration
    console.log("[ACP] writeTextFile:", params.path);
    return {};
  }

  async readTextFile(
    params: acp.ReadTextFileRequest
  ): Promise<acp.ReadTextFileResponse> {
    // Will be implemented with Obsidian vault integration
    console.log("[ACP] readTextFile:", params.path);
    return { content: "" };
  }

  async connect(workingDirectory: string): Promise<void> {
    try {
      // Spawn claude-code-acp process
      this.process = spawn("claude-code-acp", [], {
        stdio: ["pipe", "pipe", "inherit"],
        env: {
          ...process.env,
          // ANTHROPIC_API_KEY should be set in environment
        },
      });

      if (!this.process.stdin || !this.process.stdout) {
        throw new Error("Failed to get process streams");
      }

      const input = Writable.toWeb(this.process.stdin);
      const output = Readable.toWeb(this.process.stdout) as ReadableStream<Uint8Array>;

      const stream = acp.ndJsonStream(input, output);
      this.connection = new acp.ClientSideConnection((_agent) => this, stream);

      // Initialize connection
      const initResult = await this.connection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: {
            readTextFile: true,
            writeTextFile: true,
          },
        },
      });

      console.log(`[ACP] Connected, protocol v${initResult.protocolVersion}`);

      // Create session
      const sessionResult = await this.connection.newSession({
        cwd: workingDirectory,
        mcpServers: [],
      });

      this.currentSessionId = sessionResult.sessionId;
      console.log(`[ACP] Session created: ${this.currentSessionId}`);

      this.events.onConnected();
    } catch (error) {
      this.events.onError(error as Error);
      throw error;
    }
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.connection || !this.currentSessionId) {
      throw new Error("Not connected");
    }

    const result = await this.connection.prompt({
      sessionId: this.currentSessionId,
      prompt: [
        {
          type: "text",
          text: text,
        },
      ],
    });

    console.log(`[ACP] Prompt completed: ${result.stopReason}`);
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connection = null;
    this.currentSessionId = null;
    this.events.onDisconnected();
  }

  isConnected(): boolean {
    return this.connection !== null && this.currentSessionId !== null;
  }

  getSessionId(): string | null {
    return this.currentSessionId;
  }
}
