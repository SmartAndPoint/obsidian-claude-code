import {
  ItemView,
  WorkspaceLeaf,
  MarkdownRenderer,
  setIcon,
  MarkdownView,
  Modal,
  Setting,
} from "obsidian";
import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import type ClaudeCodePlugin from "../main";
import type { ContentBlock, Diff, PromptContent, SendMessageOptions } from "../acp-core";
import type {
  ToolCallData,
  ToolCallUpdateData,
  PlanData,
  PermissionRequestParams,
  PermissionResponseParams,
} from "../acpClient";
import { TFile } from "obsidian";
import {
  ThinkingBlock,
  ToolCallCard,
  PermissionCard,
  collapseCodeBlocks,
  FileSuggest,
  CommandSuggest,
  resolveFileReferences,
  extractWikilinks,
  SelectionChipsContainer,
  formatAgentPaths,
  DiffModal,
  SessionPickerModal,
} from "../components";
import { VaultSessionService } from "../services/VaultSessionService";

/**
 * Set CSS custom properties on an element
 */
function setCssProps(el: HTMLElement, props: Record<string, string>): void {
  for (const [key, value] of Object.entries(props)) {
    el.style.setProperty(key, value);
  }
}

export const CHAT_VIEW_TYPE = "claude-code-chat";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

/**
 * Session state for hybrid session management
 * - disconnected: Not connected to Claude
 * - live: Claude remembers the conversation context
 * - history-only: Showing history, but Claude doesn't remember (resume failed)
 * - resuming: Attempting to resume Claude session
 */
type SessionState = "disconnected" | "live" | "history-only" | "resuming";

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
  private pendingEditsByFile: Map<
    string,
    Array<{
      toolCallId: string;
      toolCall: ToolCallData & { sessionUpdate: "tool_call" };
      card: ToolCallCard;
    }>
  > = new Map();

  // Pending permission requests by file (for batching)
  private pendingPermissionsByFile: Map<
    string,
    Array<{
      request: PermissionRequestParams;
      resolve: (response: PermissionResponseParams) => void;
    }>
  > = new Map();

  // Auto-approved files: once user approves one edit, auto-approve rest for same file
  private autoApprovedFiles: Map<string, PermissionResponseParams> = new Map();

  // Active permission cards (for cleanup)
  private activePermissionCards: PermissionCard[] = [];

  // Tool call titles for current response (for session tracking)
  private currentToolCallTitles: string[] = [];

  // Batch update for streaming performance
  private pendingText: string = "";
  private updateScheduled: boolean = false;

  // Flag to add paragraph break after tool call
  private needsParagraphBreak: boolean = false;

  // File suggestion for [[ syntax
  private fileSuggest: FileSuggest | null = null;

  // Command suggestion for / syntax
  private commandSuggest: CommandSuggest | null = null;

  // Selection chips for Cmd+L
  private selectionChips: SelectionChipsContainer | null = null;

  // Session management
  private sessionService: VaultSessionService;
  private currentVaultSessionId: string | null = null;
  private sessionInfoEl: HTMLElement | null = null;
  private sessionState: SessionState = "disconnected";
  private historyBannerEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ClaudeCodePlugin) {
    super(leaf);
    this.plugin = plugin;
    this.sessionService = new VaultSessionService(this.app);
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Claude";
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
    const titleRow = header.createDiv({ cls: "chat-title-row" });
    const title = titleRow.createDiv({ cls: "chat-title" });
    title.setText("Claude");

    // Session info (shown when session is active)
    this.sessionInfoEl = titleRow.createDiv({ cls: "chat-session-info is-hidden" });

    this.statusIndicator = header.createDiv({ cls: "chat-status" });
    this.updateStatus("disconnected");

    // Copy all button
    const copyAllBtn = header.createEl("button", { cls: "chat-copy-all-btn" });
    setIcon(copyAllBtn, "copy");
    copyAllBtn.setAttribute("aria-label", "Copy entire chat");
    copyAllBtn.addEventListener("click", () => this.copyAllChat());

    // Sessions button
    const sessionsBtn = header.createEl("button", { cls: "chat-sessions-btn" });
    setIcon(sessionsBtn, "list");
    sessionsBtn.setAttribute("aria-label", "Browse sessions");
    sessionsBtn.addEventListener("click", () => void this.showSessionPicker());

    // Connect button
    const connectBtn = header.createEl("button", { cls: "chat-connect-btn" });
    setIcon(connectBtn, "plug");
    connectBtn.addEventListener("click", () => void this.handleConnect());

    // History-only banner (shown when Claude doesn't remember the session)
    this.createHistoryBanner(container as HTMLElement);

    // Messages container
    this.messagesContainer = container.createDiv({ cls: "chat-messages" });

    // Input container
    this.inputContainer = container.createDiv({ cls: "chat-input-container" });

    // Selection chips container (for Cmd+L selections)
    this.selectionChips = new SelectionChipsContainer(this.inputContainer, (id) => {
      // When chip is removed, remove `@N` from textarea
      this.removeSelectionMarker(id);
    });

    // Input row (textarea + send button)
    const inputRow = this.inputContainer.createDiv({ cls: "chat-input-row" });

    this.textarea = inputRow.createEl("textarea", {
      cls: "chat-input",
      attr: { placeholder: "Type a message..." },
    });

    this.textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        // Don't send if suggest dropdown is open (let it handle Enter)
        if (this.fileSuggest?.isSuggestOpen() || this.commandSuggest?.isSuggestOpen()) {
          return;
        }
        e.preventDefault();
        void this.handleSend();
      }
    });

    // Handle paste (images and vault files from clipboard)
    this.textarea.addEventListener("paste", (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      // Check for pasted images
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) void this.addPastedImage(blob, item.type);
          return;
        }
      }

      // Check for files from OS clipboard (Finder/Explorer copy)
      // Use Electron clipboard API to read file paths on macOS
      if (this.selectionChips) {
        try {
          // On macOS, resolve file path from clipboard via AppleScript
          // clipboard.read("public.file-url") returns file reference IDs, not real paths
          const result = execSync("osascript -e 'POSIX path of (the clipboard as «class furl»)'", {
            encoding: "utf-8",
            timeout: 2000,
          }).trim();
          if (result && result.startsWith("/")) {
            const filePath = result;
            e.preventDefault();
            // Check if it's a vault file
            const vaultPath = (this.app.vault.adapter as unknown as { basePath: string }).basePath;
            if (filePath.startsWith(vaultPath + "/")) {
              const relativePath = filePath.slice(vaultPath.length + 1);
              const vaultFile = this.app.vault.getAbstractFileByPath(relativePath);
              if (vaultFile instanceof TFile) {
                this.addFile(vaultFile);
                return;
              }
            }
            this.addExternalFile(filePath);
            return;
          }
        } catch {
          // Electron clipboard not available, fall through
        }
      }

      // Check for file paths in pasted text
      const pastedText = e.clipboardData?.getData("text/plain")?.trim();
      if (pastedText) {
        // Check vault file first
        const abstractFile = this.app.vault.getAbstractFileByPath(pastedText);
        if (abstractFile instanceof TFile) {
          e.preventDefault();
          this.addFile(abstractFile);
          return;
        }

        // Check external absolute path (starts with / on macOS/Linux or drive letter on Windows)
        if (
          (pastedText.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(pastedText)) &&
          this.selectionChips
        ) {
          try {
            if (existsSync(pastedText) && statSync(pastedText).isFile()) {
              e.preventDefault();
              this.addExternalFile(pastedText);
              return;
            }
          } catch {
            // Not a valid path, let default paste handle it
          }
        }
      }
    });

    // Auto-resize textarea and sync chips
    this.textarea.addEventListener("input", () => {
      setCssProps(this.textarea, { "--chat-input-height": "auto" });
      setCssProps(this.textarea, {
        "--chat-input-height": Math.min(this.textarea.scrollHeight, 200) + "px",
      });

      // Sync chips with text - remove orphaned chips
      this.syncChipsWithText();
    });

    this.sendButton = inputRow.createEl("button", { cls: "chat-send-btn" });
    setIcon(this.sendButton, "send");
    this.sendButton.addEventListener("click", () => void this.handleSend());

    // File suggestion for [[ syntax
    this.fileSuggest = new FileSuggest(this.app, this.inputContainer, this.textarea, (path) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        this.addFile(file);
      }
    });

    // Command suggestion for / syntax (slash commands)
    this.commandSuggest = new CommandSuggest(
      this.inputContainer,
      this.textarea,
      (command) => {
        console.debug(`[CommandSuggest] Selected ACP command: ${command.name}`);
      },
      (command) => {
        this.handleBuiltinCommand(command);
      }
    );

    // Initialize commands from plugin if already connected
    const commands = this.plugin.getAvailableCommands();
    if (commands.length > 0) {
      this.commandSuggest.setCommands(commands);
    }

    // Setup drag & drop for files
    this.setupDropZone(inputRow);

    // Welcome message
    this.addMessage({
      role: "assistant",
      content: "Welcome! Click the plug icon to connect, then start chatting.",
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

    // Cleanup CommandSuggest
    this.commandSuggest?.destroy();
    this.commandSuggest = null;

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
      // Check for existing sessions and restore the last one
      const sessions = await this.sessionService.listSessions();

      if (sessions.length > 0 && !this.currentVaultSessionId) {
        // Load the most recent session (already sorted by updated date)
        const lastSession = sessions[0];
        console.debug(`[ChatView] Auto-restoring last session: ${lastSession.id}`);
        await this.loadExistingSession(lastSession.id);
      } else {
        // No existing sessions, just connect (session will be created on first message)
        await this.plugin.connect();
        this.updateSessionState("live");
      }
    }
  }

  private async handleSend(): Promise<void> {
    const text = this.textarea.value.trim();
    if (!text) return;

    // Handle /rename command locally (doesn't need connection)
    if (text.startsWith("/rename ")) {
      const newTitle = text.slice("/rename ".length).trim();
      await this.handleRenameCommand(newTitle);
      this.textarea.value = "";
      setCssProps(this.textarea, { "--chat-input-height": "auto" });
      return;
    }

    if (!this.plugin.isConnected()) {
      this.addMessage({
        role: "assistant",
        content: "Not connected. Click the plug icon to connect first.",
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
    setCssProps(this.textarea, { "--chat-input-height": "auto" });

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

    // Auto-create session if none exists
    if (!this.currentVaultSessionId) {
      await this.startNewSession();
      // Link Claude session ID to vault session
      const claudeSessionId = this.plugin.getSessionId();
      if (claudeSessionId) {
        await this.linkClaudeSession(claudeSessionId);
        console.debug(`[ChatView] Linked Claude session: ${claudeSessionId}`);
      }
      console.debug("[ChatView] Auto-created new session on first message");
    }

    // Track wikilinks as explicit file references (after session exists)
    const wikilinks = extractWikilinks(text, this.app);
    if (this.currentVaultSessionId && wikilinks.length > 0) {
      for (const path of wikilinks) {
        void this.sessionService.addFileReference(this.currentVaultSessionId, path, "explicit");
      }
    }

    // Save user message to session and auto-generate title on first message
    if (this.currentVaultSessionId) {
      void this.sessionService
        .appendMessage(this.currentVaultSessionId, {
          role: "user",
          content: displayText,
          timestamp: new Date(),
        })
        .then(() => this.autoGenerateSessionTitle());
    }

    try {
      // Build additional content (pasted images)
      const additionalContent: PromptContent[] = [];
      if (this.selectionChips) {
        for (const img of this.selectionChips.getAllImages()) {
          additionalContent.push({
            type: "image",
            data: img.data,
            mimeType: img.mimeType,
          });
        }
      }

      const options: SendMessageOptions | undefined =
        additionalContent.length > 0 ? { additionalContent } : undefined;
      await this.plugin.sendMessage(resolvedText, options);
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
    this.currentToolCallTitles = [];
  }

  // ===== Session Update Handlers =====

  /**
   * Handle agent thought chunk (internal reasoning)
   */
  onThoughtChunk(content: ContentBlock): void {
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
  onMessageChunk(content: ContentBlock): void {
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
  onToolCall(toolCall: ToolCallData & { sessionUpdate: "tool_call" }): void {
    const toolCallId = toolCall.toolCallId ?? `tool-${Date.now()}`;

    // Track file references from tool calls
    this.trackToolCallFiles(toolCall);

    // Track tool call title for session saving
    if (toolCall.title) {
      this.currentToolCallTitles.push(toolCall.title);
    }

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
    console.debug(
      `[ChatView] onToolCall kind: ${toolCall.kind}, locations:`,
      toolCall.locations,
      `content:`,
      toolCall.content
    );
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
        console.debug(
          `[ChatView] Tracking Edit for ${filePath}, total: ${this.pendingEditsByFile.get(filePath)!.length}`
        );
      }
    }

    this.scrollToBottom();
  }

  /**
   * Handle tool call update
   */
  onToolCallUpdate(update: ToolCallUpdateData & { sessionUpdate: "tool_call_update" }): void {
    const toolCallId = update.toolCallId ?? "";
    console.debug(`[ChatView] onToolCallUpdate:`, {
      toolCallId,
      status: update.status,
      content: update.content,
    });
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
   * Track file references from tool calls
   */
  private trackToolCallFiles(toolCall: ToolCallData): void {
    if (!this.currentVaultSessionId) return;
    if (!toolCall.locations || toolCall.locations.length === 0) return;

    const vaultPath = (this.app.vault.adapter as unknown as { basePath: string }).basePath;
    if (!vaultPath) return;

    // Determine reference type based on tool kind
    // "edit" and "delete" are write operations, others are reads
    let refType: "read" | "written" = "read";
    if (toolCall.kind === "edit" || toolCall.kind === "delete") {
      refType = "written";
    }

    for (const location of toolCall.locations) {
      if (!location.path) continue;

      // Convert full path to vault-relative path
      let relativePath = location.path;
      if (relativePath.startsWith(vaultPath)) {
        relativePath = relativePath.slice(vaultPath.length);
        if (relativePath.startsWith("/")) {
          relativePath = relativePath.slice(1);
        }
      }

      // Only track files that are in the vault
      const file = this.app.vault.getAbstractFileByPath(relativePath);
      if (file) {
        void this.sessionService.addFileReference(
          this.currentVaultSessionId,
          relativePath,
          refType
        );
      }
    }
  }

  /**
   * Remove a tool call from pending edits tracking
   */
  private removeFromPendingEdits(toolCallId: string): void {
    for (const [filePath, edits] of this.pendingEditsByFile.entries()) {
      const idx = edits.findIndex((e) => e.toolCallId === toolCallId);
      if (idx !== -1) {
        edits.splice(idx, 1);
        console.debug(
          `[ChatView] Removed Edit ${toolCallId} from ${filePath}, remaining: ${edits.length}`
        );
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
  onPlan(plan: PlanData & { sessionUpdate: "plan" }): void {
    // Create or update plan display
    let planEl = this.messagesContainer.querySelector(".plan-view") as HTMLElement;

    if (!planEl) {
      planEl = this.messagesContainer.createDiv({ cls: "plan-view" });
    }

    planEl.empty();

    const header = planEl.createDiv({ cls: "plan-header" });
    header.setText("Plan");

    const entries = planEl.createDiv({ cls: "plan-entries" });

    for (const entry of plan.entries) {
      const entryEl = entries.createDiv({ cls: `plan-entry plan-entry-${entry.status}` });

      // Status icon based on PlanEntryStatus: "pending" | "in_progress" | "completed"
      const statusIcon =
        entry.status === "completed" ? "✅" : entry.status === "in_progress" ? "🔄" : "⏳";

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
  async onPermissionRequest(request: PermissionRequestParams): Promise<PermissionResponseParams> {
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
    request: PermissionRequestParams,
    filePath: string,
    totalChanges: number
  ): Promise<PermissionResponseParams> {
    // Create a modified request that shows the count
    const modifiedRequest: PermissionRequestParams = {
      ...request,
      toolCall: {
        ...request.toolCall,
        title: `Edit \`${filePath}\` (1 of ${totalChanges} changes)`,
      },
    };

    console.debug(`[ChatView] Showing permission for ${filePath}: 1 of ${totalChanges}`);

    const card = new PermissionCard(this.messagesContainer, modifiedRequest, {
      onRedirect: (alternativeText) => {
        this.handlePermissionRedirect(alternativeText);
      },
    });
    this.activePermissionCards.push(card);
    this.scrollToBottom();

    const response = await card.waitForResponse();

    const index = this.activePermissionCards.indexOf(card);
    if (index > -1) {
      this.activePermissionCards.splice(index, 1);
    }

    // Check if user approved (selected an "allow" option)
    const selectedOptionId =
      response.outcome?.outcome === "selected" ? response.outcome.optionId : null;
    const selectedOption = selectedOptionId
      ? modifiedRequest.options.find((o) => o.optionId === selectedOptionId)
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
   * Handle permission redirect - user wants to cancel and do something else
   */
  private handlePermissionRedirect(alternativeText: string): void {
    // Add user message to show what they requested
    this.addMessage({
      role: "user",
      content: alternativeText,
      timestamp: new Date(),
    });

    // Save to session
    if (this.currentVaultSessionId) {
      void this.sessionService.appendMessage(this.currentVaultSessionId, {
        role: "user",
        content: alternativeText,
        timestamp: new Date(),
      });
    }

    // Reset streaming state for new response
    this.resetStreamingState();
    this.updateStatus("thinking");

    // Send the alternative instruction to Claude
    void this.plugin.sendMessage(alternativeText).catch((error) => {
      this.addMessage({
        role: "assistant",
        content: `❌ Error: ${(error as Error).message}`,
        timestamp: new Date(),
      });
      this.updateStatus("connected");
    });
  }

  /**
   * Handle single permission request (non-edit or single edit)
   */
  private async handleSinglePermission(
    request: PermissionRequestParams
  ): Promise<PermissionResponseParams> {
    const card = new PermissionCard(this.messagesContainer, request, {
      onRedirect: (alternativeText) => {
        this.handlePermissionRedirect(alternativeText);
      },
    });
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

      const message = {
        role: "assistant" as const,
        content: this.currentAssistantMessage,
        timestamp: new Date(),
      };

      this.messages.push(message);

      // Save assistant message to session
      if (this.currentVaultSessionId) {
        void this.sessionService.appendMessage(this.currentVaultSessionId, {
          ...message,
          toolCalls: this.currentToolCallTitles.length > 0 ? this.currentToolCallTitles : undefined,
        });
      }

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

    void MarkdownRenderer.render(this.app, formattedMessage, tempContainer, "", this);

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
    const displayContent =
      message.role === "assistant" ? formatAgentPaths(this.app, message.content) : message.content;

    // Render content with markdown
    void MarkdownRenderer.render(this.app, displayContent, contentEl, "", this);

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

  private showDiffModal(diff: Diff): void {
    const modal = new DiffModal(this.app, diff, {
      onApply: (newText: string) => {
        // Apply changes directly via Obsidian API
        if (diff.path) {
          // Get relative path from full path
          const vaultPath = (this.app.vault.adapter as unknown as { basePath: string }).basePath;
          let relativePath = diff.path;
          if (vaultPath && diff.path.startsWith(vaultPath)) {
            relativePath = diff.path.slice(vaultPath.length);
            if (relativePath.startsWith("/")) {
              relativePath = relativePath.slice(1);
            }
          }

          const file = this.app.vault.getAbstractFileByPath(relativePath);
          if (file instanceof TFile) {
            void this.app.vault
              .modify(file, newText)
              .then(() => {
                console.debug(`[ChatView] Applied diff to ${relativePath}`);
              })
              .catch((err) => {
                console.error("[ChatView] Failed to apply diff:", err);
              });
          } else {
            console.error(`[ChatView] File not found: ${relativePath}`);
          }
        }
      },
      onReject: () => {
        console.debug("[ChatView] Diff rejected");
      },
    });
    modal.open();
  }

  updateStatus(
    status: "disconnected" | "connecting" | "connected" | "thinking",
    message?: string
  ): void {
    this.statusIndicator.empty();
    this.statusIndicator.removeClass(
      "status-disconnected",
      "status-connecting",
      "status-connected",
      "status-thinking"
    );
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

  /**
   * Update available slash commands from ACP
   */
  updateAvailableCommands(commands: import("../acpClient").AvailableCommand[]): void {
    this.commandSuggest?.setCommands(commands);
  }

  /**
   * Handle builtin slash commands
   */
  private handleBuiltinCommand(command: string): void {
    switch (command) {
      case "/clear":
        this.clearConversation();
        break;

      case "/help":
        this.showHelp();
        break;

      case "/status":
        this.showStatus();
        break;

      case "/reconnect":
        void this.reconnect();
        break;

      case "/compact":
        this.toggleCompactMode();
        break;

      case "/cost":
        this.showCost();
        break;

      case "/model":
        this.showModel();
        break;

      case "/modes":
        this.showModes();
        break;

      case "/config":
        this.showConfig();
        break;

      default:
        this.addMessage({
          role: "assistant",
          content: `Unknown command: ${command}`,
          timestamp: new Date(),
        });
    }
  }

  private clearConversation(): void {
    this.messages = [];
    this.messagesContainer.empty();
    this.toolCallCards.clear();
    this.pendingEditsByFile.clear();
    this.pendingPermissionsByFile.clear();
    this.autoApprovedFiles.clear();
    this.currentThinkingBlock = null;
    this.currentStreamingEl = null;
    this.currentAssistantMessage = "";

    this.addMessage({
      role: "assistant",
      content: "Conversation cleared.",
      timestamp: new Date(),
    });
  }

  private showHelp(): void {
    const helpText = `## Available Commands

| Command | Description |
|---------|-------------|
| \`/clear\` | Clear the conversation history |
| \`/help\` | Show this help message |
| \`/status\` | Show connection status |
| \`/reconnect\` | Reconnect |
| \`/compact\` | Toggle compact display mode |
| \`/cost\` | Show session cost info |
| \`/model\` | Show current model |
| \`/modes\` | Show available modes |
| \`/config\` | Show configuration options |
| \`/rename [title]\` | Rename current session |

## Keyboard Shortcuts

- **Enter** — Send message
- **Shift+Enter** — New line
- **Cmd/Ctrl+L** — Add selection to chat
- **\`[[\`** — Insert file reference

## File References

Use \`[[filename]]\` to reference vault files in your messages.`;

    this.addMessage({
      role: "assistant",
      content: helpText,
      timestamp: new Date(),
    });
  }

  private showStatus(): void {
    const connected = this.plugin.isConnected();
    const sessionId = this.plugin.getSessionId?.() ?? "N/A";
    const commandsCount = this.plugin.getAvailableCommands().length;

    const statusText = `## Connection Status

| Property | Value |
|----------|-------|
| **Status** | ${connected ? "🟢 Connected" : "🔴 Disconnected"} |
| **Session ID** | \`${sessionId}\` |
| **ACP Commands** | ${commandsCount} |
| **Messages** | ${this.messages.length} |
| **Tool Calls** | ${this.toolCallCards.size} |`;

    this.addMessage({
      role: "assistant",
      content: statusText,
      timestamp: new Date(),
    });
  }

  private async reconnect(): Promise<void> {
    this.addMessage({
      role: "assistant",
      content: "Reconnecting...",
      timestamp: new Date(),
    });

    try {
      await this.plugin.disconnect();
      await this.plugin.connect();
    } catch (error) {
      this.addMessage({
        role: "assistant",
        content: `Reconnection failed: ${(error as Error).message}`,
        timestamp: new Date(),
      });
    }
  }

  private toggleCompactMode(): void {
    const chatContainer = this.containerEl.querySelector(".chat-container");
    if (chatContainer) {
      chatContainer.toggleClass("compact-mode", !chatContainer.hasClass("compact-mode"));
      const isCompact = chatContainer.hasClass("compact-mode");
      this.addMessage({
        role: "assistant",
        content: `Compact mode ${isCompact ? "enabled" : "disabled"}.`,
        timestamp: new Date(),
      });
    }
  }

  private showCost(): void {
    // Cost information is not available via ACP yet
    this.addMessage({
      role: "assistant",
      content: `## Session Cost

⚠️ Cost tracking is not yet available via ACP protocol.

For usage information, check [console.anthropic.com](https://console.anthropic.com).`,
      timestamp: new Date(),
    });
  }

  private showModel(): void {
    const currentModel = this.plugin.getCurrentModel?.();
    const availableModels = this.plugin.getAvailableModels?.() ?? [];

    let content = `## Current Model\n\n`;

    if (currentModel) {
      content += `**Active**: \`${currentModel.modeId || currentModel.id || "default"}\`\n\n`;
    } else {
      content += `**Active**: Using default model\n\n`;
    }

    if (availableModels.length > 0) {
      content += `### Available Models\n\n`;
      for (const model of availableModels) {
        content += `- **${model.name}** (\`${model.id}\`)${model.description ? `: ${model.description}` : ""}\n`;
      }
    } else {
      content += `_No model list available from ACP._`;
    }

    this.addMessage({
      role: "assistant",
      content,
      timestamp: new Date(),
    });
  }

  private showModes(): void {
    const currentMode = this.plugin.getCurrentMode?.();
    const availableModes = this.plugin.getAvailableModes?.() ?? [];

    let content = `## Session Modes\n\n`;

    if (currentMode) {
      content += `**Active**: \`${currentMode.modeId || "default"}\`\n\n`;
    } else {
      content += `**Active**: Default mode\n\n`;
    }

    if (availableModes.length > 0) {
      content += `### Available Modes\n\n`;
      for (const mode of availableModes) {
        content += `- **${mode.name}** (\`${mode.id}\`)${mode.description ? `: ${mode.description}` : ""}\n`;
      }
    } else {
      content += `_No modes list available from ACP._`;
    }

    this.addMessage({
      role: "assistant",
      content,
      timestamp: new Date(),
    });
  }

  private async handleRenameCommand(newTitle: string): Promise<void> {
    if (!newTitle) {
      this.addMessage({
        role: "assistant",
        content: "Usage: `/rename New Session Title`",
        timestamp: new Date(),
      });
      return;
    }

    if (!this.currentVaultSessionId) {
      this.addMessage({
        role: "assistant",
        content: "No active session to rename.",
        timestamp: new Date(),
      });
      return;
    }

    try {
      await this.sessionService.renameSession(this.currentVaultSessionId, newTitle);
      this.addMessage({
        role: "assistant",
        content: `Session renamed to: **${newTitle}**`,
        timestamp: new Date(),
      });
    } catch (error) {
      this.addMessage({
        role: "assistant",
        content: `Failed to rename session: ${(error as Error).message}`,
        timestamp: new Date(),
      });
    }
  }

  private showConfig(): void {
    const configOptions = this.plugin.getConfigOptions?.() ?? [];

    let content = `## Configuration Options\n\n`;

    if (configOptions.length > 0) {
      for (const option of configOptions) {
        content += `### ${option.name}\n`;
        content += `- **ID**: \`${option.id}\`\n`;
        content += `- **Value**: \`${option.currentValue ?? "default"}\`\n`;
        if (option.category) {
          content += `- **Category**: ${option.category}\n`;
        }
        content += `\n`;
      }
    } else {
      content += `_No configuration options available from ACP._\n\n`;
      content += `Plugin settings can be configured in Obsidian settings.`;
    }

    this.addMessage({
      role: "assistant",
      content,
      timestamp: new Date(),
    });
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
    setCssProps(this.textarea, { "--chat-input-height": "auto" });
    setCssProps(this.textarea, {
      "--chat-input-height": Math.min(this.textarea.scrollHeight, 200) + "px",
    });
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

  /**
   * Add a pasted image from clipboard
   */
  private async addPastedImage(blob: File, mimeType: string): Promise<void> {
    if (!this.selectionChips) return;

    // Convert blob to base64
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    // Add chip and get ID
    const id = this.selectionChips.addImage(base64, mimeType);

    // Insert @N marker at cursor position
    const cursorPos = this.textarea.selectionStart ?? this.textarea.value.length;
    const before = this.textarea.value.slice(0, cursorPos);
    const after = this.textarea.value.slice(cursorPos);

    const needsSpaceBefore = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
    const needsSpaceAfter = after.length > 0 && !after.startsWith(" ") && !after.startsWith("\n");

    const marker = `${needsSpaceBefore ? " " : ""}\`@${id}\`${needsSpaceAfter ? " " : ""}`;

    this.textarea.value = before + marker + after;

    const newPos = cursorPos + marker.length;
    this.textarea.setSelectionRange(newPos, newPos);
    this.textarea.focus();
    this.textarea.dispatchEvent(new Event("input"));
  }

  /**
   * Add an external file (from outside vault) as a chip
   */
  private addExternalFile(absolutePath: string): void {
    if (!this.selectionChips) return;

    const id = this.selectionChips.addExternalFile(absolutePath);

    // Insert @N marker at cursor position
    const cursorPos = this.textarea.selectionStart ?? this.textarea.value.length;
    const before = this.textarea.value.slice(0, cursorPos);
    const after = this.textarea.value.slice(cursorPos);

    const needsSpaceBefore = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
    const needsSpaceAfter = after.length > 0 && !after.startsWith(" ") && !after.startsWith("\n");

    const marker = `${needsSpaceBefore ? " " : ""}\`@${id}\`${needsSpaceAfter ? " " : ""}`;

    this.textarea.value = before + marker + after;

    const newPos = cursorPos + marker.length;
    this.textarea.setSelectionRange(newPos, newPos);
    this.textarea.focus();
    this.textarea.dispatchEvent(new Event("input"));
  }

  // ===== Session Management Methods =====

  /**
   * Start a new vault session
   */
  async startNewSession(title?: string): Promise<string> {
    const session = await this.sessionService.createSession(title);
    this.currentVaultSessionId = session.id;
    console.debug(`[ChatView] Started new vault session: ${session.id}`);
    await this.updateSessionInfo();
    return session.id;
  }

  /**
   * Set the current vault session ID
   */
  setCurrentSession(sessionId: string | null): void {
    this.currentVaultSessionId = sessionId;
  }

  /**
   * Get the current vault session ID
   */
  getCurrentVaultSessionId(): string | null {
    return this.currentVaultSessionId;
  }

  /**
   * Get the session service
   */
  getSessionService(): VaultSessionService {
    return this.sessionService;
  }

  /**
   * Link current vault session to Claude session ID
   */
  async linkClaudeSession(claudeSessionId: string): Promise<void> {
    if (!this.currentVaultSessionId) return;
    await this.sessionService.linkClaudeSession(this.currentVaultSessionId, claudeSessionId);
  }

  /**
   * Update session info display in header
   */
  async updateSessionInfo(): Promise<void> {
    if (!this.sessionInfoEl) return;

    if (!this.currentVaultSessionId) {
      this.sessionInfoEl.addClass("is-hidden");
      return;
    }

    const session = await this.sessionService.getSession(this.currentVaultSessionId);
    if (!session) {
      this.sessionInfoEl.addClass("is-hidden");
      return;
    }

    this.sessionInfoEl.removeClass("is-hidden");
    this.sessionInfoEl.empty();

    // Session title (clickable to rename)
    const titleEl = this.sessionInfoEl.createSpan({ cls: "session-title" });
    titleEl.setText(session.title);
    titleEl.setAttribute("title", "Click to rename session");
    titleEl.addEventListener("click", () => {
      void this.promptRenameSession();
    });

    // File count badge
    if (session.referencedFiles.length > 0) {
      const badge = this.sessionInfoEl.createSpan({ cls: "session-files-badge" });
      badge.setText(`${session.referencedFiles.length} files`);
      badge.setAttribute("title", session.referencedFiles.map((f) => f.path).join("\n"));
    }

    // Message count
    const msgCount = this.sessionInfoEl.createSpan({ cls: "session-msg-count" });
    msgCount.setText(`${session.messageCount} msgs`);
  }

  /**
   * Prompt user to rename session
   */
  private async promptRenameSession(): Promise<void> {
    if (!this.currentVaultSessionId) return;

    const session = await this.sessionService.getSession(this.currentVaultSessionId);
    if (!session) return;

    const sessionId = this.currentVaultSessionId;
    const modal = new RenameSessionModal(this.plugin.app, session.title, async (newTitle) => {
      if (newTitle && newTitle !== session.title) {
        await this.sessionService.renameSession(sessionId, newTitle);
        await this.updateSessionInfo();
      }
    });
    modal.open();
  }

  /**
   * Auto-generate session title based on content
   * Only updates if title is still the default "Session ..." format
   */
  private async autoGenerateSessionTitle(): Promise<void> {
    if (!this.currentVaultSessionId) return;

    const session = await this.sessionService.getSession(this.currentVaultSessionId);
    if (!session) return;

    // Only auto-generate if title is still default
    if (session.title.startsWith("Session ") && session.messageCount <= 1) {
      const newTitle = this.sessionService.generateTitle(session);
      if (newTitle !== session.title) {
        await this.sessionService.renameSession(this.currentVaultSessionId, newTitle);
        console.debug(`[ChatView] Auto-generated session title: ${newTitle}`);
        await this.updateSessionInfo();
      }
    }
  }

  /**
   * Show the session picker modal
   */
  private async showSessionPicker(): Promise<void> {
    const sessions = await this.sessionService.listSessions();

    const picker = new SessionPickerModal(this.app, sessions, async (id: string) => {
      await this.sessionService.deleteSession(id);
    });

    const result = await picker.waitForSelection();

    if (result.action === "cancel") {
      return;
    }

    if (result.action === "new") {
      // Start new session and connect
      await this.startNewSessionAndConnect();
    } else if (result.action === "select" && result.sessionId) {
      // Load existing session
      await this.loadExistingSession(result.sessionId);
    }
  }

  /**
   * Start a new session and connect
   */
  private async startNewSessionAndConnect(): Promise<void> {
    // Clear current state
    this.clearConversationState();

    // Create new vault session
    await this.startNewSession();

    // Connect to Claude
    if (!this.plugin.isConnected()) {
      await this.plugin.connect();
    }

    // Link Claude session ID to vault session
    const claudeSessionId = this.plugin.getSessionId();
    if (claudeSessionId && this.currentVaultSessionId) {
      await this.linkClaudeSession(claudeSessionId);
      console.debug(`[ChatView] Linked Claude session: ${claudeSessionId}`);
    }

    this.updateSessionState("live");
  }

  /**
   * Load an existing session
   */
  private async loadExistingSession(sessionId: string): Promise<void> {
    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      this.addMessage({
        role: "assistant",
        content: `Session not found: ${sessionId}`,
        timestamp: new Date(),
      });
      return;
    }

    // Clear current state
    this.clearConversationState();

    // Set current session
    this.currentVaultSessionId = sessionId;

    // Load messages from vault session
    for (const msg of session.messages) {
      this.addMessage({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      });
    }

    await this.updateSessionInfo();

    // Try to resume Claude session if we have a stored ID
    if (session.claudeSessionId) {
      this.updateSessionState("resuming");
      this.addMessage({
        role: "assistant",
        content: `Attempting to resume Claude session...`,
        timestamp: new Date(),
      });

      try {
        await this.plugin.connectWithSession(session.claudeSessionId);
        this.updateSessionState("live");
        this.addMessage({
          role: "assistant",
          content: `✓ Session resumed. Claude remembers this conversation.`,
          timestamp: new Date(),
        });
      } catch {
        // connectWithSession threw — connect fresh, link new session
        console.warn("[ChatView] Session resume failed, connecting fresh");
        await this.plugin.connect();
        const newId = this.plugin.getSessionId();
        if (newId) await this.linkClaudeSession(newId);
        this.updateSessionState("live");
        this.addMessage({
          role: "assistant",
          content: `Session loaded: **${session.title}** (${session.messageCount} messages)\n\nConnected to a new session. History shown for context.`,
          timestamp: new Date(),
        });
      }
    } else {
      // No Claude session ID - this is a fresh session or history only
      if (session.messages.length > 0) {
        // Has history but no Claude session - show as history-only
        this.updateSessionState("history-only");
        this.addMessage({
          role: "assistant",
          content: `Session loaded: **${session.title}** (${session.messageCount} messages)\n\n⚠️ Claude doesn't remember this conversation. Use the banner above to continue with context.`,
          timestamp: new Date(),
        });
        return;
      } else {
        // Empty session - connect normally
        await this.plugin.connect();
        this.updateSessionState("live");
      }
    }

    this.addMessage({
      role: "assistant",
      content: `Session loaded: **${session.title}** (${session.messageCount} messages)`,
      timestamp: new Date(),
    });
  }

  /**
   * Clear conversation state without adding message
   */
  private clearConversationState(): void {
    this.messages = [];
    this.messagesContainer.empty();
    this.toolCallCards.clear();
    this.pendingEditsByFile.clear();
    this.pendingPermissionsByFile.clear();
    this.autoApprovedFiles.clear();
    this.currentThinkingBlock = null;
    this.currentStreamingEl = null;
    this.currentAssistantMessage = "";
    this.currentVaultSessionId = null;
    this.updateSessionState("disconnected");
  }

  /**
   * Update session state and manage history banner visibility
   */
  private updateSessionState(state: SessionState): void {
    this.sessionState = state;

    // Show/hide history banner based on state
    if (this.historyBannerEl) {
      if (state === "history-only") {
        this.historyBannerEl.removeClass("is-hidden");
      } else {
        this.historyBannerEl.addClass("is-hidden");
      }
    }

    console.debug(`[ChatView] Session state: ${state}`);
  }

  /**
   * Create the history-only banner UI
   */
  private createHistoryBanner(container: HTMLElement): void {
    this.historyBannerEl = container.createDiv({ cls: "history-banner is-hidden" });

    const icon = this.historyBannerEl.createSpan({ cls: "history-banner-icon" });
    icon.setText("⚠️");

    const textContainer = this.historyBannerEl.createDiv({ cls: "history-banner-text" });
    textContainer.createDiv({ cls: "history-banner-title" }).setText("Viewing history only");
    textContainer
      .createDiv({ cls: "history-banner-subtitle" })
      .setText("Claude doesn't remember this conversation");

    const continueBtn = this.historyBannerEl.createEl("button", {
      cls: "history-banner-btn",
    });
    continueBtn.setText("Continue with context");
    continueBtn.addEventListener("click", () => {
      void this.continueWithContext();
    });
  }

  /**
   * Continue conversation by injecting context from history
   */
  private async continueWithContext(): Promise<void> {
    // Will be implemented in Phase 4
    this.addMessage({
      role: "assistant",
      content: "Preparing to continue with context...",
      timestamp: new Date(),
    });

    try {
      // Build context from history
      const context = this.buildContextSummary();

      // Connect to Claude (new session)
      await this.plugin.connect();

      // Send context as initial message
      const contextMessage = `I'm continuing a previous conversation. Here's the context of what we discussed:\n\n${context}\n\nPlease acknowledge you understand the context and are ready to continue.`;

      this.updateSessionState("live");

      // Update claudeSessionId in vault session
      const newClaudeSessionId = this.plugin.getSessionId();
      if (this.currentVaultSessionId && newClaudeSessionId) {
        await this.sessionService.linkClaudeSession(this.currentVaultSessionId, newClaudeSessionId);
      }

      // Send the context message
      await this.plugin.sendMessage(contextMessage);
    } catch (error) {
      this.addMessage({
        role: "assistant",
        content: `Failed to continue with context: ${(error as Error).message}`,
        timestamp: new Date(),
      });
      this.updateSessionState("history-only");
    }
  }

  /**
   * Build a context summary from conversation history
   */
  private buildContextSummary(): string {
    // Take last 10 messages or fewer
    const recentMessages = this.messages.slice(-10);

    if (recentMessages.length === 0) {
      return "No previous messages in this session.";
    }

    const summary = recentMessages
      .map((msg) => {
        const role = msg.role === "user" ? "User" : "Assistant";
        // Truncate long messages
        const content = msg.content.length > 500 ? msg.content.slice(0, 500) + "..." : msg.content;
        return `**${role}**: ${content}`;
      })
      .join("\n\n");

    return summary;
  }
}

/**
 * Simple modal for renaming a session
 */
class RenameSessionModal extends Modal {
  private title: string;
  private onSubmit: (title: string) => Promise<void>;

  constructor(
    app: import("obsidian").App,
    currentTitle: string,
    onSubmit: (title: string) => Promise<void>
  ) {
    super(app);
    this.title = currentTitle;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Rename session" });

    new Setting(contentEl).setName("Title").addText((text) => {
      text.setValue(this.title);
      text.inputEl.focus();
      text.inputEl.select();
      text.onChange((value) => {
        this.title = value;
      });
      text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void this.submit();
        }
      });
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            void this.submit();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.close();
        })
      );
  }

  private async submit(): Promise<void> {
    await this.onSubmit(this.title);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
