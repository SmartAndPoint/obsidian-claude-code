import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon } from "obsidian";
import type ClaudeCodePlugin from "../main";

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
  private currentAssistantMessage: string = "";

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
    // Cleanup if needed
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

    // Start streaming response
    this.currentAssistantMessage = "";
    this.updateStatus("thinking");

    try {
      await this.plugin.sendMessage(text);
    } catch (error) {
      this.addMessage({
        role: "assistant",
        content: `❌ Error: ${(error as Error).message}`,
        timestamp: new Date(),
      });
    }
  }

  // Called by plugin when receiving message chunks
  appendAssistantMessage(text: string): void {
    this.currentAssistantMessage += text;
    this.updateStreamingMessage();
  }

  // Called when assistant message is complete
  completeAssistantMessage(): void {
    if (this.currentAssistantMessage) {
      this.messages.push({
        role: "assistant",
        content: this.currentAssistantMessage,
        timestamp: new Date(),
      });
      this.currentAssistantMessage = "";
    }
    this.updateStatus("connected");
  }

  private updateStreamingMessage(): void {
    // Find or create streaming message element
    let streamingEl = this.messagesContainer.querySelector(".message-streaming");

    if (!streamingEl) {
      streamingEl = this.messagesContainer.createDiv({ cls: "message message-assistant message-streaming" });
    }

    // Render markdown content
    streamingEl.empty();
    MarkdownRenderer.render(
      this.app,
      this.currentAssistantMessage,
      streamingEl as HTMLElement,
      "",
      this
    );

    this.scrollToBottom();
  }

  private addMessage(message: Message): void {
    this.messages.push(message);

    const messageEl = this.messagesContainer.createDiv({
      cls: `message message-${message.role}`,
    });

    // Render content with markdown
    MarkdownRenderer.render(
      this.app,
      message.content,
      messageEl,
      "",
      this
    );

    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
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

  onToolCall(title: string, status: string): void {
    // Add tool call indicator to current streaming message
    const toolIndicator = `\n\n🔧 **${title}**: ${status}\n\n`;
    this.appendAssistantMessage(toolIndicator);
  }
}
