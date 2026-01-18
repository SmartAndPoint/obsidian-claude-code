/**
 * CodeViewer - Collapsible code blocks and full-view modal
 *
 * Collapses long code blocks in chat to show only preview,
 * with "Show more..." link to open full content in modal.
 */

import { App, Modal } from "obsidian";

const MAX_PREVIEW_LINES = 3;
const MAX_PREVIEW_CHARS = 200;

/**
 * Modal for viewing full code/output content
 */
export class CodeViewerModal extends Modal {
  private content: string;
  private title: string;

  constructor(app: App, content: string, title: string = "Output") {
    super(app);
    this.content = content;
    this.title = title;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("code-viewer-modal");

    // Header
    const header = contentEl.createDiv({ cls: "code-viewer-header" });
    header.createEl("h3").setText(this.title);

    // Copy button
    const copyBtn = header.createEl("button", { cls: "code-viewer-copy" });
    copyBtn.setText("Copy");
    copyBtn.addEventListener("click", () => {
      void navigator.clipboard.writeText(this.content).then(() => {
        copyBtn.setText("Copied");
        setTimeout(() => copyBtn.setText("Copy"), 2000);
      });
    });

    // Content
    const pre = contentEl.createEl("pre", { cls: "code-viewer-content" });
    const code = pre.createEl("code");
    code.setText(this.content);
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Process rendered content to collapse long code blocks
 */
export function collapseCodeBlocks(
  container: HTMLElement,
  app: App
): void {
  // Find all pre > code blocks
  const codeBlocks = container.querySelectorAll("pre");

  codeBlocks.forEach((pre) => {
    const code = pre.querySelector("code");
    const content = code?.textContent || pre.textContent || "";
    const lines = content.split("\n");

    // Skip short blocks
    if (lines.length <= MAX_PREVIEW_LINES && content.length <= MAX_PREVIEW_CHARS) {
      return;
    }

    // Create collapsed version
    const wrapper = document.createElement("div");
    wrapper.className = "collapsed-code-block";

    // Preview (first line or truncated)
    const preview = document.createElement("div");
    preview.className = "collapsed-code-preview";

    const firstLine = lines[0].slice(0, 80) + (lines[0].length > 80 ? "..." : "");
    preview.textContent = firstLine || "(empty)";

    // Info about hidden content
    const info = document.createElement("span");
    info.className = "collapsed-code-info";
    info.textContent = ` (${lines.length} lines)`;
    preview.appendChild(info);

    // "Show more" link
    const showMore = document.createElement("a");
    showMore.className = "collapsed-code-link";
    showMore.textContent = "Show more...";
    showMore.href = "#";
    showMore.addEventListener("click", (e) => {
      e.preventDefault();
      const modal = new CodeViewerModal(app, content, "Output");
      modal.open();
    });

    wrapper.appendChild(preview);
    wrapper.appendChild(showMore);

    // Replace original pre with collapsed version
    pre.replaceWith(wrapper);
  });
}

/**
 * Process text to detect and mark collapsible sections
 * (Alternative approach - modify text before markdown rendering)
 */
export function preprocessLongCodeBlocks(text: string): string {
  // Match code blocks with 4 backticks (often used for output)
  // This is a simpler approach - just trim them
  return text.replace(/````[\s\S]*?````/g, (match) => {
    const content = match.slice(4, -4).trim();
    const lines = content.split("\n");

    if (lines.length <= MAX_PREVIEW_LINES) {
      return match; // Keep short blocks as-is
    }

    // Mark for post-processing
    const preview = lines[0].slice(0, 60);
    return `\`${preview}...\` _(${lines.length} lines, click to expand)_\n\n<details><summary>Full output</summary>\n\n\`\`\`\n${content}\n\`\`\`\n</details>`;
  });
}
