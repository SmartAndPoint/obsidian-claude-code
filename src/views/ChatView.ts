import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon } from "obsidian";
import type ClaudeCodePlugin from "../main";
import type * as acp from "@agentclientprotocol/sdk";
import { ThinkingBlock, ToolCallCard, PermissionCard, collapseCodeBlocks } from "../components";

export const CHAT_VIEW_TYPE = "claude-code-chat";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export class ChatView extends ItemView {
  private plugin: ClaudeCodePlugin;
  private messagesContainer: HTMLElement;
  private inputContainer: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private statusIndicator: HTMLElement;
  private messages: Message[] = [];

  // Streaming state
  private currentAssistantMessage: string = "";
  private currentStreamingEl: HTMLElement | null = null;

  // Thinking state
  private currentThinkingBlock: ThinkingBlock | null = null;

  // Tool calls state (track by ID for updates)
  private toolCallCards: Map<string, ToolCallCard> = new Map();

  // Active permission cards (for cleanup)
  private activePermissionCards: PermissionCard[] = [];

  // Batch update for streaming performance
  private pendingText: string = "";
  private updateScheduled: boolean = false;

  // Flag to add paragraph break after tool call
  private needsParagraphBreak: boolean = false;

  constructor(leaf: WorkspaceLeaf, plugin: ClaudeCodePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Claude Code";
  }

  getIcon(): string {
    return "bot";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("claude-code-chat");

    // Header with status
    const header = container.createDiv({ cls: "chat-header" });
    const title = header.createDiv({ cls: "chat-title" });
    title.setText("Claude Code");

    this.statusIndicator = header.createDiv({ cls: "chat-status" });
    this.updateStatus("disconnected");

    // Copy all button
    const copyAllBtn = header.createEl("button", { cls: "chat-copy-all-btn" });
    setIcon(copyAllBtn, "copy");
    copyAllBtn.setAttribute("aria-label", "Copy entire chat");
    copyAllBtn.addEventListener("click", () => this.copyAllChat());

    // Connect button
    const connectBtn = header.createEl("button", { cls: "chat-connect-btn" });
    setIcon(connectBtn, "plug");
    connectBtn.addEventListener("click", () => this.handleConnect());

    // Messages container
    this.messagesContainer = container.createDiv({ cls: "chat-messages" });

    // Input container
    this.inputContainer = container.createDiv({ cls: "chat-input-container" });

    this.textarea = this.inputContainer.createEl("textarea", {
      cls: "chat-input",
      attr: { placeholder: "Ask Claude Code..." },
    });

    this.textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    // Auto-resize textarea
    this.textarea.addEventListener("input", () => {
      this.textarea.style.height = "auto";
      this.textarea.style.height = Math.min(this.textarea.scrollHeight, 200) + "px";
    });

    this.sendButton = this.inputContainer.createEl("button", { cls: "chat-send-btn" });
    setIcon(this.sendButton, "send");
    this.sendButton.addEventListener("click", () => this.handleSend());

    // Welcome message
    this.addMessage({
      role: "assistant",
      content: "Welcome! Click the plug icon to connect to Claude Code, then start chatting.",
      timestamp: new Date(),
    });
  }

  async onClose(): Promise<void> {
    // Cancel any pending permission requests
    for (const card of this.activePermissionCards) {
      card.cancel();
    }
    this.activePermissionCards = [];

    // Cleanup
    this.toolCallCards.clear();
    this.currentThinkingBlock = null;
    this.currentStreamingEl = null;
  }

  private async handleConnect(): Promise<void> {
    if (this.plugin.isConnected()) {
      await this.plugin.disconnect();
    } else {
      await this.plugin.connect();
    }
  }

  private async handleSend(): Promise<void> {
    const text = this.textarea.value.trim();
    if (!text) return;

    if (!this.plugin.isConnected()) {
      this.addMessage({
        role: "assistant",
        content: "⚠️ Not connected. Click the plug icon to connect first.",
        timestamp: new Date(),
      });
      return;
    }

    // Add user message
    this.addMessage({
      role: "user",
      content: text,
      timestamp: new Date(),
    });

    // Clear input
    this.textarea.value = "";
    this.textarea.style.height = "auto";

    // Reset streaming state
    this.resetStreamingState();
    this.updateStatus("thinking");

    try {
      await this.plugin.sendMessage(text);
    } catch (error) {
      this.addMessage({
        role: "assistant",
        content: `❌ Error: ${(error as Error).message}`,
        timestamp: new Date(),
      });
      this.updateStatus("connected");
    }
  }

  private resetStreamingState(): void {
    this.currentAssistantMessage = "";
    this.currentStreamingEl = null;
    this.currentThinkingBlock = null;
    this.toolCallCards.clear();
    this.pendingText = "";
    this.updateScheduled = false;
    this.needsParagraphBreak = false;
  }

  // ===== Session Update Handlers =====

  /**
   * Handle agent thought chunk (internal reasoning)
   */
  onThoughtChunk(content: acp.ContentBlock): void {
    if (content.type !== "text") return;

    // Create thinking block if not exists
    if (!this.currentThinkingBlock) {
      this.currentThinkingBlock = new ThinkingBlock(this.messagesContainer);
    }

    this.currentThinkingBlock.appendText(content.text ?? "");
    this.scrollToBottom();
  }

  /**
   * Handle agent message chunk (final response)
   */
  onMessageChunk(content: acp.ContentBlock): void {
    if (content.type !== "text") return;

    const rawText = content.text ?? "";

    // Finalize thinking block if exists
    if (this.currentThinkingBlock) {
      this.currentThinkingBlock.complete();
      this.currentThinkingBlock = null;
    }

    // Add paragraph break if needed (after tool call)
    if (this.needsParagraphBreak && rawText.trim()) {
      this.pendingText += "\n\n";
      this.needsParagraphBreak = false;
    }

    // Batch text updates for performance
    this.pendingText += rawText;

    if (!this.updateScheduled) {
      this.updateScheduled = true;
      requestAnimationFrame(() => {
        this.currentAssistantMessage += this.pendingText;
        this.pendingText = "";
        this.updateScheduled = false;
        this.updateStreamingMessage();
      });
    }
  }

  /**
   * Handle new tool call
   */
  onToolCall(toolCall: acp.ToolCall & { sessionUpdate: "tool_call" }): void {
    const toolCallId = toolCall.toolCallId ?? `tool-${Date.now()}`;

    // Mark that we need paragraph break after tool call
    this.needsParagraphBreak = true;

    // Create tool card
    const card = new ToolCallCard(this.messagesContainer, toolCall, this.app, {
      onViewDiff: (diff) => this.showDiffModal(diff),
    });

    this.toolCallCards.set(toolCallId, card);
    this.scrollToBottom();
  }

  /**
   * Handle tool call update
   */
  onToolCallUpdate(update: acp.ToolCallUpdate & { sessionUpdate: "tool_call_update" }): void {
    const toolCallId = update.toolCallId ?? "";
    const card = this.toolCallCards.get(toolCallId);

    if (card) {
      card.update(update);
    } else {
      console.warn(`[ChatView] Tool call not found: ${toolCallId}`);
    }

    this.scrollToBottom();
  }

  /**
   * Handle plan update
   */
  onPlan(plan: acp.Plan & { sessionUpdate: "plan" }): void {
    // Create or update plan display
    let planEl = this.messagesContainer.querySelector(".plan-view") as HTMLElement;

    if (!planEl) {
      planEl = this.messagesContainer.createDiv({ cls: "plan-view" });
    }

    planEl.empty();

    const header = planEl.createDiv({ cls: "plan-header" });
    header.setText("📋 Plan");

    const entries = planEl.createDiv({ cls: "plan-entries" });

    for (const entry of plan.entries) {
      const entryEl = entries.createDiv({ cls: `plan-entry plan-entry-${entry.status}` });

      // Status icon based on PlanEntryStatus: "pending" | "in_progress" | "completed"
      const statusIcon = entry.status === "completed" ? "✅" :
                        entry.status === "in_progress" ? "🔄" : "⏳";

      const iconEl = entryEl.createSpan({ cls: "plan-entry-icon" });
      iconEl.setText(statusIcon);

      const titleEl = entryEl.createSpan({ cls: "plan-entry-title" });
      titleEl.setText(entry.content);
    }

    this.scrollToBottom();
  }

  /**
   * Handle permission request with inline card
   */
  async onPermissionRequest(request: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
    // Create inline permission card
    const card = new PermissionCard(this.messagesContainer, request);
    this.activePermissionCards.push(card);
    this.scrollToBottom();

    // Wait for user response
    const response = await card.waitForResponse();

    // Remove from active cards
    const index = this.activePermissionCards.indexOf(card);
    if (index > -1) {
      this.activePermissionCards.splice(index, 1);
    }

    return response;
  }

  // ===== Legacy Methods (for backward compatibility) =====

  /**
   * @deprecated Use onMessageChunk instead
   */
  appendAssistantMessage(text: string): void {
    this.currentAssistantMessage += text;
    this.updateStreamingMessage();
  }

  /**
   * Called when assistant response is complete
   */
  completeAssistantMessage(): void {
    // Finalize thinking block if exists
    if (this.currentThinkingBlock) {
      this.currentThinkingBlock.complete();
      this.currentThinkingBlock = null;
    }

    // Finalize streaming message - render markdown now
    if (this.currentAssistantMessage) {
      this.finalizeStreamingMessage();

      this.messages.push({
        role: "assistant",
        content: this.currentAssistantMessage,
        timestamp: new Date(),
      });

      this.currentAssistantMessage = "";
      this.currentStreamingEl = null;
    }

    this.updateStatus("connected");
  }

  // ===== Private Methods =====

  private updateStreamingMessage(): void {
    // Find or create streaming message element
    if (!this.currentStreamingEl) {
      this.currentStreamingEl = this.messagesContainer.createDiv({
        cls: "message message-assistant message-streaming",
      });

      // Copy button for streaming message
      const copyBtn = this.currentStreamingEl.createEl("button", { cls: "message-copy-btn" });
      copyBtn.setText("📋");
      copyBtn.setAttribute("aria-label", "Copy message");
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.copyToClipboard(this.currentAssistantMessage);
      });

      // Create a content block div
      this.currentStreamingEl.createDiv({ cls: "message-content" });
    }

    const contentEl = this.currentStreamingEl.querySelector(".message-content") as HTMLElement;
    if (!contentEl) return;

    // BMO pattern: Re-render entire accumulated message through temp container
    const tempContainer = document.createElement("div");

    MarkdownRenderer.render(
      this.app,
      this.currentAssistantMessage,
      tempContainer,
      "",
      this
    );

    // Clear and transfer content
    contentEl.empty();
    while (tempContainer.firstChild) {
      contentEl.appendChild(tempContainer.firstChild);
    }

    // Collapse long code blocks
    collapseCodeBlocks(contentEl, this.app);

    this.scrollToBottom();
  }

  private finalizeStreamingMessage(): void {
    if (!this.currentStreamingEl) return;

    // Remove streaming class
    this.currentStreamingEl.removeClass("message-streaming");
  }

  private addMessage(message: Message): void {
    this.messages.push(message);

    const messageEl = this.messagesContainer.createDiv({
      cls: `message message-${message.role}`,
    });

    // Copy button
    const copyBtn = messageEl.createEl("button", { cls: "message-copy-btn" });
    copyBtn.setText("📋");
    copyBtn.setAttribute("aria-label", "Copy message");
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.copyToClipboard(message.content);
    });

    // Content container
    const contentEl = messageEl.createDiv({ cls: "message-content" });

    // Render content with markdown
    MarkdownRenderer.render(
      this.app,
      message.content,
      contentEl,
      "",
      this
    );

    // Collapse long code blocks in assistant messages
    if (message.role === "assistant") {
      collapseCodeBlocks(contentEl, this.app);
    }

    this.scrollToBottom();
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here
      console.log("[ChatView] Copied to clipboard");
    } catch (err) {
      console.error("[ChatView] Failed to copy:", err);
    }
  }

  private copyAllChat(): void {
    const chatText = this.messages
      .map((m) => `[${m.role.toUpperCase()}]\n${m.content}`)
      .join("\n\n---\n\n");

    this.copyToClipboard(chatText);
  }

  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  private showDiffModal(diff: acp.Diff): void {
    // For now, just log. Full modal will be added later.
    console.log("[ChatView] Show diff modal:", diff.path);
    // TODO: Implement DiffModal
  }

  updateStatus(status: "disconnected" | "connecting" | "connected" | "thinking"): void {
    this.statusIndicator.empty();
    this.statusIndicator.removeClass("status-disconnected", "status-connecting", "status-connected", "status-thinking");
    this.statusIndicator.addClass(`status-${status}`);

    const statusText: Record<string, string> = {
      disconnected: "Disconnected",
      connecting: "Connecting...",
      connected: "Connected",
      thinking: "Thinking...",
    };

    this.statusIndicator.setText(statusText[status]);
  }
}
