/**
 * ThinkingBlock - Collapsible component for agent thinking/reasoning display
 *
 * Shows agent's internal reasoning process with collapse/expand functionality.
 * Streaming-friendly: text can be appended incrementally.
 */

export class ThinkingBlock {
  private container: HTMLElement;
  private header: HTMLElement;
  private content: HTMLElement;
  private text: string = "";
  private isCollapsed: boolean = true;
  private toggleBtn: HTMLElement;

  constructor(parent: HTMLElement) {
    this.container = parent.createDiv({ cls: "thinking-block" });

    // Header with toggle
    this.header = this.container.createDiv({ cls: "thinking-header" });

    const icon = this.header.createSpan({ cls: "thinking-icon" });
    icon.setText("💭");

    const label = this.header.createSpan({ cls: "thinking-label" });
    label.setText("Thinking...");

    this.toggleBtn = this.header.createSpan({ cls: "thinking-toggle" });
    this.updateToggleButton();

    this.header.addEventListener("click", () => this.toggle());

    // Content area (hidden by default)
    this.content = this.container.createDiv({ cls: "thinking-content is-hidden" });
  }

  appendText(chunk: string): void {
    this.text += chunk;
    this.content.setText(this.text);

    // Show preview in header when collapsed
    if (this.isCollapsed) {
      const preview = this.text.slice(0, 50).replace(/\n/g, " ");
      const label = this.header.querySelector(".thinking-label");
      if (label) {
        label.setText(preview + (this.text.length > 50 ? "..." : ""));
      }
    }
  }

  toggle(): void {
    this.isCollapsed = !this.isCollapsed;
    this.content.toggleClass("is-hidden", this.isCollapsed);
    this.updateToggleButton();

    // Reset label when expanded
    if (!this.isCollapsed) {
      const label = this.header.querySelector(".thinking-label");
      if (label) {
        label.setText("Thinking");
      }
    }
  }

  private updateToggleButton(): void {
    this.toggleBtn.setText(this.isCollapsed ? "▶" : "▼");
  }

  complete(): void {
    const label = this.header.querySelector(".thinking-label");
    if (label) {
      if (this.isCollapsed) {
        const preview = this.text.slice(0, 50).replace(/\n/g, " ");
        label.setText(preview + (this.text.length > 50 ? "..." : ""));
      } else {
        label.setText("Thought");
      }
    }
    this.container.addClass("thinking-complete");
  }

  getElement(): HTMLElement {
    return this.container;
  }

  getText(): string {
    return this.text;
  }
}
