import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon, MarkdownView } from "obsidian";
import type ClaudeCodePlugin from "../main";
import type * as acp from "@agentclientprotocol/sdk";
import { TFile } from "obsidian";
import { ThinkingBlock, ToolCallCard, PermissionCard, collapseCodeBlocks, FileSuggest, resolveFileReferences, SelectionChipsContainer, formatAgentPaths, DiffModal } from "../components";

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

  // Pending Edit tool calls by file path (for batching)
  private pendingEditsByFile: Map<string, Array<{
    toolCallId: string;
    toolCall: acp.ToolCall;
    card: ToolCallCard;
  }>> = new Map();

  // Pending permission requests by file (for batching)
  private pendingPermissionsByFile: Map<string, Array<{
    request: acp.RequestPermissionRequest;
    resolve: (response: acp.RequestPermissionResponse) => void;
  }>> = new Map();

  // Auto-approved files: once user approves one edit, auto-approve rest for same file
  private autoApprovedFiles: Map<string, acp.RequestPermissionResponse> = new Map();

  // Active permission cards (for cleanup)
  private activePermissionCards: PermissionCard[] = [];

  // Batch update for streaming performance
  private pendingText: string = "";
  private updateScheduled: boolean = false;

  // Flag to add paragraph break after tool call
  private needsParagraphBreak: boolean = false;

  // File suggestion for [[ syntax
  private fileSuggest: FileSuggest | null = null;

  // Selection chips for Cmd+L
  private selectionChips: SelectionChipsContainer | null = null;

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
    await Promise.resolve(); // Required for Obsidian View interface
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
    connectBtn.addEventListener("click", () => void this.handleConnect());

    // Messages container
    this.messagesContainer = container.createDiv({ cls: "chat-messages" });

    // Input container
    this.inputContainer = container.createDiv({ cls: "chat-input-container" });

    // Selection chips container (for Cmd+L selections)
    this.selectionChips = new SelectionChipsContainer(
      this.inputContainer,
      (id) => {
        // When chip is removed, remove `@N` from textarea
        this.removeSelectionMarker(id);
      }
    );

    // Input row (textarea + send button)
    const inputRow = this.inputContainer.createDiv({ cls: "chat-input-row" });

    this.textarea = inputRow.createEl("textarea", {
      cls: "chat-input",
      attr: { placeholder: "Ask Claude Code..." },
    });

    this.textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        // Don't send if file suggest is open (let it handle Enter)
        if (this.fileSuggest?.isSuggestOpen()) {
          return;
        }
        e.preventDefault();
        this.handleSend();
      }
    });

    // Auto-resize textarea and sync chips
    this.textarea.addEventListener("input", () => {
      this.textarea.style.setProperty("--chat-input-height", "auto");
      this.textarea.style.setProperty("--chat-input-height", Math.min(this.textarea.scrollHeight, 200) + "px");

      // Sync chips with text - remove orphaned chips
      this.syncChipsWithText();
    });

    this.sendButton = inputRow.createEl("button", { cls: "chat-send-btn" });
    setIcon(this.sendButton, "send");
    this.sendButton.addEventListener("click", () => void this.handleSend());

    // File suggestion for [[ syntax
    this.fileSuggest = new FileSuggest(
      this.app,
      this.inputContainer,
      this.textarea,
      (path) => {
        // Optional: could show a notification or log
        console.debug(`[FileSuggest] Selected: ${path}`);
      }
    );

    // Setup drag & drop for files
    this.setupDropZone(inputRow);

    // Welcome message
    this.addMessage({
      role: "assistant",
      content: "Welcome! Click the plug icon to connect to Claude Code, then start chatting.",
      timestamp: new Date(),
    });
  }

  async onClose(): Promise<void> {
    await Promise.resolve(); // Required for Obsidian View interface
    // Cancel any pending permission requests
    for (const card of this.activePermissionCards) {
      card.cancel();
    }
    this.activePermissionCards = [];

    // Cleanup FileSuggest
    this.fileSuggest?.destroy();
    this.fileSuggest = null;

    // Cleanup SelectionChips
    this.selectionChips?.destroy();
    this.selectionChips = null;

    // Cleanup
    this.toolCallCards.clear();
    this.pendingEditsByFile.clear();
    this.pendingPermissionsByFile.clear();
    this.autoApprovedFiles.clear();
    for (const timer of this.permissionBatchTimers.values()) {
      clearTimeout(timer);
    }
    this.permissionBatchTimers.clear();
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

    // Format text for display (replace @N with [[file]] links)
    let displayText = text;
    if (this.selectionChips) {
      displayText = this.selectionChips.formatMarkersForDisplay(text);
    }

    // Add user message with formatted display
    this.addMessage({
      role: "user",
      content: displayText,
      timestamp: new Date(),
    });

    // Clear input and selection chips
    this.textarea.value = "";
    this.textarea.style.setProperty("--chat-input-height", "auto");

    // Reset streaming state
    this.resetStreamingState();
    this.updateStatus("thinking");

    // Get vault path for resolving files
    const vaultPath = (this.app.vault.adapter as unknown as { basePath: string }).basePath;

    // Resolve [[file]] references to full paths (for agent)
    let resolvedText = resolveFileReferences(text, this.app);

    // Resolve @N selection markers to full paths (for agent)
    if (this.selectionChips) {
      resolvedText = this.selectionChips.resolveMarkers(resolvedText, vaultPath);
    }

    // Clear chips after sending
    this.selectionChips?.clear();

    try {
      await this.plugin.sendMessage(resolvedText);
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
    this.pendingEditsByFile.clear();
    this.pendingPermissionsByFile.clear();
    this.autoApprovedFiles.clear();
    for (const timer of this.permissionBatchTimers.values()) {
      clearTimeout(timer);
    }
    this.permissionBatchTimers.clear();
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

    // Reset streaming element so next text appears AFTER the tool card
    // This fixes the issue where text was appearing before tool cards
    if (this.currentStreamingEl) {
      this.currentStreamingEl.removeClass("message-streaming");
      this.currentStreamingEl = null;
    }

    // Create tool card
    const card = new ToolCallCard(this.messagesContainer, toolCall, this.app, {
      onViewDiff: (diff) => this.showDiffModal(diff),
    });

    this.toolCallCards.set(toolCallId, card);

    // Track Edit tool calls by file path for batching
    console.debug(`[ChatView] onToolCall kind: ${toolCall.kind}, locations:`, toolCall.locations, `content:`, toolCall.content);
    if (toolCall.kind === "edit" && toolCall.locations && toolCall.locations.length > 0) {
      const filePath = toolCall.locations[0].path;
      if (filePath) {
        if (!this.pendingEditsByFile.has(filePath)) {
          this.pendingEditsByFile.set(filePath, []);
        }
        this.pendingEditsByFile.get(filePath)!.push({
          toolCallId,
          toolCall,
          card,
        });
        console.debug(`[ChatView] Tracking Edit for ${filePath}, total: ${this.pendingEditsByFile.get(filePath)!.length}`);
      }
    }

    this.scrollToBottom();
  }

  /**
   * Handle tool call update
   */
  onToolCallUpdate(update: acp.ToolCallUpdate & { sessionUpdate: "tool_call_update" }): void {
    const toolCallId = update.toolCallId ?? "";
    console.debug(`[ChatView] onToolCallUpdate:`, { toolCallId, status: update.status, content: update.content });
    const card = this.toolCallCards.get(toolCallId);

    if (card) {
      card.update(update);
    } else {
      console.warn(`[ChatView] Tool call not found: ${toolCallId}`);
    }

    // Remove completed Edit from pending tracking
    if (update.status === "completed" || update.status === "failed") {
      this.removeFromPendingEdits(toolCallId);
    }

    this.scrollToBottom();
  }

  /**
   * Remove a tool call from pending edits tracking
   */
  private removeFromPendingEdits(toolCallId: string): void {
    for (const [filePath, edits] of this.pendingEditsByFile.entries()) {
      const idx = edits.findIndex(e => e.toolCallId === toolCallId);
      if (idx !== -1) {
        edits.splice(idx, 1);
        console.debug(`[ChatView] Removed Edit ${toolCallId} from ${filePath}, remaining: ${edits.length}`);
        if (edits.length === 0) {
          this.pendingEditsByFile.delete(filePath);
        }
        break;
      }
    }
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

  // Batch permission debounce timers by file
  private permissionBatchTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Handle permission request with auto-approve for same file
   *
   * Since ACP sends permission requests sequentially (waits for response before next),
   * we use auto-approve: first approval for a file auto-approves subsequent edits.
   */
  async onPermissionRequest(request: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
    const toolCall = request.toolCall;

    // Extract file path from locations or parse from title
    let filePath = toolCall.locations?.[0]?.path;
    let isEditPermission = toolCall.kind === "edit";

    // Parse from title if not available in structured fields
    // Title format: "Edit `/path/to/file`" or "Edit `path`"
    if (!filePath && toolCall.title) {
      const editMatch = toolCall.title.match(/^Edit\s+`([^`]+)`/);
      if (editMatch) {
        filePath = editMatch[1];
        isEditPermission = true;
      }
    }

    // Debug: log full toolCall structure
    console.debug(`[ChatView] Permission toolCall full:`, JSON.stringify(toolCall, null, 2));

    // Check if this file was already approved in this session
    if (isEditPermission && filePath && this.autoApprovedFiles.has(filePath)) {
      const cachedResponse = this.autoApprovedFiles.get(filePath)!;
      console.debug(`[ChatView] Auto-approving edit for ${filePath}`);
      return cachedResponse;
    }

    // Check if this is an Edit with multiple pending changes
    const pendingEdits = filePath ? this.pendingEditsByFile.get(filePath) : undefined;
    const totalChanges = pendingEdits?.length ?? 1;

    if (isEditPermission && filePath && totalChanges > 1) {
      return this.handleMultiEditPermission(request, filePath, totalChanges);
    }

    // Standard single permission flow
    return this.handleSinglePermission(request);
  }

  /**
   * Handle permission for file with multiple pending edits
   * Shows "(1 of N)" and stores approval for auto-approve of rest
   */
  private async handleMultiEditPermission(
    request: acp.RequestPermissionRequest,
    filePath: string,
    totalChanges: number
  ): Promise<acp.RequestPermissionResponse> {
    // Create a modified request that shows the count
    const modifiedRequest: acp.RequestPermissionRequest = {
      ...request,
      toolCall: {
        ...request.toolCall,
        title: `Edit \`${filePath}\` (1 of ${totalChanges} changes)`,
      },
    };

    console.debug(`[ChatView] Showing permission for ${filePath}: 1 of ${totalChanges}`);

    const card = new PermissionCard(this.messagesContainer, modifiedRequest);
    this.activePermissionCards.push(card);
    this.scrollToBottom();

    const response = await card.waitForResponse();

    const index = this.activePermissionCards.indexOf(card);
    if (index > -1) {
      this.activePermissionCards.splice(index, 1);
    }

    // Check if user approved (selected an "allow" option)
    const selectedOptionId = response.outcome?.outcome === "selected" ? response.outcome.optionId : null;
    const selectedOption = selectedOptionId
      ? modifiedRequest.options.find(o => o.optionId === selectedOptionId)
      : null;
    const isApproved = selectedOption?.kind?.includes("allow") ?? false;

    // If approved, store for auto-approve of subsequent edits
    if (isApproved) {
      console.debug(`[ChatView] Storing auto-approve for ${filePath}`);
      this.autoApprovedFiles.set(filePath, response);
    }

    return response;
  }

  /**
   * Handle single permission request (non-edit or single edit)
   */
  private async handleSinglePermission(request: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
    const card = new PermissionCard(this.messagesContainer, request);
    this.activePermissionCards.push(card);
    this.scrollToBottom();

    const response = await card.waitForResponse();

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
      setIcon(copyBtn, "copy");
      copyBtn.setAttribute("aria-label", "Copy message");
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.copyToClipboard(this.currentAssistantMessage);
      });

      // Create a content block div
      this.currentStreamingEl.createDiv({ cls: "message-content" });
    }

    const contentEl = this.currentStreamingEl.querySelector(".message-content") as HTMLElement;
    if (!contentEl) return;

    // Format agent paths to [[file]] links before rendering
    const formattedMessage = formatAgentPaths(this.app, this.currentAssistantMessage);

    // BMO pattern: Re-render entire accumulated message through temp container
    const tempContainer = document.createElement("div");

    MarkdownRenderer.render(
      this.app,
      formattedMessage,
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

    // Make [[file]] links clickable
    this.makeLinksClickable(contentEl);

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
    setIcon(copyBtn, "copy");
    copyBtn.setAttribute("aria-label", "Copy message");
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.copyToClipboard(message.content);
    });

    // Content container
    const contentEl = messageEl.createDiv({ cls: "message-content" });

    // Format content - convert agent paths for assistant messages
    const displayContent = message.role === "assistant"
      ? formatAgentPaths(this.app, message.content)
      : message.content;

    // Render content with markdown
    MarkdownRenderer.render(
      this.app,
      displayContent,
      contentEl,
      "",
      this
    );

    // Make [[file]] links clickable
    this.makeLinksClickable(contentEl);

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
      console.debug("[ChatView] Copied to clipboard");
    } catch (err) {
      console.error("[ChatView] Failed to copy:", err);
    }
  }

  private copyAllChat(): void {
    const chatText = this.messages
      .map((m) => `[${m.role.toUpperCase()}]\n${m.content}`)
      .join("\n\n---\n\n");

    void this.copyToClipboard(chatText);
  }

  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Make [[file]] internal links clickable, with line selection support
   */
  private makeLinksClickable(container: HTMLElement): void {
    const links = container.querySelectorAll("a.internal-link");

    links.forEach((link) => {
      const href = link.getAttribute("data-href") || link.getAttribute("href");
      if (!href) return;

      // Check if followed by (line X) or (lines X-Y)
      let startLine: number | null = null;
      let endLine: number | null = null;

      const nextNode = link.nextSibling;
      if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
        const text = nextNode.textContent || "";
        // Match (line 10) or (lines 10-20)
        const lineMatch = text.match(/^\s*\(lines?\s+(\d+)(?:-(\d+))?\)/);
        if (lineMatch) {
          startLine = parseInt(lineMatch[1], 10);
          endLine = lineMatch[2] ? parseInt(lineMatch[2], 10) : startLine;
        }
      }

      link.addEventListener("click", (e) => {
        e.preventDefault();

        // Try to find the file in vault
        const file = this.app.metadataCache.getFirstLinkpathDest(href, "");

        if (file) {
          // Capture values for setTimeout closure
          const capturedStartLine = startLine;
          const capturedEndLine = endLine;

          // Open the file
          void this.app.workspace.openLinkText(href, "", false).then(() => {
            // If we have line info, scroll to and select those lines
            if (capturedStartLine !== null && capturedEndLine !== null) {
              // Small delay to ensure file is loaded
              setTimeout(() => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView && activeView.editor) {
                  const editor = activeView.editor;
                  // Lines are 0-indexed in CodeMirror
                  const from = { line: capturedStartLine - 1, ch: 0 };
                  const to = { line: capturedEndLine, ch: 0 };

                  // Scroll to line and select
                  editor.setSelection(from, to);
                  editor.scrollIntoView({ from, to }, true);
                }
              }, 100);
            }
          });
        } else {
          console.debug(`[ChatView] File not found: ${href}`);
        }
      });
    });
  }

  private showDiffModal(diff: acp.Diff): void {
    const modal = new DiffModal(this.app, diff, {
      onApply: (newText: string) => {
        // Apply changes directly via Obsidian API
        if (diff.path) {
          // Get relative path from full path
          const vaultPath = (this.app.vault.adapter as unknown as { basePath: string }).basePath;
          let relativePath = diff.path;
          if (vaultPath && diff.path.startsWith(vaultPath)) {
            relativePath = diff.path.slice(vaultPath.length);
            if (relativePath.startsWith('/')) {
              relativePath = relativePath.slice(1);
            }
          }

          const file = this.app.vault.getAbstractFileByPath(relativePath);
          if (file instanceof TFile) {
            void this.app.vault.modify(file, newText).then(() => {
              console.debug(`[ChatView] Applied diff to ${relativePath}`);
            }).catch((err) => {
              console.error("[ChatView] Failed to apply diff:", err);
            });
          } else {
            console.error(`[ChatView] File not found: ${relativePath}`);
          }
        }
      },
      onReject: () => {
        console.debug("[ChatView] Diff rejected");
      }
    });
    modal.open();
  }

  updateStatus(status: "disconnected" | "connecting" | "connected" | "thinking", message?: string): void {
    this.statusIndicator.empty();
    this.statusIndicator.removeClass("status-disconnected", "status-connecting", "status-connected", "status-thinking");
    this.statusIndicator.addClass(`status-${status}`);

    const statusText: Record<string, string> = {
      disconnected: "Disconnected",
      connecting: "Connecting...",
      connected: "Connected",
      thinking: "Thinking...",
    };

    // Use custom message if provided, otherwise default
    this.statusIndicator.setText(message || statusText[status]);
  }

  // ===== Selection Methods (Cmd+L) =====

  /**
   * Add a code selection from editor (called via Cmd+L command)
   */
  addSelection(file: TFile, startLine: number, endLine: number, text: string): void {
    if (!this.selectionChips) return;

    // Add chip and get ID
    const id = this.selectionChips.addSelection(file, startLine, endLine, text);

    // Insert @N marker at cursor position in textarea
    const cursorPos = this.textarea.selectionStart ?? this.textarea.value.length;
    const before = this.textarea.value.slice(0, cursorPos);
    const after = this.textarea.value.slice(cursorPos);

    // Add space before if needed
    const needsSpaceBefore = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
    const needsSpaceAfter = after.length > 0 && !after.startsWith(" ") && !after.startsWith("\n");

    const marker = `${needsSpaceBefore ? " " : ""}\`@${id}\`${needsSpaceAfter ? " " : ""}`;

    this.textarea.value = before + marker + after;

    // Move cursor after marker
    const newPos = cursorPos + marker.length;
    this.textarea.setSelectionRange(newPos, newPos);

    // Focus textarea
    this.textarea.focus();

    // Trigger resize
    this.textarea.dispatchEvent(new Event("input"));
  }

  /**
   * Remove `@N` marker from textarea when chip is removed
   */
  private removeSelectionMarker(id: number): void {
    // Remove `@N` from text (with possible surrounding spaces)
    this.textarea.value = this.textarea.value
      .replace(new RegExp(`\\s*\`@${id}\`\\s*`, "g"), " ")
      .replace(/\s+/g, " ")
      .trim();

    // Trigger resize (but don't re-sync to avoid loop)
    this.textarea.style.setProperty("--chat-input-height", "auto");
    this.textarea.style.setProperty("--chat-input-height", Math.min(this.textarea.scrollHeight, 200) + "px");
  }

  /**
   * Sync chips with text - hide/show chips based on marker presence (supports undo)
   */
  private syncChipsWithText(): void {
    if (!this.selectionChips) return;

    const text = this.textarea.value;

    // Find all `@N` markers in text
    const visibleIds = new Set<number>();
    const markerRegex = /`@(\d+)`/g;
    let match;
    while ((match = markerRegex.exec(text)) !== null) {
      visibleIds.add(parseInt(match[1], 10));
    }

    // Sync chip visibility
    this.selectionChips.syncVisibility(visibleIds);
  }

  // ===== Drag & Drop Methods =====

  /**
   * Setup drag & drop zone for files
   */
  private setupDropZone(dropZone: HTMLElement): void {
    // Prevent default drag behavior
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.addClass("drop-zone-active");
    });

    dropZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.removeClass("drop-zone-active");
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.removeClass("drop-zone-active");

      const textData = e.dataTransfer?.getData("text/plain") ?? "";

      // Try to find file by various path formats
      let file: TFile | null = null;

      // Parse obsidian:// URL format
      // Example: obsidian://open?vault=tbank&file=RecSys%2FCanGen%20Store%2FNote
      if (textData.startsWith("obsidian://")) {
        try {
          const url = new URL(textData);
          const fileParam = url.searchParams.get("file");
          if (fileParam) {
            const filePath = decodeURIComponent(fileParam);
            const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
            if (abstractFile instanceof TFile) {
              file = abstractFile;
            } else {
              // Try with .md extension
              const abstractFileMd = this.app.vault.getAbstractFileByPath(filePath + ".md");
              if (abstractFileMd instanceof TFile) {
                file = abstractFileMd;
              }
            }
          }
        } catch {
          // Not a valid URL
        }
      }

      // Fallback: try direct path
      if (!file && textData && !textData.startsWith("obsidian://")) {
        const abstractFile = this.app.vault.getAbstractFileByPath(textData);
        if (abstractFile instanceof TFile) {
          file = abstractFile;
        }
      }

      if (file) {
        this.addFile(file);
        return;
      }

      // External file drops not supported
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        console.debug("[ChatView] External file drop not supported, use files from vault");
      }
    });
  }

  /**
   * Add a file from drag & drop
   */
  addFile(file: TFile): void {
    if (!this.selectionChips) return;

    // Add chip and get ID
    const id = this.selectionChips.addFile(file);

    // Insert @N marker at cursor position in textarea
    const cursorPos = this.textarea.selectionStart ?? this.textarea.value.length;
    const before = this.textarea.value.slice(0, cursorPos);
    const after = this.textarea.value.slice(cursorPos);

    // Add space before if needed
    const needsSpaceBefore = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
    const needsSpaceAfter = after.length > 0 && !after.startsWith(" ") && !after.startsWith("\n");

    const marker = `${needsSpaceBefore ? " " : ""}\`@${id}\`${needsSpaceAfter ? " " : ""}`;

    this.textarea.value = before + marker + after;

    // Move cursor after marker
    const newPos = cursorPos + marker.length;
    this.textarea.setSelectionRange(newPos, newPos);

    // Focus textarea
    this.textarea.focus();

    // Trigger resize
    this.textarea.dispatchEvent(new Event("input"));
  }
}
