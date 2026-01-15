import { spawn, ChildProcess } from "node:child_process";
import { Writable, Readable } from "node:stream";
import { existsSync, promises as fs } from "node:fs";
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

/**
 * Extended event interface for Phase 4.1 components
 */
export interface AcpClientEvents {
  // Message streaming
  onMessageChunk: (content: acp.ContentBlock) => void;
  onThoughtChunk: (content: acp.ContentBlock) => void;
  onMessageComplete: () => void;

  // Tool calls
  onToolCall: (toolCall: acp.ToolCall & { sessionUpdate: "tool_call" }) => void;
  onToolCallUpdate: (update: acp.ToolCallUpdate & { sessionUpdate: "tool_call_update" }) => void;

  // Plan
  onPlan: (plan: acp.Plan & { sessionUpdate: "plan" }) => void;

  // Permission
  onPermissionRequest: (params: acp.RequestPermissionRequest) => Promise<acp.RequestPermissionResponse>;

  // Connection lifecycle
  onError: (error: Error) => void;
  onConnected: () => void;
  onDisconnected: () => void;

  // Legacy (for backward compatibility)
  onMessage?: (text: string) => void;
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
        // New Phase 4.1 handler
        this.events.onMessageChunk(update.content);
        // Legacy fallback
        if (this.events.onMessage && update.content.type === "text") {
          this.events.onMessage(update.content.text ?? "");
        }
        break;

      case "agent_thought_chunk":
        this.events.onThoughtChunk(update.content);
        break;

      case "tool_call":
        this.events.onToolCall(update);
        break;

      case "tool_call_update":
        this.events.onToolCallUpdate(update);
        break;

      case "plan":
        this.events.onPlan(update);
        break;

      case "user_message_chunk":
        // Echo of user message, typically ignored
        console.log("[ACP] User message echo:", update.content);
        break;

      case "available_commands_update":
      case "current_mode_update":
      case "config_option_update":
      case "session_info_update":
        // These are informational updates, log for now
        console.log(`[ACP] ${update.sessionUpdate}:`, update);
        break;

      default:
        console.log("[ACP] Unknown session update:", update);
        break;
    }
  }

  async writeTextFile(
    params: acp.WriteTextFileRequest
  ): Promise<acp.WriteTextFileResponse> {
    const filePath = params.path;
    console.log("[ACP] writeTextFile:", filePath);

    try {
      await fs.writeFile(filePath, params.content, { encoding: "utf-8" });
      console.log("[ACP] writeTextFile: success");
      return {};
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      console.error("[ACP] writeTextFile error:", err.message);
      // Return empty response - ACP protocol doesn't have error field
      // Agent will see the file wasn't written and can retry or report
      return {};
    }
  }

  async readTextFile(
    params: acp.ReadTextFileRequest
  ): Promise<acp.ReadTextFileResponse> {
    const filePath = params.path;
    console.log("[ACP] readTextFile:", filePath);

    try {
      // Check if file exists first
      if (!existsSync(filePath)) {
        console.warn("[ACP] readTextFile: file not found:", filePath);
        return { content: "" };
      }

      // Read file with UTF-8 encoding
      const content = await fs.readFile(filePath, { encoding: "utf-8" });
      console.log(`[ACP] readTextFile: success, ${content.length} chars`);
      return { content };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      console.error("[ACP] readTextFile error:", err.message);
      // Return empty content on error
      return { content: "" };
    }
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

    // Signal message completion
    this.events.onMessageComplete();
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
