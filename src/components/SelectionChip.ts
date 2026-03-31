/**
 * SelectionChip - Displays file selection chips above chat input
 *
 * Shows visual chips for code selections added via Cmd+L.
 * Each chip has an ID (@1, @2, etc.) that links to position in message.
 */

import { TFile } from "obsidian";

export interface FileSelection {
  id: number;
  file: TFile;
  startLine: number;
  endLine: number;
  text: string; // The actual selected text (for preview)
  isFullFile?: boolean; // True if this is a dropped file (not a selection)
}

export interface ImageAttachment {
  id: number;
  data: string; // base64-encoded
  mimeType: string; // "image/png", "image/jpeg", etc.
  name: string; // Display name
}

export interface ExternalFileAttachment {
  id: number;
  absolutePath: string; // Full filesystem path
  name: string; // Display name (filename)
}

export class SelectionChipsContainer {
  private container: HTMLElement;
  private selections: Map<number, FileSelection> = new Map();
  private images: Map<number, ImageAttachment> = new Map();
  private externalFiles: Map<number, ExternalFileAttachment> = new Map();
  private nextId: number = 1;
  private onRemove: (id: number) => void;

  constructor(parent: HTMLElement, onRemove: (id: number) => void) {
    this.container = parent.createDiv({ cls: "selection-chips-container is-hidden" });
    this.onRemove = onRemove;
  }

  /**
   * Add a new selection and return its ID
   */
  addSelection(file: TFile, startLine: number, endLine: number, text: string): number {
    const id = this.nextId++;

    const selection: FileSelection = {
      id,
      file,
      startLine,
      endLine,
      text,
    };

    this.selections.set(id, selection);
    this.renderChip(selection);
    this.updateVisibility();

    return id;
  }

  /**
   * Add a full file (from drag & drop) and return its ID
   */
  addFile(file: TFile): number {
    const id = this.nextId++;

    const selection: FileSelection = {
      id,
      file,
      startLine: 0,
      endLine: 0,
      text: file.path,
      isFullFile: true,
    };

    this.selections.set(id, selection);
    this.renderChip(selection);
    this.updateVisibility();

    return id;
  }

  /**
   * Add a pasted image and return its ID
   */
  addImage(data: string, mimeType: string): number {
    const id = this.nextId++;
    const imageNum = this.images.size + 1;

    const image: ImageAttachment = {
      id,
      data,
      mimeType,
      name: `Pasted image ${imageNum}`,
    };

    this.images.set(id, image);
    this.renderImageChip(image);
    this.updateVisibility();

    return id;
  }

  /**
   * Get image by ID
   */
  getImage(id: number): ImageAttachment | undefined {
    return this.images.get(id);
  }

  /**
   * Get all images
   */
  getAllImages(): ImageAttachment[] {
    return Array.from(this.images.values());
  }

  /**
   * Add an external file (from outside vault) and return its ID
   */
  addExternalFile(absolutePath: string): number {
    const id = this.nextId++;
    const name = absolutePath.split("/").pop() ?? absolutePath;

    const extFile: ExternalFileAttachment = { id, absolutePath, name };

    this.externalFiles.set(id, extFile);
    this.renderExternalFileChip(extFile);
    this.updateVisibility();

    return id;
  }

  /**
   * Get external file by ID
   */
  getExternalFile(id: number): ExternalFileAttachment | undefined {
    return this.externalFiles.get(id);
  }

  /**
   * Get all external files
   */
  getAllExternalFiles(): ExternalFileAttachment[] {
    return Array.from(this.externalFiles.values());
  }

  /**
   * Remove a selection by ID (actually delete it)
   */
  removeSelection(id: number): void {
    this.selections.delete(id);
    this.images.delete(id);
    this.externalFiles.delete(id);
    const chipEl = this.container.querySelector(`[data-selection-id="${id}"]`);
    if (chipEl) {
      chipEl.remove();
    }
    this.updateVisibility();
  }

  /**
   * Hide a chip (but keep the selection for undo)
   */
  hideChip(id: number): void {
    const chipEl = this.container.querySelector(`[data-selection-id="${id}"]`);
    if (chipEl) {
      chipEl.addClass("is-hidden");
    }
    this.updateVisibility();
  }

  /**
   * Show a hidden chip
   */
  showChip(id: number): void {
    const chipEl = this.container.querySelector(`[data-selection-id="${id}"]`);
    if (chipEl) {
      chipEl.removeClass("is-hidden");
    }
    this.updateVisibility();
  }

  /**
   * Sync chip visibility based on which IDs are present in text
   */
  syncVisibility(visibleIds: Set<number>): void {
    for (const [id] of this.selections) {
      if (visibleIds.has(id)) {
        this.showChip(id);
      } else {
        this.hideChip(id);
      }
    }
    for (const [id] of this.images) {
      if (visibleIds.has(id)) {
        this.showChip(id);
      } else {
        this.hideChip(id);
      }
    }
    for (const [id] of this.externalFiles) {
      if (visibleIds.has(id)) {
        this.showChip(id);
      } else {
        this.hideChip(id);
      }
    }
  }

  /**
   * Get selection by ID
   */
  getSelection(id: number): FileSelection | undefined {
    return this.selections.get(id);
  }

  /**
   * Get all selections
   */
  getAllSelections(): FileSelection[] {
    return Array.from(this.selections.values());
  }

  /**
   * Clear all selections
   */
  clear(): void {
    this.selections.clear();
    this.images.clear();
    this.externalFiles.clear();
    this.container.empty();
    this.nextId = 1;
    this.updateVisibility();
  }

  /**
   * Resolve `@N` markers in text to full file paths (for agent)
   */
  resolveMarkers(text: string, vaultPath: string): string {
    return text.replace(/`@(\d+)`/g, (match, idStr) => {
      const id = parseInt(idStr, 10);
      const selection = this.selections.get(id);

      if (selection) {
        const fullPath = `${vaultPath}/${selection.file.path}`;

        // Full file - no line numbers
        if (selection.isFullFile) {
          return fullPath;
        }

        // Selection - include line numbers
        if (selection.startLine === selection.endLine) {
          return `${fullPath}:${selection.startLine}`;
        } else {
          return `${fullPath}:${selection.startLine}-${selection.endLine}`;
        }
      }

      // External file - return absolute path
      const extFile = this.externalFiles.get(id);
      if (extFile) {
        return extFile.absolutePath;
      }

      return match; // Keep original if not found
    });
  }

  /**
   * Format `@N` markers for display in chat (as [[file]] links with line info)
   */
  formatMarkersForDisplay(text: string): string {
    return text.replace(/`@(\d+)`/g, (match, idStr) => {
      const id = parseInt(idStr, 10);
      const selection = this.selections.get(id);

      if (selection) {
        // Full file - just [[filename]]
        if (selection.isFullFile) {
          return `[[${selection.file.path}]]`;
        }

        // Selection - [[filename]] (lines X-Y)
        if (selection.startLine === selection.endLine) {
          return `[[${selection.file.path}]] (line ${selection.startLine})`;
        } else {
          return `[[${selection.file.path}]] (lines ${selection.startLine}-${selection.endLine})`;
        }
      }

      // External file - show filename
      const extFile = this.externalFiles.get(id);
      if (extFile) {
        return extFile.name;
      }

      return match; // Keep original if not found
    });
  }

  private renderChip(selection: FileSelection): void {
    const chip = this.container.createDiv({
      cls: "selection-chip",
      attr: { "data-selection-id": String(selection.id) },
    });

    // Icon - different for full file vs selection
    const icon = chip.createSpan({ cls: "selection-chip-icon" });
    icon.textContent = selection.isFullFile ? "📄" : "📎";

    // ID badge
    const badge = chip.createSpan({ cls: "selection-chip-badge" });
    badge.textContent = `@${selection.id}`;

    // File info
    const info = chip.createSpan({ cls: "selection-chip-info" });
    if (selection.isFullFile) {
      info.textContent = selection.file.name;
    } else {
      const lineInfo =
        selection.startLine === selection.endLine
          ? `(${selection.startLine})`
          : `(${selection.startLine}-${selection.endLine})`;
      info.textContent = `${selection.file.name} ${lineInfo}`;
    }

    // Preview on hover (tooltip)
    const preview = selection.isFullFile
      ? selection.file.path
      : selection.text.slice(0, 100) + (selection.text.length > 100 ? "..." : "");
    chip.setAttribute("title", preview);

    // Remove button
    const removeBtn = chip.createSpan({ cls: "selection-chip-remove" });
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.removeSelection(selection.id);
      this.onRemove(selection.id);
    });
  }

  private renderExternalFileChip(extFile: ExternalFileAttachment): void {
    const chip = this.container.createDiv({
      cls: "selection-chip",
      attr: { "data-selection-id": String(extFile.id) },
    });

    // Icon
    const icon = chip.createSpan({ cls: "selection-chip-icon" });
    icon.textContent = "📂";

    // ID badge
    const badge = chip.createSpan({ cls: "selection-chip-badge" });
    badge.textContent = `@${extFile.id}`;

    // Info
    const info = chip.createSpan({ cls: "selection-chip-info" });
    info.textContent = extFile.name;

    // Tooltip with full path
    chip.setAttribute("title", extFile.absolutePath);

    // Remove button
    const removeBtn = chip.createSpan({ cls: "selection-chip-remove" });
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.removeSelection(extFile.id);
      this.onRemove(extFile.id);
    });
  }

  private renderImageChip(image: ImageAttachment): void {
    const chip = this.container.createDiv({
      cls: "selection-chip",
      attr: { "data-selection-id": String(image.id) },
    });

    // Icon
    const icon = chip.createSpan({ cls: "selection-chip-icon" });
    icon.textContent = "🖼️";

    // ID badge
    const badge = chip.createSpan({ cls: "selection-chip-badge" });
    badge.textContent = `@${image.id}`;

    // Info
    const info = chip.createSpan({ cls: "selection-chip-info" });
    info.textContent = image.name;

    // Tooltip
    chip.setAttribute(
      "title",
      `${image.mimeType} (${Math.round((image.data.length * 0.75) / 1024)}KB)`
    );

    // Remove button
    const removeBtn = chip.createSpan({ cls: "selection-chip-remove" });
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.removeSelection(image.id);
      this.onRemove(image.id);
    });
  }

  private updateVisibility(): void {
    // Check if any chips are actually visible (not having is-hidden class)
    const hasVisibleChips = Array.from(this.container.querySelectorAll(".selection-chip")).some(
      (chip) => !chip.hasClass("is-hidden")
    );

    this.container.toggleClass("is-hidden", !hasVisibleChips);
  }

  destroy(): void {
    this.container.remove();
  }
}
