import { spawn, ChildProcess } from "node:child_process";
import { Writable, Readable } from "node:stream";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as acp from "@agentclientprotocol/sdk";

// Find claude-code-acp binary in common locations
// Electron/Obsidian doesn't inherit shell PATH, so we need to search manually
function findClaudeCodeAcp(): string {
  const binaryName = process.platform === "win32" ? "claude-code-acp.cmd" : "claude-code-acp";

  const searchPaths = [
    // macOS Homebrew
    "/opt/homebrew/bin",
    "/usr/local/bin",
    // Linux
    "/usr/bin",
    "/usr/local/bin",
    // npm global (macOS/Linux)
    join(homedir(), ".npm-global", "bin"),
    join(homedir(), ".nvm", "versions", "node"),
    // npm global (Windows)
    join(homedir(), "AppData", "Roaming", "npm"),
    // pnpm
    join(homedir(), ".local", "share", "pnpm"),
    // Volta
    join(homedir(), ".volta", "bin"),
  ];

  for (const dir of searchPaths) {
    const fullPath = join(dir, binaryName);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  // Fallback: try PATH anyway (might work in some cases)
  return binaryName;
}

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

  async connect(workingDirectory: string, apiKey?: string): Promise<void> {
    try {
      // Find claude-code-acp binary
      const acpPath = findClaudeCodeAcp();
      console.log(`[ACP] Using binary: ${acpPath}`);

      // Check for API key
      const anthropicKey = apiKey || process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) {
        console.warn("[ACP] Warning: ANTHROPIC_API_KEY not found in environment");
      } else {
        console.log("[ACP] API key found");
      }

      // Spawn claude-code-acp process
      this.process = spawn(acpPath, [], {
        stdio: ["pipe", "pipe", "pipe"], // capture stderr too
        cwd: workingDirectory,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: anthropicKey,
          // Ensure PATH includes common binary locations
          PATH: `${process.env.PATH || ""}:/opt/homebrew/bin:/usr/local/bin`,
        },
      });

      // Log process events
      this.process.on("error", (err) => {
        console.error("[ACP] Process error:", err);
        this.events.onError(err);
      });

      this.process.on("exit", (code, signal) => {
        console.log(`[ACP] Process exited: code=${code}, signal=${signal}`);
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        console.log("[ACP stderr]", data.toString());
      });

      if (!this.process.stdin || !this.process.stdout) {
        throw new Error("Failed to get process streams");
      }

      console.log("[ACP] Process spawned, creating connection...");

      const input = Writable.toWeb(this.process.stdin);
      const output = Readable.toWeb(this.process.stdout) as ReadableStream<Uint8Array>;

      const stream = acp.ndJsonStream(input, output);
      this.connection = new acp.ClientSideConnection((_agent) => this, stream);

      console.log("[ACP] Initializing connection...");

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
