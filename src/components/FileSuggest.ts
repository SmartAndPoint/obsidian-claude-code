/**
 * FileSuggest - Inline file suggestion popup for chat input
 *
 * Triggered by [[ in textarea, provides fuzzy search for vault files.
 * Active file appears first, results sorted by match score.
 */

import { App, TFile, TFolder, TAbstractFile, prepareFuzzySearch, SearchResult } from "obsidian";

interface SuggestItem {
  file: TAbstractFile;
  path: string;
  name: string;
  isFolder: boolean;
  isActive: boolean;
  match: SearchResult | null;
}

export class FileSuggest {
  private app: App;
  private container: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private dropdown: HTMLElement | null = null;
  private items: SuggestItem[] = [];
  private selectedIndex: number = 0;
  private isOpen: boolean = false;
  private triggerStart: number = -1; // Position of [[ in input

  private onSelect: (path: string) => void;

  constructor(
    app: App,
    container: HTMLElement,
    inputEl: HTMLTextAreaElement,
    onSelect: (path: string) => void
  ) {
    this.app = app;
    this.container = container;
    this.inputEl = inputEl;
    this.onSelect = onSelect;

    this.setupListeners();
  }

  private setupListeners(): void {
    // Listen for input changes
    this.inputEl.addEventListener("input", this.handleInput.bind(this));

    // Listen for keydown (navigation)
    this.inputEl.addEventListener("keydown", this.handleKeydown.bind(this));

    // Close on blur (with delay to allow click)
    this.inputEl.addEventListener("blur", () => {
      setTimeout(() => this.close(), 150);
    });
  }

  private handleInput(e: Event): void {
    const value = this.inputEl.value;
    const cursorPos = this.inputEl.selectionStart ?? 0;

    // Find [[ before cursor
    const beforeCursor = value.slice(0, cursorPos);
    const triggerMatch = beforeCursor.match(/\[\[([^\[\]]*?)$/);

    if (triggerMatch) {
      this.triggerStart = beforeCursor.lastIndexOf("[[");
      const query = triggerMatch[1];
      this.open(query);
    } else {
      this.close();
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (!this.isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.selectNext();
        break;
      case "ArrowUp":
        e.preventDefault();
        this.selectPrev();
        break;
      case "Enter":
        if (this.items.length > 0) {
          e.preventDefault();
          e.stopImmediatePropagation(); // Prevent ChatView from sending message
          this.confirmSelection();
        }
        break;
      case "Escape":
        e.preventDefault();
        this.close();
        break;
      case "Tab":
        if (this.items.length > 0) {
          e.preventDefault();
          this.confirmSelection();
        }
        break;
    }
  }

  private open(query: string): void {
    this.isOpen = true;
    this.selectedIndex = 0;
    this.updateItems(query);
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.triggerStart = -1;
    if (this.dropdown) {
      this.dropdown.remove();
      this.dropdown = null;
    }
  }

  private updateItems(query: string): void {
    const activeFile = this.app.workspace.getActiveFile();
    const activeFolder = activeFile?.parent;
    const allFiles = this.app.vault.getAllLoadedFiles();

    // Prepare fuzzy search
    const fuzzy = query ? prepareFuzzySearch(query) : null;

    // Build items list
    const items: SuggestItem[] = [];

    // Track what we've added to avoid duplicates
    const addedPaths = new Set<string>();

    // Always add active file first if it exists and matches
    if (activeFile) {
      const match = fuzzy ? fuzzy(activeFile.path) : null;
      if (!fuzzy || match) {
        items.push({
          file: activeFile,
          path: activeFile.path,
          name: activeFile.name,
          isFolder: false,
          isActive: true,
          match,
        });
        addedPaths.add(activeFile.path);
      }
    }

    // Add active folder second if it exists and matches
    if (activeFolder && activeFolder.path !== "/") {
      const match = fuzzy ? fuzzy(activeFolder.path) : null;
      if (!fuzzy || match) {
        items.push({
          file: activeFolder,
          path: activeFolder.path,
          name: activeFolder.name,
          isFolder: true,
          isActive: true,
          match,
        });
        addedPaths.add(activeFolder.path);
      }
    }

    // Add rest of files
    for (const file of allFiles) {
      // Skip root and already added
      if (file.path === "/" || addedPaths.has(file.path)) continue;

      const isFolder = file instanceof TFolder;

      // Apply fuzzy search if query exists
      let match: SearchResult | null = null;
      if (fuzzy) {
        match = fuzzy(file.path);
        if (!match) continue; // Skip non-matching
      }

      items.push({
        file,
        path: file.path,
        name: file.name,
        isFolder,
        isActive: false,
        match,
      });
    }

    // Sort remaining items (after active file/folder): by match score, then folders, then alphabetically
    const activeItems = items.filter(i => i.isActive);
    const otherItems = items.filter(i => !i.isActive);

    otherItems.sort((a, b) => {
      // By match score (higher is better)
      const scoreA = a.match?.score ?? -1;
      const scoreB = b.match?.score ?? -1;
      if (scoreA !== scoreB) return scoreB - scoreA;

      // Folders before files
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;

      // Alphabetically
      return a.path.localeCompare(b.path);
    });

    // Combine: active items first, then sorted others
    this.items = [...activeItems, ...otherItems].slice(0, 10);
  }

  private render(): void {
    // Remove existing dropdown
    if (this.dropdown) {
      this.dropdown.remove();
    }

    if (this.items.length === 0) {
      this.dropdown = null;
      return;
    }

    // Create dropdown
    this.dropdown = document.createElement("div");
    this.dropdown.className = "file-suggest-dropdown";

    // Position near input
    this.positionDropdown();

    // Render items
    this.items.forEach((item, index) => {
      const itemEl = document.createElement("div");
      itemEl.className = "file-suggest-item";
      if (index === this.selectedIndex) {
        itemEl.addClass("is-selected");
      }

      // Icon
      const icon = document.createElement("span");
      icon.className = "file-suggest-icon";
      icon.textContent = item.isFolder ? "📁" : "📄";
      itemEl.appendChild(icon);

      // Path with highlighting
      const pathEl = document.createElement("span");
      pathEl.className = "file-suggest-path";

      if (item.match && item.match.matches) {
        // Highlight matched characters
        pathEl.innerHTML = this.highlightMatches(item.path, item.match.matches);
      } else {
        pathEl.textContent = item.path;
      }
      itemEl.appendChild(pathEl);

      // Active indicator
      if (item.isActive) {
        const activeEl = document.createElement("span");
        activeEl.className = "file-suggest-active";
        activeEl.textContent = "★";
        itemEl.appendChild(activeEl);
      }

      // Click handler
      itemEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.selectedIndex = index;
        this.confirmSelection();
      });

      // Hover handler
      itemEl.addEventListener("mouseenter", () => {
        this.selectedIndex = index;
        this.updateSelection();
      });

      this.dropdown!.appendChild(itemEl);
    });

    this.container.appendChild(this.dropdown);

    // Scroll to top after DOM fully renders
    setTimeout(() => {
      if (this.dropdown) {
        this.dropdown.scrollTop = 0;
      }
    }, 0);
  }

  private positionDropdown(): void {
    if (!this.dropdown) return;

    // Position above the input
    const inputRect = this.inputEl.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();

    this.dropdown.style.bottom = `${containerRect.bottom - inputRect.top + 4}px`;
    this.dropdown.style.left = "16px";
    this.dropdown.style.right = "16px";
  }

  private highlightMatches(text: string, matches: [number, number][]): string {
    let result = "";
    let lastIndex = 0;

    for (const [start, end] of matches) {
      // Add text before match
      result += this.escapeHtml(text.slice(lastIndex, start));
      // Add highlighted match
      result += `<span class="file-suggest-highlight">${this.escapeHtml(text.slice(start, end))}</span>`;
      lastIndex = end;
    }

    // Add remaining text
    result += this.escapeHtml(text.slice(lastIndex));

    return result;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private selectNext(): void {
    this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
    this.updateSelection();
  }

  private selectPrev(): void {
    this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
    this.updateSelection();
  }

  private updateSelection(): void {
    if (!this.dropdown) return;

    const items = this.dropdown.querySelectorAll(".file-suggest-item");
    items.forEach((item, index) => {
      item.removeClass("is-selected");
      if (index === this.selectedIndex) {
        item.addClass("is-selected");
        // Scroll into view if needed
        (item as HTMLElement).scrollIntoView({ block: "nearest" });
      }
    });
  }

  private confirmSelection(): void {
    if (this.items.length === 0 || this.triggerStart === -1) return;

    const selected = this.items[this.selectedIndex];
    const value = this.inputEl.value;
    const cursorPos = this.inputEl.selectionStart ?? 0;

    // Replace [[ + query with [[filename]]
    const before = value.slice(0, this.triggerStart);
    const after = value.slice(cursorPos);
    const newValue = `${before}[[${selected.path}]]${after}`;

    this.inputEl.value = newValue;

    // Move cursor after ]]
    const newCursorPos = this.triggerStart + selected.path.length + 4;
    this.inputEl.setSelectionRange(newCursorPos, newCursorPos);

    // Trigger input event for textarea auto-resize
    this.inputEl.dispatchEvent(new Event("input"));

    this.close();

    // Notify parent
    this.onSelect(selected.path);
  }

  destroy(): void {
    this.close();
  }

  isSuggestOpen(): boolean {
    return this.isOpen;
  }
}

/**
 * Resolve [[file]] references to full vault paths
 */
export function resolveFileReferences(
  text: string,
  app: App
): string {
  // Match [[filename]] patterns
  return text.replace(/\[\[([^\[\]]+)\]\]/g, (match, filename) => {
    // Try to find the file in vault
    const file = app.metadataCache.getFirstLinkpathDest(filename, "");

    if (file) {
      // Get full filesystem path
      const vaultPath = (app.vault.adapter as any).basePath;
      return `${vaultPath}/${file.path}`;
    }

    // If not found, return as-is
    return match;
  });
}
