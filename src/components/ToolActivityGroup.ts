/**
 * ToolActivityGroup - Collapsible container for tool call cards
 *
 * Groups multiple tool calls between text messages into a single
 * expandable/collapsible block to reduce chat clutter.
 */

import type { ToolCallCard } from "./ToolCallCard";

export class ToolActivityGroup {
  private container: HTMLElement;
  private header: HTMLElement;
  private body: HTMLElement;
  private countEl: HTMLElement;
  private chevronEl: HTMLElement;
  private cards: ToolCallCard[] = [];
  private collapsed = false;
  private completedCount = 0;

  constructor(parent: HTMLElement) {
    this.container = parent.createDiv({ cls: "tool-activity-group" });

    // Header (clickable summary)
    this.header = this.container.createDiv({ cls: "tool-activity-header" });
    this.header.addEventListener("click", () => this.toggle());

    const icon = this.header.createSpan({ cls: "tool-activity-icon" });
    icon.textContent = "🔧";

    this.countEl = this.header.createSpan({ cls: "tool-activity-count" });
    this.countEl.textContent = "Working...";

    this.chevronEl = this.header.createSpan({ cls: "tool-activity-chevron" });
    this.chevronEl.textContent = "▾";

    // Body (contains tool cards)
    this.body = this.container.createDiv({ cls: "tool-activity-body" });
  }

  /**
   * Add a tool card to this group
   */
  addToolCard(card: ToolCallCard): void {
    this.cards.push(card);
    this.body.appendChild(card.getElement());
    this.updateSummary();
  }

  /**
   * Notify that a tool card has completed
   */
  markCompleted(): void {
    this.completedCount++;
    this.updateSummary();

    // Auto-collapse when all tools complete
    if (this.completedCount >= this.cards.length && this.cards.length > 0) {
      this.collapse();
    }
  }

  /**
   * Update the summary text in header
   */
  updateSummary(): void {
    const total = this.cards.length;
    const done = this.completedCount;

    if (done >= total && total > 0) {
      this.countEl.textContent = `${total} operation${total !== 1 ? "s" : ""} completed`;
    } else if (total > 0) {
      this.countEl.textContent = `${done}/${total} operations`;
    } else {
      this.countEl.textContent = "Working...";
    }
  }

  collapse(): void {
    this.collapsed = true;
    this.body.addClass("is-collapsed");
    this.chevronEl.textContent = "▸";
    this.container.addClass("is-collapsed");
  }

  expand(): void {
    this.collapsed = false;
    this.body.removeClass("is-collapsed");
    this.chevronEl.textContent = "▾";
    this.container.removeClass("is-collapsed");
  }

  toggle(): void {
    if (this.collapsed) {
      this.expand();
    } else {
      this.collapse();
    }
  }

  getElement(): HTMLElement {
    return this.container;
  }

  getCardCount(): number {
    return this.cards.length;
  }
}
