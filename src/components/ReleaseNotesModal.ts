import { App, Modal, MarkdownRenderer, Component, ButtonComponent } from "obsidian";

/**
 * Modal that renders plugin release notes via Obsidian's native markdown
 * renderer. Opened automatically once after an update, or on demand from
 * the Settings tab.
 */
export class ReleaseNotesModal extends Modal {
  private notes: string;
  private version: string;
  private renderHost: Component;

  constructor(app: App, version: string, notes: string) {
    super(app);
    this.version = version;
    this.notes = notes;
    this.renderHost = new Component();
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("claude-code-release-modal");
    contentEl.empty();

    const body = contentEl.createDiv({ cls: "claude-code-release-body" });

    // Markdown render — pass the modal's component as host so any embedded
    // resources clean up on close.
    void MarkdownRenderer.render(this.app, this.notes, body, "/", this.renderHost);

    const footer = contentEl.createDiv({ cls: "claude-code-release-footer" });
    const closeBtn = new ButtonComponent(footer);
    closeBtn
      .setButtonText(`Got it (${this.version})`)
      .setCta()
      .onClick(() => this.close());
  }

  onClose(): void {
    this.renderHost.unload();
    this.contentEl.empty();
  }
}
