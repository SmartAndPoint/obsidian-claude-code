import { Plugin, Notice, WorkspaceLeaf } from "obsidian";
import { ObsidianAcpClient, AcpClientEvents } from "./acpClient";
import { ChatView, CHAT_VIEW_TYPE } from "./views/ChatView";

export default class ClaudeCodePlugin extends Plugin {
  private acpClient: ObsidianAcpClient | null = null;
  private chatView: ChatView | null = null;

  async onload() {
    console.log("Loading Claude Code plugin");

    // Register chat view
    this.registerView(CHAT_VIEW_TYPE, (leaf) => {
      this.chatView = new ChatView(leaf, this);
      return this.chatView;
    });

    // Create ACP client with Phase 4.1 event handlers
    const events: AcpClientEvents = {
      // Message streaming
      onMessageChunk: (content) => {
        this.chatView?.onMessageChunk(content);
      },
      onThoughtChunk: (content) => {
        this.chatView?.onThoughtChunk(content);
      },
      onMessageComplete: () => {
        this.chatView?.completeAssistantMessage();
      },

      // Tool calls
      onToolCall: (toolCall) => {
        console.log(`[Tool] ${toolCall.title}: ${toolCall.status}`);
        this.chatView?.onToolCall(toolCall);
      },
      onToolCallUpdate: (update) => {
        console.log(`[Tool Update] ${update.toolCallId}: ${update.status}`);
        this.chatView?.onToolCallUpdate(update);
      },

      // Plan
      onPlan: (plan) => {
        console.log(`[Plan] ${plan.entries.length} entries`);
        this.chatView?.onPlan(plan);
      },

      // Permission request with inline card
      onPermissionRequest: async (params) => {
        console.log(`[Permission] ${params.toolCall.title}`);

        // Use inline permission card in chat
        if (this.chatView) {
          return await this.chatView.onPermissionRequest(params);
        }

        // Fallback: auto-deny if no chat view
        return {
          outcome: { outcome: "cancelled" }
        };
      },

      // Connection lifecycle
      onError: (error) => {
        console.error("[ACP Error]", error);
        new Notice(`Claude Code Error: ${error.message}`);
        this.chatView?.updateStatus("disconnected");
      },
      onConnected: () => {
        console.log("[ACP] Connected");
        new Notice("Claude Code: Connected");
        this.chatView?.updateStatus("connected");
      },
      onDisconnected: () => {
        console.log("[ACP] Disconnected");
        new Notice("Claude Code: Disconnected");
        this.chatView?.updateStatus("disconnected");
      },

      // Legacy fallback (optional)
      onMessage: (text) => {
        // Used for backward compatibility if needed
        console.log("[Claude Legacy]", text.slice(0, 50));
      },
    };

    this.acpClient = new ObsidianAcpClient(events);

    // Register commands
    this.addCommand({
      id: "open-chat",
      name: "Open Chat",
      callback: () => this.activateChatView(),
    });

    this.addCommand({
      id: "connect",
      name: "Connect",
      callback: () => this.connect(),
    });

    this.addCommand({
      id: "disconnect",
      name: "Disconnect",
      callback: () => this.disconnect(),
    });

    // Add ribbon icon
    this.addRibbonIcon("bot", "Claude Code", () => {
      this.activateChatView();
    });
  }

  async onunload() {
    console.log("Unloading Claude Code plugin");
    await this.acpClient?.disconnect();
  }

  async activateChatView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async connect(): Promise<void> {
    try {
      this.chatView?.updateStatus("connecting");
      const vaultPath = (this.app.vault.adapter as any).basePath;
      await this.acpClient?.connect(vaultPath);
    } catch (error) {
      new Notice(`Failed to connect: ${(error as Error).message}`);
      this.chatView?.updateStatus("disconnected");
    }
  }

  async disconnect(): Promise<void> {
    await this.acpClient?.disconnect();
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.acpClient?.isConnected()) {
      throw new Error("Not connected");
    }

    this.chatView?.updateStatus("thinking");

    try {
      await this.acpClient.sendMessage(text);
      // Note: completeAssistantMessage is now called via onMessageComplete event
    } catch (error) {
      this.chatView?.updateStatus("connected");
      throw error;
    }
  }

  isConnected(): boolean {
    return this.acpClient?.isConnected() ?? false;
  }
}
