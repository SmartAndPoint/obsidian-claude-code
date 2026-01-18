/**
 * CodeViewer - Collapsible code blocks and full-view modal
 *
 * Collapses long code blocks in chat to show only preview,
 * with "Show more..." link to open full content in modal.
 */

import { App, Modal, MarkdownRenderer, Component } from "obsidian";

// Only collapse really long code blocks - short ones are important context
const MAX_PREVIEW_LINES = 25;
const MAX_PREVIEW_CHARS = 2000;

export type ContentType = "auto" | "code" | "markdown" | "text";

interface CodeViewerOptions {
  title?: string;
  contentType?: ContentType;
  language?: string; // For code: "typescript", "python", etc.
}

/**
 * Detect content type from content
 */
function detectContentType(content: string): { type: ContentType; language?: string } {
  // Check for markdown indicators
  const hasMarkdownHeaders = /^#{1,6}\s/m.test(content);
  const hasMarkdownLists = /^[-*]\s/m.test(content);
  const hasMarkdownLinks = /\[.+\]\(.+\)/.test(content);
  const hasMarkdownCodeBlocks = /```[\s\S]*?```/.test(content);

  if (hasMarkdownHeaders || hasMarkdownLists || hasMarkdownLinks || hasMarkdownCodeBlocks) {
    return { type: "markdown" };
  }

  // Check for code patterns
  const codePatterns: [RegExp, string][] = [
    [/^(import|export|from)\s+/m, "typescript"],
    [/^(const|let|var|function|class|interface|type)\s+\w+/m, "typescript"],
    [/^(def|class|import|from|if __name__)/m, "python"],
    [/^(package|func|import|type|struct)\s+/m, "go"],
    [/^(use|fn|let|mut|impl|struct|enum)\s+/m, "rust"],
    [/^(public|private|protected|class|interface|package)\s+/m, "java"],
    [/^\s*[{}[\]]:?\s*$/m, "json"],
    [/^<\?php/m, "php"],
    [/^<[a-zA-Z][^>]*>/m, "html"],
    [/^\s*\$[\w-]+\s*:/m, "scss"],
    [/^@\w+\s*{/m, "css"],
  ];

  for (const [pattern, lang] of codePatterns) {
    if (pattern.test(content)) {
      return { type: "code", language: lang };
    }
  }

  // Default to text
  return { type: "text" };
}

/**
 * Modal for viewing full code/output content with syntax highlighting
 */
export class CodeViewerModal extends Modal {
  private content: string;
  private options: CodeViewerOptions;
  private component: Component;
  private contentContainer: HTMLElement | null = null;

  constructor(app: App, content: string, titleOrOptions?: string | CodeViewerOptions) {
    super(app);
    this.content = content;
    this.component = new Component();

    // Handle legacy string title or new options object
    if (typeof titleOrOptions === "string") {
      this.options = { title: titleOrOptions };
    } else {
      this.options = titleOrOptions ?? {};
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("code-viewer-modal");
    this.component.load();

    // Header
    const header = contentEl.createDiv({ cls: "code-viewer-header" });
    header.createEl("h3").setText(this.options.title ?? "Output");

    // Copy button
    const copyBtn = header.createEl("button", { cls: "code-viewer-copy" });
    copyBtn.setText("Copy");
    copyBtn.addEventListener("click", () => {
      void navigator.clipboard.writeText(this.content).then(() => {
        copyBtn.setText("Copied");
        setTimeout(() => copyBtn.setText("Copy"), 2000);
      });
    });

    // Content container
    this.contentContainer = contentEl.createDiv({ cls: "code-viewer-content" });

    // Determine content type
    let contentType = this.options.contentType ?? "auto";
    let language = this.options.language;

    if (contentType === "auto") {
      const detected = detectContentType(this.content);
      contentType = detected.type;
      language = language ?? detected.language;
    }

    // Render based on content type
    if (contentType === "markdown") {
      this.renderMarkdown();
    } else if (contentType === "code" && language) {
      this.renderCode(language);
    } else {
      this.renderPlainText();
    }

    // Ctrl+A / Cmd+A selects only modal content
    this.setupSelectAll();
  }

  private renderMarkdown(): void {
    if (!this.contentContainer) return;
    this.contentContainer.addClass("code-viewer-markdown");

    void MarkdownRenderer.render(
      this.app,
      this.content,
      this.contentContainer,
      "",
      this.component
    );
  }

  private renderCode(language: string): void {
    if (!this.contentContainer) return;
    this.contentContainer.addClass("code-viewer-code");

    // Wrap content in markdown code block for syntax highlighting
    const markdownContent = "```" + language + "\n" + this.content + "\n```";

    void MarkdownRenderer.render(
      this.app,
      markdownContent,
      this.contentContainer,
      "",
      this.component
    );
  }

  private renderPlainText(): void {
    if (!this.contentContainer) return;
    this.contentContainer.addClass("code-viewer-text");

    const pre = this.contentContainer.createEl("pre");
    const code = pre.createEl("code");
    code.setText(this.content);
  }

  private setupSelectAll(): void {
    const selectContent = (e: KeyboardEvent) => {
      e.preventDefault();
      const selection = window.getSelection();
      const range = document.createRange();
      if (this.contentContainer) {
        range.selectNodeContents(this.contentContainer);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      return false;
    };

    // Ctrl+A for Windows/Linux
    this.scope.register(["Ctrl"], "a", selectContent);
    // Cmd+A for macOS
    this.scope.register(["Meta"], "a", selectContent);
  }

  onClose(): void {
    this.component.unload();
    const { contentEl } = this;
    contentEl.empty();
    this.contentContainer = null;
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
