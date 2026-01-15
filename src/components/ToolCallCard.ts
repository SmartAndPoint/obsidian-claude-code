/**
 * ToolCallCard - Displays tool call status and information
 *
 * Shows tool name, parameters, status, and optional content (diff, terminal output).
 */

import type * as acp from "@agentclientprotocol/sdk";
import { App } from "obsidian";
import { CodeViewerModal } from "./CodeViewer";
import { createClickablePath, formatPath } from "./PathFormatter";

// Tool kind to icon mapping
const TOOL_ICONS: Record<string, string> = {
  read: "📖",
  write: "✏️",
  edit: "✏️",
  bash: "🖥️",
  search: "🔍",
  web: "🌐",
  mcp: "🔌",
  default: "🔧",
};

// Status to icon mapping
const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  in_progress: "🔄",
  completed: "✅",
  failed: "❌",
};

const MAX_PREVIEW_LINES = 3;

export class ToolCallCard {
  private container: HTMLElement;
  private statusEl: HTMLElement;
  private contentArea: HTMLElement;
  private toolCallId: string;
  private app: App;
  private onViewDiff?: (diff: acp.Diff) => void;

  constructor(
    parent: HTMLElement,
    toolCall: acp.ToolCall & { sessionUpdate: "tool_call" },
    app: App,
    options?: {
      onViewDiff?: (diff: acp.Diff) => void;
    }
  ) {
    this.toolCallId = toolCall.toolCallId ?? "unknown";
    this.app = app;
    this.onViewDiff = options?.onViewDiff;

    this.container = parent.createDiv({ cls: "tool-card" });

    // Header
    const header = this.container.createDiv({ cls: "tool-card-header" });

    // Icon
    const icon = header.createSpan({ cls: "tool-card-icon" });
    icon.setText(TOOL_ICONS[toolCall.kind ?? "default"] ?? TOOL_ICONS.default);

    // Title
    const title = header.createSpan({ cls: "tool-card-title" });
    title.setText(toolCall.title ?? `Tool: ${toolCall.toolCallId ?? "unknown"}`);

    // Status
    this.statusEl = header.createSpan({ cls: "tool-card-status" });
    this.updateStatus(toolCall.status ?? "pending");

    // Details (file path, command, etc.) - with clickable vault paths
    if (toolCall.locations && toolCall.locations.length > 0) {
      const details = this.container.createDiv({ cls: "tool-card-details" });
      for (const loc of toolCall.locations) {
        const pathContainer = details.createDiv({ cls: "tool-card-path" });
        // Build full path with line number if present
        const fullPath = loc.path + (loc.line ? `:${loc.line}` : "");
        // Create clickable path element
        createClickablePath(this.app, pathContainer, fullPath, { cls: "tool-path-link" });
      }
    }

    // Content area (for diff, terminal output, etc.)
    this.contentArea = this.container.createDiv({ cls: "tool-card-content" });
    this.contentArea.style.display = "none";

    // Render initial content if present
    if (toolCall.content && toolCall.content.length > 0) {
      this.renderContent(toolCall.content);
    }
  }

  updateStatus(status: acp.ToolCallStatus): void {
    this.statusEl.empty();
    this.statusEl.removeClass("status-pending", "status-in_progress", "status-completed", "status-failed");
    this.statusEl.addClass(`status-${status}`);

    const icon = this.statusEl.createSpan({ cls: "status-icon" });
    icon.setText(STATUS_ICONS[status] ?? "⏳");

    const text = this.statusEl.createSpan({ cls: "status-text" });
    text.setText(status.replace("_", " "));
  }

  update(update: acp.ToolCallUpdate & { sessionUpdate: "tool_call_update" }): void {
    if (update.status) {
      this.updateStatus(update.status);
    }

    if (update.title) {
      const titleEl = this.container.querySelector(".tool-card-title");
      if (titleEl) {
        titleEl.setText(update.title);
      }
    }

    if (update.content && update.content.length > 0) {
      this.renderContent(update.content);
    }
  }

  private renderContent(content: acp.ToolCallContent[]): void {
    this.contentArea.empty();
    this.contentArea.style.display = "block";

    for (const item of content) {
      if (item.type === "diff") {
        this.renderDiff(item);
      } else if (item.type === "terminal") {
        this.renderTerminal(item);
      } else if (item.type === "content") {
        this.renderTextContent(item);
      }
    }
  }

  private renderDiff(diff: acp.Diff & { type: "diff" }): void {
    const diffContainer = this.contentArea.createDiv({ cls: "tool-card-diff" });

    // Diff header - with clickable path
    const diffHeader = diffContainer.createDiv({ cls: "diff-header" });
    if (diff.path) {
      createClickablePath(this.app, diffHeader, diff.path, { cls: "diff-path-link" });
    } else {
      diffHeader.setText("file");
    }

    // Simple diff display from oldText/newText
    const diffContent = diffContainer.createDiv({ cls: "diff-content" });

    const oldText = diff.oldText ?? "";
    const newText = diff.newText ?? "";

    if (oldText || newText) {
      const oldLines = oldText.split("\n");
      const newLines = newText.split("\n");
      const maxLines = Math.min(Math.max(oldLines.length, newLines.length), 10); // Limit preview

      for (let i = 0; i < maxLines; i++) {
        const oldLine = oldLines[i];
        const newLine = newLines[i];

        if (oldLine !== newLine) {
          if (oldLine !== undefined) {
            const lineEl = diffContent.createDiv({ cls: "diff-line diff-line-remove" });
            lineEl.setText("- " + oldLine);
          }
          if (newLine !== undefined) {
            const lineEl = diffContent.createDiv({ cls: "diff-line diff-line-add" });
            lineEl.setText("+ " + newLine);
          }
        }
      }

      if (Math.max(oldLines.length, newLines.length) > 10) {
        const moreEl = diffContent.createDiv({ cls: "diff-line diff-line-context" });
        moreEl.setText("  ... (more changes)");
      }
    }

    // View full diff button
    if (this.onViewDiff) {
      const actions = diffContainer.createDiv({ cls: "diff-actions" });
      const viewBtn = actions.createEl("button", { cls: "diff-view-btn" });
      viewBtn.setText("👁 View Full");
      viewBtn.addEventListener("click", () => {
        if (this.onViewDiff) {
          this.onViewDiff(diff);
        }
      });
    }
  }

  private renderTerminal(terminal: acp.Terminal & { type: "terminal" }): void {
    const termContainer = this.contentArea.createDiv({ cls: "tool-card-terminal" });

    // Terminal ID
    const idEl = termContainer.createDiv({ cls: "terminal-command" });
    idEl.setText(`Terminal: ${terminal.terminalId}`);

    // Note: The actual Terminal type only has terminalId
    // Command output would come from TerminalOutputResponse via separate request
  }

  private renderTextContent(content: acp.Content & { type: "content" }): void {
    const textContainer = this.contentArea.createDiv({ cls: "tool-card-text" });

    // Content.content is a single ContentBlock, not an array
    const block = content.content;
    if (block && block.type === "text") {
      const fullText = block.text ?? "";
      const lines = fullText.split("\n");

      // CLI-style: show summary instead of full content
      const summaryEl = textContainer.createDiv({ cls: "tool-output-summary" });
      summaryEl.setText(`⎿  ${lines.length} lines`);

      // Only show "View" link if there's actual content
      if (lines.length > 0 && fullText.trim()) {
        const viewLink = textContainer.createEl("a", { cls: "tool-output-link" });
        viewLink.setText("View output");
        viewLink.href = "#";
        viewLink.addEventListener("click", (e) => {
          e.preventDefault();
          const modal = new CodeViewerModal(this.app, fullText, "Tool Output");
          modal.open();
        });
      }
    }
  }

  getToolCallId(): string {
    return this.toolCallId;
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
