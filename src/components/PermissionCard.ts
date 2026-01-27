/**
 * PermissionCard - Inline permission request component for chat
 *
 * Displays permission request in the chat flow (like CLI/Cursor style)
 * instead of a blocking modal dialog.
 */

import type { PermissionRequestParams, PermissionResponseParams } from "../acpClient";

export interface PermissionCardOptions {
  /** Callback when user wants to cancel and provide alternative instructions */
  onRedirect?: (alternativeText: string) => void;
}

export class PermissionCard {
  private container: HTMLElement;
  private resolvePromise: ((result: PermissionResponseParams) => void) | null = null;
  private request: PermissionRequestParams;
  private isResolved: boolean = false;
  private options: PermissionCardOptions;

  constructor(
    parent: HTMLElement,
    request: PermissionRequestParams,
    options?: PermissionCardOptions
  ) {
    this.request = request;
    this.options = options ?? {};
    this.container = parent.createDiv({ cls: "permission-card" });
    this.render();
  }

  /**
   * Wait for user response
   */
  async waitForResponse(): Promise<PermissionResponseParams> {
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
        cls: "permission-btn permission-btn-reject",
      });
      rejectBtn.setText("Deny");
      rejectBtn.addEventListener("click", () => this.handleChoice(rejectOpt.optionId));
    }

    // Allow once button (primary)
    const allowOnce = allowOptions.find((o) => o.kind === "allow_once");
    if (allowOnce) {
      const allowBtn = buttons.createEl("button", {
        cls: "permission-btn permission-btn-allow",
      });
      allowBtn.setText("Allow");
      allowBtn.addEventListener("click", () => this.handleChoice(allowOnce.optionId));
    }

    // Allow always button (if available)
    const allowAlways = allowOptions.find((o) => o.kind === "allow_always");
    if (allowAlways) {
      const allowAlwaysBtn = buttons.createEl("button", {
        cls: "permission-btn permission-btn-allow-always",
      });
      allowAlwaysBtn.setText("Always allow");
      allowAlwaysBtn.addEventListener("click", () => this.handleChoice(allowAlways.optionId));
    }

    // Cancel & redirect button (always available)
    const redirectBtn = buttons.createEl("button", {
      cls: "permission-btn permission-btn-redirect",
    });
    redirectBtn.setText("Do something else");
    redirectBtn.addEventListener("click", () => this.showRedirectInput());
  }

  private showRedirectInput(): void {
    // Hide buttons row
    const buttons = this.container.querySelector(".permission-card-buttons");
    if (buttons) {
      buttons.addClass("is-hidden");
    }

    // Create redirect input area
    const redirectArea = this.container.createDiv({ cls: "permission-card-redirect" });

    const label = redirectArea.createDiv({ cls: "permission-card-redirect-label" });
    label.setText("What would you like to do instead?");

    const inputRow = redirectArea.createDiv({ cls: "permission-card-redirect-row" });

    const input = inputRow.createEl("textarea", {
      cls: "permission-card-redirect-input",
      attr: { placeholder: "For example, don't modify this file..." },
    });

    const submitBtn = inputRow.createEl("button", {
      cls: "permission-btn permission-btn-allow",
    });
    submitBtn.setText("Send");

    const cancelBtn = inputRow.createEl("button", {
      cls: "permission-btn permission-btn-reject",
    });
    cancelBtn.setText("Back");

    // Handle submit
    submitBtn.addEventListener("click", () => {
      const text = input.value.trim();
      if (text) {
        this.handleRedirect(text);
      }
    });

    // Handle Enter key (without shift)
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = input.value.trim();
        if (text) {
          this.handleRedirect(text);
        }
      }
    });

    // Handle cancel - go back to buttons
    cancelBtn.addEventListener("click", () => {
      redirectArea.remove();
      if (buttons) {
        buttons.removeClass("is-hidden");
      }
    });

    // Focus input
    input.focus();
  }

  private handleRedirect(alternativeText: string): void {
    if (this.isResolved) return;
    this.isResolved = true;

    // Update UI
    this.container.addClass("permission-card-resolved");

    // Remove redirect area and show status
    const redirectArea = this.container.querySelector(".permission-card-redirect");
    if (redirectArea) {
      redirectArea.remove();
    }

    const buttons = this.container.querySelector(".permission-card-buttons");
    if (buttons) {
      buttons.removeClass("is-hidden");
      buttons.empty();
      const status = buttons.createDiv({ cls: "permission-card-status" });
      status.setText("↩ redirected");
      status.addClass("status-redirected");
    }

    // Cancel the permission request
    if (this.resolvePromise) {
      this.resolvePromise({
        outcome: {
          outcome: "cancelled",
        },
      });
      this.resolvePromise = null;
    }

    // Call redirect callback with alternative text
    this.options.onRedirect?.(alternativeText);
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
