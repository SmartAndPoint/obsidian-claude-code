import { Plugin, Notice, WorkspaceLeaf } from "obsidian";
import { ObsidianAcpClient, AcpClientEvents } from "./acpClient";
import { ChatView, CHAT_VIEW_TYPE } from "./views/ChatView";

export default class ClaudeCodePlugin extends Plugin {
  private acpClient: ObsidianAcpClient | null = null;

  /**
   * Get the active ChatView instance via workspace lookup
   * This avoids memory leaks from storing view references
   */
  private getChatView(): ChatView | null {
    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
    if (leaves.length > 0) {
      return leaves[0].view as ChatView;
    }
    return null;
  }

  async onload(): Promise<void> {
    await Promise.resolve(); // Required for Obsidian Plugin interface
    console.debug("Loading Claude Code Integration plugin");

    // Register chat view - don't store reference to avoid memory leaks
    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));

    // Create ACP client with Phase 4.1 event handlers
    const events: AcpClientEvents = {
      // Message streaming
      onMessageChunk: (content) => {
        this.getChatView()?.onMessageChunk(content);
      },
      onThoughtChunk: (content) => {
        this.getChatView()?.onThoughtChunk(content);
      },
      onMessageComplete: () => {
        this.getChatView()?.completeAssistantMessage();
      },

      // Tool calls
      onToolCall: (toolCall) => {
        console.debug(`[Tool] ${toolCall.title}: ${toolCall.status}`);
        this.getChatView()?.onToolCall(toolCall);
      },
      onToolCallUpdate: (update) => {
        console.debug(`[Tool Update] ${update.toolCallId}: ${update.status}`);
        this.getChatView()?.onToolCallUpdate(update);
      },

      // Plan
      onPlan: (plan) => {
        console.debug(`[Plan] ${plan.entries.length} entries`);
        this.getChatView()?.onPlan(plan);
      },

      // Permission request with inline card
      onPermissionRequest: async (params) => {
        console.debug(`[Permission] ${params.toolCall.title}`);

        // Use inline permission card in chat
        const chatView = this.getChatView();
        if (chatView) {
          return await chatView.onPermissionRequest(params);
        }

        // Fallback: auto-deny if no chat view
        return {
          outcome: { outcome: "cancelled" }
        };
      },

      // Connection lifecycle
      onError: (error) => {
        console.error("[ACP Error]", error);
        new Notice(`Claude Code Integration: ${error.message}`);
        this.getChatView()?.updateStatus("disconnected");
      },
      onConnected: () => {
        console.debug("[ACP] Connected");
        new Notice("Claude Code: connected");
        this.getChatView()?.updateStatus("connected");
      },
      onDisconnected: () => {
        console.debug("[ACP] Disconnected");
        new Notice("Claude Code: disconnected");
        this.getChatView()?.updateStatus("disconnected");
      },

      // Legacy fallback (optional)
      onMessage: (text) => {
        // Used for backward compatibility if needed
        console.debug("[Claude Legacy]", text.slice(0, 50));
      },
    };

    this.acpClient = new ObsidianAcpClient(events);

    // Register commands
    this.addCommand({
      id: "open-chat",
      name: "Open chat",
      callback: () => void this.activateChatView(),
    });

    this.addCommand({
      id: "connect",
      name: "Connect",
      callback: () => void this.connect(),
    });

    this.addCommand({
      id: "disconnect",
      name: "Disconnect",
      callback: () => void this.disconnect(),
    });

    // Add selection to chat
    this.addCommand({
      id: "add-selection-to-chat",
      name: "Add selection to chat",
      editorCallback: (editor, view) => {
        const selection = editor.getSelection();
        if (!selection) {
          new Notice("No text selected");
          return;
        }

        const file = view.file;
        if (!file) {
          new Notice("No file open");
          return;
        }

        const from = editor.getCursor("from");
        const to = editor.getCursor("to");

        // Ensure chat view is open
        void this.activateChatView().then(() => {
          // Add selection to chat
          this.getChatView()?.addSelection(file, from.line + 1, to.line + 1, selection);
        });
      },
    });

    // Add ribbon icon
    this.addRibbonIcon("bot", "Claude Code", () => {
      void this.activateChatView();
    });
  }

  onunload(): void {
    console.debug("Unloading Claude Code plugin");
    void this.acpClient?.disconnect();
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
      this.getChatView()?.updateStatus("connecting");
      const vaultPath = (this.app.vault.adapter as unknown as { basePath: string }).basePath;

      // Get plugin directory for binary caching
      const pluginDir = this.manifest.dir
        ? `${vaultPath}/.obsidian/plugins/${this.manifest.id}`
        : __dirname;

      console.debug(`[Plugin] Plugin directory: ${pluginDir}`);

      // Connect with download progress callback
      await this.acpClient?.connect(
        vaultPath,
        pluginDir,
        undefined, // apiKey from env
        (progress) => {
          // Show download progress to user
          if (progress.status === "downloading" || progress.status === "installing") {
            new Notice(progress.message, 3000);
            this.getChatView()?.updateStatus("connecting", progress.message);
          } else if (progress.status === "error") {
            new Notice(`Error: ${progress.message}`, 5000);
          }
        }
      );
    } catch (error) {
      new Notice(`Failed to connect: ${(error as Error).message}`);
      this.getChatView()?.updateStatus("disconnected");
    }
  }

  async disconnect(): Promise<void> {
    await this.acpClient?.disconnect();
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.acpClient?.isConnected()) {
      throw new Error("Not connected");
    }

    this.getChatView()?.updateStatus("thinking");

    try {
      await this.acpClient.sendMessage(text);
      // Note: completeAssistantMessage is now called via onMessageComplete event
    } catch (error) {
      this.getChatView()?.updateStatus("connected");
      throw error;
    }
  }

  isConnected(): boolean {
    return this.acpClient?.isConnected() ?? false;
  }
}
