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

    // Create ACP client with event handlers
    const events: AcpClientEvents = {
      onMessage: (text) => {
        console.log("[Claude]", text);
        this.chatView?.appendAssistantMessage(text);
      },
      onToolCall: (title, status) => {
        console.log(`[Tool] ${title}: ${status}`);
        this.chatView?.onToolCall(title, status);
      },
      onPermissionRequest: async (params) => {
        // For now, auto-approve first option
        // TODO: Show UI modal for permission
        console.log(`[Permission] ${params.toolCall.title}`);
        new Notice(`Claude Code: ${params.toolCall.title}`);
        return {
          outcome: {
            outcome: "selected",
            optionId: params.options[0].optionId,
          },
        };
      },
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
      this.chatView?.completeAssistantMessage();
    } finally {
      this.chatView?.updateStatus("connected");
    }
  }

  isConnected(): boolean {
    return this.acpClient?.isConnected() ?? false;
  }
}
