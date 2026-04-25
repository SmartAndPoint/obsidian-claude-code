import { Plugin, Notice, WorkspaceLeaf } from "obsidian";
import { ObsidianAcpClient, AcpClientEvents } from "./acpClient";
import type { SendMessageOptions } from "./acp-core";
import { SdkAcpClient } from "./acp-core/adapters";
import { ChatView, CHAT_VIEW_TYPE } from "./views/ChatView";
import { ClaudeCodeSettingTab } from "./SettingTab";
import {
  DEFAULT_SETTINGS,
  PERMISSION_MODES,
  type PluginSettings,
  type PermissionMode,
} from "./settings";

export default class ClaudeCodePlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };
  private acpClient: ObsidianAcpClient | null = null;
  private hasReconnected = false;

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
    console.debug("Loading Claude Code Integration plugin");
    await this.loadSettings();
    this.addSettingTab(new ClaudeCodeSettingTab(this.app, this));

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
          outcome: { outcome: "cancelled" },
        };
      },

      // Connection lifecycle
      onError: (error) => {
        console.error("[ACP Error]", error);
        // Check for internal error after session resume (expired session)
        const errorCode = (error as unknown as { code?: number }).code;
        if (errorCode === -32603 && !this.hasReconnected) {
          this.hasReconnected = true;
          void this.reconnectFresh();
        } else if (errorCode === -32603) {
          new Notice("Connection error. Please start a new session.", 5000);
          this.getChatView()?.updateStatus("connected");
        } else {
          new Notice(`Error: ${error.message}`);
          this.getChatView()?.updateStatus("disconnected");
        }
      },
      onConnected: () => {
        console.debug("[ACP] Connected");
        new Notice("Connected");
        this.getChatView()?.updateStatus("connected");
      },
      onDisconnected: () => {
        console.debug("[ACP] Disconnected");
        new Notice("Disconnected");
        this.getChatView()?.updateStatus("disconnected");
      },

      // Slash commands update
      onAvailableCommandsUpdate: (commands) => {
        console.debug(`[Commands] ${commands.length} commands available`);
        this.getChatView()?.updateAvailableCommands(commands);
      },

      // Track Claude session ID changes (for vault session persistence)
      onClaudeSessionIdChanged: (sessionId) => {
        console.debug(`[Plugin] Claude session ID changed: ${sessionId}`);
        const chatView = this.getChatView();
        if (chatView) {
          void chatView.linkClaudeSession(sessionId);
        }
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

    // Cycle permission mode (terminal-parity Shift+Tab analogue).
    // No default hotkey per Obsidian community-plugin policy — user binds
    // their preferred shortcut (e.g. Cmd/Ctrl+Shift+M) in Settings → Hotkeys.
    this.addCommand({
      id: "cycle-permission-mode",
      name: "Cycle permission mode",
      callback: () => void this.cyclePermissionMode(),
    });

    // Add ribbon icon
    this.addRibbonIcon("bot", "Claude", () => {
      void this.activateChatView();
    });
  }

  onunload(): void {
    console.debug("Unloading Claude Code plugin");
    void this.acpClient?.disconnect();
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<PluginSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Push live changes to the active SDK adapter (path/tools take effect
    // on next connect; mode applies to next query).
    const client = this.acpClient?.getClient();
    if (client instanceof SdkAcpClient) {
      client.setClaudePathOverride(this.settings.claudePath);
      client.setAutoApprovedTools(this.settings.autoApprovedTools);
    }
  }

  /**
   * Build the SDK config bag passed into ObsidianAcpClient.connect().
   * Path override needs to land BEFORE resolveClaudePath() runs.
   */
  private buildSdkConfig(): {
    claudePath: string;
    permissionMode: PermissionMode;
    autoApprovedTools: string[];
  } {
    return {
      claudePath: this.settings.claudePath,
      permissionMode: this.settings.lastUsedPermissionMode,
      autoApprovedTools: this.settings.autoApprovedTools,
    };
  }

  /**
   * Switch permission mode for the current session (called from chat chip).
   * Persists as lastUsedPermissionMode so the choice survives reconnects.
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    this.settings.lastUsedPermissionMode = mode;
    await this.saveData(this.settings);
    const client = this.acpClient?.getClient();
    if (client instanceof SdkAcpClient) {
      client.setPermissionMode(mode);
    }
  }

  getPermissionMode(): PermissionMode {
    return this.settings.lastUsedPermissionMode;
  }

  /**
   * Cycle to the next permission mode (Cautious → Auto-edit → Plan →
   * Bypass → Cautious). Mirrors the terminal `Shift+Tab` cycle.
   */
  async cyclePermissionMode(): Promise<void> {
    const current = this.settings.lastUsedPermissionMode;
    const idx = PERMISSION_MODES.findIndex((m) => m.id === current);
    const next = PERMISSION_MODES[(idx + 1) % PERMISSION_MODES.length];
    await this.setPermissionMode(next.id);
    const chatView = this.getChatView();
    if (chatView) {
      chatView.refreshModeChip();
      new Notice(`Permission mode: ${next.label}`, 1500);
    }
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
      void workspace.revealLeaf(leaf);
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

      // Connect with download progress callback + plugin settings
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
        },
        this.buildSdkConfig()
      );
    } catch (error) {
      new Notice(`Failed to connect: ${(error as Error).message}`);
      this.getChatView()?.updateStatus("disconnected");
    }
  }

  async disconnect(): Promise<void> {
    await this.acpClient?.disconnect();
  }

  /**
   * Connect and set a Claude session ID for resume.
   * The SDK adapter will use this ID on the next sendMessage via `resume` option.
   */
  async connectWithResume(claudeSessionId: string): Promise<void> {
    await this.connect();
    // Set resume session ID on the SDK adapter
    const client = this.acpClient?.getClient();
    if (client && "setResumeSessionId" in client) {
      (client as { setResumeSessionId: (id: string) => void }).setResumeSessionId(claudeSessionId);
    }
  }

  /**
   * Reconnect with a fresh session when the current one expired (-32603)
   */
  private async reconnectFresh(): Promise<void> {
    try {
      await this.disconnect();
      await this.connect();
      const chatView = this.getChatView();
      if (chatView) {
        const newSessionId = this.getSessionId();
        if (newSessionId) {
          await chatView.linkClaudeSession(newSessionId);
        }
        chatView.updateStatus("connected");
      }
      new Notice("Session expired. Reconnected to new session. Please resend your message.", 5000);
    } catch (error) {
      console.error("[Plugin] reconnectFresh failed:", error);
      new Notice(`Reconnect failed: ${(error as Error).message}`);
      this.getChatView()?.updateStatus("disconnected");
    }
  }

  /**
   * Connect and resume an existing Claude session
   * @param claudeSessionId - The Claude session ID to resume
   */
  async connectWithSession(claudeSessionId: string): Promise<void> {
    this.hasReconnected = false;
    try {
      this.getChatView()?.updateStatus("connecting");
      const vaultPath = (this.app.vault.adapter as unknown as { basePath: string }).basePath;

      const pluginDir = this.manifest.dir
        ? `${vaultPath}/.obsidian/plugins/${this.manifest.id}`
        : __dirname;

      // Connect first
      await this.acpClient?.connect(
        vaultPath,
        pluginDir,
        undefined,
        (progress) => {
          if (progress.status === "downloading" || progress.status === "installing") {
            new Notice(progress.message, 3000);
            this.getChatView()?.updateStatus("connecting", progress.message);
          } else if (progress.status === "error") {
            new Notice(`Error: ${progress.message}`, 5000);
          }
        },
        this.buildSdkConfig()
      );

      // Try to load/resume the session
      // Prefer loadSession (stable) over resumeSession (UNSTABLE)
      if (this.acpClient?.supportsSessionLoad()) {
        await this.acpClient.loadSession(claudeSessionId);
        console.debug(`[Plugin] Loaded Claude session: ${claudeSessionId}`);
      } else if (this.acpClient?.supportsSessionResume()) {
        await this.acpClient.resumeSession(claudeSessionId);
        console.debug(`[Plugin] Resumed Claude session: ${claudeSessionId}`);
      } else {
        console.warn("[Plugin] Session resume/load not supported by ACP");
        throw new Error("Session resume not supported");
      }
    } catch (error) {
      new Notice(`Failed to connect with session: ${(error as Error).message}`);
      this.getChatView()?.updateStatus("disconnected");
      throw error;
    }
  }

  async sendMessage(text: string, options?: SendMessageOptions): Promise<void> {
    if (!this.acpClient?.isConnected()) {
      throw new Error("Not connected");
    }

    this.getChatView()?.updateStatus("thinking");

    try {
      await this.acpClient.sendMessage(text, options);
      // Note: completeAssistantMessage is now called via onMessageComplete event
    } catch (error) {
      this.getChatView()?.updateStatus("connected");
      throw error;
    }
  }

  isConnected(): boolean {
    return this.acpClient?.isConnected() ?? false;
  }

  getAvailableCommands(): import("./acpClient").AvailableCommand[] {
    return this.acpClient?.getAvailableCommands() ?? [];
  }

  getSessionId(): string | null {
    return this.acpClient?.getSessionId() ?? null;
  }

  getCurrentMode(): { modeId: string } | null {
    return this.acpClient?.getCurrentMode() ?? null;
  }

  getAvailableModes(): Array<{ id: string; name: string; description?: string }> {
    return this.acpClient?.getAvailableModes() ?? [];
  }

  getCurrentModel(): { modeId?: string; id?: string } | null {
    return this.acpClient?.getCurrentModel() ?? null;
  }

  getAvailableModels(): Array<{ id: string; name: string; description?: string }> {
    return this.acpClient?.getAvailableModels() ?? [];
  }

  getConfigOptions(): Array<{
    id: string;
    name: string;
    currentValue?: string;
    category?: string;
  }> {
    return this.acpClient?.getConfigOptions() ?? [];
  }
}
