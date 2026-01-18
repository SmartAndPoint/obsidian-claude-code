/**
 * PermissionModal - Promise-based permission request dialog
 *
 * Obsidian's Modal is synchronous, but ACP expects Promise<Response>.
 * This wrapper creates a Promise that resolves when user makes a choice.
 */

import { App, Modal } from "obsidian";
import type * as acp from "@agentclientprotocol/sdk";

export class PermissionModal extends Modal {
  private request: acp.RequestPermissionRequest;
  private resolvePromise: ((result: acp.RequestPermissionResponse) => void) | null = null;
  private selectedOptionId: string | null = null;

  constructor(app: App, request: acp.RequestPermissionRequest) {
    super(app);
    this.request = request;
  }

  /**
   * Open modal and wait for user response
   */
  async waitForResponse(): Promise<acp.RequestPermissionResponse> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("permission-modal");

    // Header
    const header = contentEl.createDiv({ cls: "permission-header" });
    header.createEl("h2").setText("⚠️ Permission required");

    // Tool call info
    const toolInfo = contentEl.createDiv({ cls: "permission-tool-info" });
    const toolCall = this.request.toolCall;

    if (toolCall.title) {
      toolInfo.createDiv({ cls: "permission-tool-title" }).setText(toolCall.title);
    }

    // Show command or file path
    if (toolCall.locations && toolCall.locations.length > 0) {
      const pathsEl = toolInfo.createDiv({ cls: "permission-paths" });
      for (const loc of toolCall.locations) {
        const pathEl = pathsEl.createDiv({ cls: "permission-path" });
        pathEl.setText(`📄 ${loc.path}${loc.line ? `:${loc.line}` : ""}`);
      }
    }

    // Show raw input if it's a command
    if (toolCall.rawInput && typeof toolCall.rawInput === "object") {
      const input = toolCall.rawInput as Record<string, unknown>;
      if (input.command) {
        const cmdEl = toolInfo.createDiv({ cls: "permission-command" });
        const cmdStr = typeof input.command === "string" ? input.command : JSON.stringify(input.command);
        cmdEl.createEl("code").setText(`$ ${cmdStr}`);
      }
    }

    // Options
    const optionsEl = contentEl.createDiv({ cls: "permission-options" });

    // Group options by kind and select first allow option by default
    const allowOptions = this.request.options.filter(
      (o) => o.kind === "allow_once" || o.kind === "allow_always"
    );
    if (allowOptions.length > 0) {
      this.selectedOptionId = allowOptions[0].optionId;
    }

    // Radio buttons for options
    for (const option of this.request.options) {
      const optionEl = optionsEl.createDiv({ cls: "permission-option" });

      const radio = optionEl.createEl("input", {
        type: "radio",
        attr: {
          name: "permission-choice",
          value: option.optionId,
          id: `option-${option.optionId}`,
        },
      });

      if (option.optionId === this.selectedOptionId) {
        radio.checked = true;
      }

      radio.addEventListener("change", () => {
        this.selectedOptionId = option.optionId;
      });

      const label = optionEl.createEl("label", {
        attr: { for: `option-${option.optionId}` },
      });

      // Icon based on kind
      const icon = option.kind.includes("allow") ? "✅" : "❌";
      label.setText(`${icon} ${option.name}`);
    }

    // Buttons
    const buttons = contentEl.createDiv({ cls: "permission-buttons" });

    // Cancel button
    const cancelBtn = buttons.createEl("button", { cls: "permission-btn-cancel" });
    cancelBtn.setText("Cancel");
    cancelBtn.addEventListener("click", () => {
      this.handleCancel();
    });

    // Confirm button
    const confirmBtn = buttons.createEl("button", { cls: "permission-btn-confirm" });
    confirmBtn.setText("Confirm");
    confirmBtn.addEventListener("click", () => {
      this.handleConfirm();
    });

    // Keyboard shortcuts
    this.scope.register([], "Enter", () => {
      this.handleConfirm();
      return false;
    });

    this.scope.register([], "Escape", () => {
      this.handleCancel();
      return false;
    });
  }

  private handleConfirm(): void {
    if (this.selectedOptionId && this.resolvePromise) {
      this.resolvePromise({
        outcome: {
          outcome: "selected",
          optionId: this.selectedOptionId,
        },
      });
      this.resolvePromise = null;
    }
    this.close();
  }

  private handleCancel(): void {
    if (this.resolvePromise) {
      this.resolvePromise({
        outcome: {
          outcome: "cancelled",
        },
      });
      this.resolvePromise = null;
    }
    this.close();
  }

  onClose(): void {
    // If closed without explicit choice, treat as cancel
    if (this.resolvePromise) {
      this.resolvePromise({
        outcome: {
          outcome: "cancelled",
        },
      });
      this.resolvePromise = null;
    }

    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Quick permission dialog for simple allow/deny choices
 */
export async function showQuickPermission(
  app: App,
  title: string,
  description: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new Modal(app);

    modal.onOpen = () => {
      const { contentEl } = modal;
      contentEl.createEl("h3").setText(title);
      contentEl.createEl("p").setText(description);

      const buttons = contentEl.createDiv({ cls: "permission-buttons" });

      const denyBtn = buttons.createEl("button");
      denyBtn.setText("Deny");
      denyBtn.addEventListener("click", () => {
        resolve(false);
        modal.close();
      });

      const allowBtn = buttons.createEl("button", { cls: "mod-cta" });
      allowBtn.setText("Allow");
      allowBtn.addEventListener("click", () => {
        resolve(true);
        modal.close();
      });
    };

    modal.onClose = () => {
      resolve(false); // Default to deny if closed
    };

    modal.open();
  });
}
