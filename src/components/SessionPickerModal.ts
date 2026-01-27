/**
 * SessionPickerModal - Session selector for browsing and selecting chat sessions
 *
 * Features:
 * - List all vault sessions
 * - Show session metadata (title, date, message count, folders)
 * - Select session to resume
 * - Start new session
 * - Delete sessions
 */

import { App, Modal } from "obsidian";
import type { VaultSessionSummary } from "../services/VaultSessionService";

export interface SessionPickerResult {
  action: "new" | "select" | "cancel";
  sessionId?: string;
}

export class SessionPickerModal extends Modal {
  private sessions: VaultSessionSummary[];
  private resolvePromise: ((result: SessionPickerResult) => void) | null = null;
  private selectedIndex: number = -1; // -1 means "New session"
  private listEl: HTMLElement | null = null;
  private onDeleteSession?: (id: string) => Promise<void>;

  constructor(
    app: App,
    sessions: VaultSessionSummary[],
    onDeleteSession?: (id: string) => Promise<void>
  ) {
    super(app);
    this.sessions = sessions;
    this.onDeleteSession = onDeleteSession;
  }

  /**
   * Open modal and wait for user selection
   */
  async waitForSelection(): Promise<SessionPickerResult> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("session-picker-modal");

    // Header
    const header = contentEl.createDiv({ cls: "session-picker-header" });
    header.createEl("h2").setText("Chat sessions");

    // New session button (always first)
    const newSessionBtn = contentEl.createDiv({ cls: "session-picker-new-btn" });
    newSessionBtn.createSpan({ cls: "session-picker-new-icon" }).setText("+");
    newSessionBtn.createSpan({ cls: "session-picker-new-text" }).setText("Start new session");
    newSessionBtn.addEventListener("click", () => this.handleNewSession());

    if (this.selectedIndex === -1) {
      newSessionBtn.addClass("is-selected");
    }

    // Session list
    this.listEl = contentEl.createDiv({ cls: "session-picker-list" });

    if (this.sessions.length === 0) {
      const emptyEl = this.listEl.createDiv({ cls: "session-picker-empty" });
      emptyEl.setText("No saved sessions yet");
    } else {
      this.renderSessionList();
    }

    // Keyboard shortcuts
    this.scope.register([], "ArrowDown", () => {
      this.selectNext();
      return false;
    });

    this.scope.register([], "ArrowUp", () => {
      this.selectPrev();
      return false;
    });

    this.scope.register([], "Enter", () => {
      this.confirmSelection();
      return false;
    });

    this.scope.register([], "Escape", () => {
      this.handleCancel();
      return false;
    });
  }

  private renderSessionList(): void {
    if (!this.listEl) return;
    this.listEl.empty();

    for (let i = 0; i < this.sessions.length; i++) {
      const session = this.sessions[i];
      const itemEl = this.listEl.createDiv({ cls: "session-picker-item" });

      if (i === this.selectedIndex) {
        itemEl.addClass("is-selected");
      }

      // Main content area
      const contentEl = itemEl.createDiv({ cls: "session-picker-item-content" });

      // Title row
      const titleRow = contentEl.createDiv({ cls: "session-picker-item-title-row" });
      titleRow.createSpan({ cls: "session-picker-item-title" }).setText(session.title);

      // Date
      const dateStr = this.formatDate(session.updated);
      titleRow.createSpan({ cls: "session-picker-item-date" }).setText(dateStr);

      // Metadata row
      const metaRow = contentEl.createDiv({ cls: "session-picker-item-meta" });

      // Message count
      const msgBadge = metaRow.createSpan({ cls: "session-picker-item-badge" });
      msgBadge.setText(`${session.messageCount} messages`);

      // Folders
      if (session.referencedFolders.length > 0) {
        const folderBadge = metaRow.createSpan({ cls: "session-picker-item-badge" });
        const folderCount = session.referencedFolders.length;
        folderBadge.setText(`${folderCount} folder${folderCount > 1 ? "s" : ""}`);
      }

      // Preview
      if (session.lastMessagePreview) {
        const preview = contentEl.createDiv({ cls: "session-picker-item-preview" });
        preview.setText(session.lastMessagePreview);
      }

      // Delete button
      const deleteBtn = itemEl.createDiv({ cls: "session-picker-item-delete" });
      deleteBtn.setText("×");
      deleteBtn.setAttribute("aria-label", "Delete session");
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.handleDelete(session.id, i);
      });

      // Click to select
      itemEl.addEventListener("click", () => {
        this.selectedIndex = i;
        this.confirmSelection();
      });

      // Hover to highlight
      itemEl.addEventListener("mouseenter", () => {
        this.selectedIndex = i;
        this.updateSelection();
      });
    }
  }

  private selectNext(): void {
    this.selectedIndex = Math.min(this.selectedIndex + 1, this.sessions.length - 1);
    this.updateSelection();
  }

  private selectPrev(): void {
    this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
    this.updateSelection();
  }

  private updateSelection(): void {
    // Update new session button
    const newBtn = this.contentEl.querySelector(".session-picker-new-btn");
    if (newBtn) {
      if (this.selectedIndex === -1) {
        newBtn.addClass("is-selected");
      } else {
        newBtn.removeClass("is-selected");
      }
    }

    // Update session items
    const items = this.contentEl.querySelectorAll(".session-picker-item");
    items.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.addClass("is-selected");
        (item as HTMLElement).scrollIntoView({ block: "nearest" });
      } else {
        item.removeClass("is-selected");
      }
    });
  }

  private confirmSelection(): void {
    if (this.selectedIndex === -1) {
      this.handleNewSession();
    } else if (this.selectedIndex >= 0 && this.selectedIndex < this.sessions.length) {
      this.handleSelectSession(this.sessions[this.selectedIndex].id);
    }
  }

  private handleNewSession(): void {
    if (this.resolvePromise) {
      this.resolvePromise({ action: "new" });
      this.resolvePromise = null;
    }
    this.close();
  }

  private handleSelectSession(sessionId: string): void {
    if (this.resolvePromise) {
      this.resolvePromise({ action: "select", sessionId });
      this.resolvePromise = null;
    }
    this.close();
  }

  private handleCancel(): void {
    if (this.resolvePromise) {
      this.resolvePromise({ action: "cancel" });
      this.resolvePromise = null;
    }
    this.close();
  }

  private async handleDelete(sessionId: string, index: number): Promise<void> {
    if (!this.onDeleteSession) return;

    // Confirm deletion
    const confirmed = await this.confirmDelete(this.sessions[index].title);
    if (!confirmed) return;

    // Delete the session
    await this.onDeleteSession(sessionId);

    // Remove from local list and re-render
    this.sessions.splice(index, 1);

    // Adjust selection if needed
    if (this.selectedIndex >= this.sessions.length) {
      this.selectedIndex = this.sessions.length - 1;
    }

    if (this.sessions.length === 0) {
      // Show empty state
      if (this.listEl) {
        this.listEl.empty();
        const emptyEl = this.listEl.createDiv({ cls: "session-picker-empty" });
        emptyEl.setText("No saved sessions yet");
      }
    } else {
      this.renderSessionList();
    }
  }

  private async confirmDelete(title: string): Promise<boolean> {
    return new Promise((resolve) => {
      const confirmModal = new Modal(this.app);

      confirmModal.onOpen = () => {
        const { contentEl } = confirmModal;
        contentEl.createEl("h3").setText("Delete session?");
        contentEl.createEl("p").setText(`Are you sure you want to delete "${title}"?`);

        const buttons = contentEl.createDiv({ cls: "session-picker-confirm-buttons" });

        const cancelBtn = buttons.createEl("button");
        cancelBtn.setText("Cancel");
        cancelBtn.addEventListener("click", () => {
          resolve(false);
          confirmModal.close();
        });

        const deleteBtn = buttons.createEl("button", { cls: "mod-warning" });
        deleteBtn.setText("Delete");
        deleteBtn.addEventListener("click", () => {
          resolve(true);
          confirmModal.close();
        });
      };

      confirmModal.onClose = () => {
        resolve(false);
      };

      confirmModal.open();
    });
  }

  private formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      // Today - show time
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  }

  onClose(): void {
    // If closed without explicit choice, treat as cancel
    if (this.resolvePromise) {
      this.resolvePromise({ action: "cancel" });
      this.resolvePromise = null;
    }

    const { contentEl } = this;
    contentEl.empty();
  }
}
