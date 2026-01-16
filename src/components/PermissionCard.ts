/**
 * PermissionCard - Inline permission request component for chat
 *
 * Displays permission request in the chat flow (like CLI/Cursor style)
 * instead of a blocking modal dialog.
 */

import type * as acp from "@agentclientprotocol/sdk";

export class PermissionCard {
  private container: HTMLElement;
  private resolvePromise: ((result: acp.RequestPermissionResponse) => void) | null = null;
  private request: acp.RequestPermissionRequest;
  private isResolved: boolean = false;

  constructor(
    parent: HTMLElement,
    request: acp.RequestPermissionRequest
  ) {
    this.request = request;
    this.container = parent.createDiv({ cls: "permission-card" });
    this.render();
  }

  /**
   * Wait for user response
   */
  async waitForResponse(): Promise<acp.RequestPermissionResponse> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  private render(): void {
    const toolCall = this.request.toolCall;

    // Header
    const header = this.container.createDiv({ cls: "permission-card-header" });
    header.createSpan({ cls: "permission-card-icon" }).setText("⚠️");
    header.createSpan({ cls: "permission-card-title" }).setText("Permission required");

    // Content
    const content = this.container.createDiv({ cls: "permission-card-content" });

    // Tool info
    if (toolCall.title) {
      const titleEl = content.createDiv({ cls: "permission-card-tool" });
      titleEl.setText(toolCall.title);
    }

    // File paths
    if (toolCall.locations && toolCall.locations.length > 0) {
      const pathsEl = content.createDiv({ cls: "permission-card-paths" });
      for (const loc of toolCall.locations) {
        const pathEl = pathsEl.createDiv({ cls: "permission-card-path" });
        pathEl.setText(`📄 ${loc.path}${loc.line ? `:${loc.line}` : ""}`);
      }
    }

    // Command preview
    if (toolCall.rawInput && typeof toolCall.rawInput === "object") {
      const input = toolCall.rawInput as Record<string, unknown>;
      if (input.command) {
        const cmdEl = content.createDiv({ cls: "permission-card-command" });
        cmdEl.createEl("code").setText(`$ ${input.command}`);
      }
    }

    // Buttons row
    const buttons = this.container.createDiv({ cls: "permission-card-buttons" });

    // Group options: allow first, then reject
    const allowOptions = this.request.options.filter(
      (o) => o.kind === "allow_once" || o.kind === "allow_always"
    );
    const rejectOptions = this.request.options.filter(
      (o) => o.kind === "reject_once" || o.kind === "reject_always"
    );

    // Reject button (secondary)
    if (rejectOptions.length > 0) {
      const rejectOpt = rejectOptions[0];
      const rejectBtn = buttons.createEl("button", {
        cls: "permission-btn permission-btn-reject"
      });
      rejectBtn.setText("Deny");
      rejectBtn.addEventListener("click", () => this.handleChoice(rejectOpt.optionId));
    }

    // Allow once button (primary)
    const allowOnce = allowOptions.find((o) => o.kind === "allow_once");
    if (allowOnce) {
      const allowBtn = buttons.createEl("button", {
        cls: "permission-btn permission-btn-allow"
      });
      allowBtn.setText("Allow");
      allowBtn.addEventListener("click", () => this.handleChoice(allowOnce.optionId));
    }

    // Allow always button (if available)
    const allowAlways = allowOptions.find((o) => o.kind === "allow_always");
    if (allowAlways) {
      const allowAlwaysBtn = buttons.createEl("button", {
        cls: "permission-btn permission-btn-allow-always"
      });
      allowAlwaysBtn.setText("Always allow");
      allowAlwaysBtn.addEventListener("click", () => this.handleChoice(allowAlways.optionId));
    }
  }

  private handleChoice(optionId: string): void {
    if (this.isResolved) return;
    this.isResolved = true;

    // Update UI to show selected state
    this.container.addClass("permission-card-resolved");

    // Find which option was selected
    const option = this.request.options.find((o) => o.optionId === optionId);
    const isAllow = option?.kind.includes("allow");

    // Replace buttons with status
    const buttons = this.container.querySelector(".permission-card-buttons");
    if (buttons) {
      buttons.empty();
      const status = buttons.createDiv({ cls: "permission-card-status" });
      status.setText(isAllow ? "✓ Allowed" : "✗ Denied");
      status.addClass(isAllow ? "status-allowed" : "status-denied");
    }

    // Resolve promise
    if (this.resolvePromise) {
      this.resolvePromise({
        outcome: {
          outcome: "selected",
          optionId: optionId,
        },
      });
      this.resolvePromise = null;
    }
  }

  /**
   * Cancel the permission request (e.g., if chat is cleared)
   */
  cancel(): void {
    if (this.isResolved) return;
    this.isResolved = true;

    if (this.resolvePromise) {
      this.resolvePromise({
        outcome: {
          outcome: "cancelled",
        },
      });
      this.resolvePromise = null;
    }
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
