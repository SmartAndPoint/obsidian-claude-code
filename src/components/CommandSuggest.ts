/**
 * CommandSuggest - Inline slash command suggestion popup for chat input
 *
 * Triggered by / at start of input.
 * Shows available commands with prefix matching.
 */

import type { AvailableCommand } from "../acpClient";

/**
 * Set CSS custom properties on an element
 */
function setCssProps(el: HTMLElement, props: Record<string, string>): void {
  for (const [key, value] of Object.entries(props)) {
    el.style.setProperty(key, value);
  }
}

/**
 * Built-in commands that the plugin handles locally
 * Modeled after Claude Code CLI commands
 */
const BUILTIN_COMMANDS: AvailableCommand[] = [
  { name: "/clear", description: "Clear the conversation history" },
  { name: "/help", description: "Show available commands and usage help" },
  { name: "/status", description: "Show connection status and session info" },
  { name: "/reconnect", description: "Disconnect and reconnect" },
  { name: "/compact", description: "Toggle compact message display mode" },
  { name: "/cost", description: "Show estimated session cost (if available)" },
  { name: "/model", description: "Show current model information" },
  { name: "/modes", description: "Show available session modes" },
  { name: "/config", description: "Show configuration options" },
];

interface CommandItem {
  command: AvailableCommand;
  isBuiltin: boolean;
}

export class CommandSuggest {
  private container: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private dropdown: HTMLElement | null = null;
  private items: CommandItem[] = [];
  private selectedIndex: number = 0;
  private isOpen: boolean = false;
  private triggerStart: number = -1; // Position of / in input

  private commands: AvailableCommand[] = [];
  private onSelect: (command: AvailableCommand) => void;
  private onBuiltinCommand: (command: string) => void;

  constructor(
    container: HTMLElement,
    inputEl: HTMLTextAreaElement,
    onSelect: (command: AvailableCommand) => void,
    onBuiltinCommand: (command: string) => void
  ) {
    this.container = container;
    this.inputEl = inputEl;
    this.onSelect = onSelect;
    this.onBuiltinCommand = onBuiltinCommand;

    this.setupListeners();
  }

  /**
   * Update available commands (called when ACP sends command updates)
   */
  setCommands(commands: AvailableCommand[]): void {
    this.commands = commands;
    console.debug(
      "[CommandSuggest] Commands updated:",
      commands.length,
      commands.map((c) => c.name)
    );
  }

  /**
   * Get current commands count (for debugging)
   */
  getCommandsCount(): number {
    return this.commands.length;
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

  private handleInput(): void {
    const value = this.inputEl.value;
    const cursorPos = this.inputEl.selectionStart ?? 0;

    // Only trigger when / is at the very beginning of input
    const beforeCursor = value.slice(0, cursorPos);

    // Match / only at the start of input, followed by command chars (no spaces)
    const triggerMatch = beforeCursor.match(/^(\/[^\s]*)$/);

    if (triggerMatch) {
      this.triggerStart = 0;
      const query = triggerMatch[1].slice(1); // Remove leading /
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
    const queryLower = query.toLowerCase();

    // Build items list - combine builtin commands and ACP commands
    const items: CommandItem[] = [];

    // Helper to add commands with PREFIX matching on name only
    const addCommands = (commands: AvailableCommand[], isBuiltin: boolean) => {
      for (const command of commands) {
        // Get command name without leading /
        const commandName = command.name.startsWith("/") ? command.name.slice(1) : command.name;

        // Prefix match only on command name
        if (query && !commandName.toLowerCase().startsWith(queryLower)) {
          continue; // Skip non-matching
        }

        items.push({
          command,
          isBuiltin,
        });
      }
    };

    // Add builtin commands first
    addCommands(BUILTIN_COMMANDS, true);

    // Add ACP commands
    addCommands(this.commands, false);

    // Sort: builtins first, then alphabetically
    items.sort((a, b) => {
      // Builtins before ACP commands
      if (a.isBuiltin && !b.isBuiltin) return -1;
      if (!a.isBuiltin && b.isBuiltin) return 1;

      // Alphabetically by name
      return a.command.name.localeCompare(b.command.name);
    });

    this.items = items.slice(0, 10);
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
    this.dropdown.className = "command-suggest-dropdown";

    // Position near input
    this.positionDropdown();

    // Render items - compact single-line layout
    this.items.forEach((item, index) => {
      const itemEl = document.createElement("div");
      itemEl.className = "command-suggest-item";
      if (index === this.selectedIndex) {
        itemEl.addClass("is-selected");
      }

      // Command name
      const nameEl = document.createElement("span");
      nameEl.className = "command-suggest-name";
      nameEl.textContent = item.command.name.startsWith("/")
        ? item.command.name
        : `/${item.command.name}`;
      itemEl.appendChild(nameEl);

      // Builtin badge
      if (item.isBuiltin) {
        const badgeEl = document.createElement("span");
        badgeEl.className = "command-suggest-badge";
        badgeEl.textContent = "Built-in";
        itemEl.appendChild(badgeEl);
      }

      // Description (inline, truncated if needed)
      const descEl = document.createElement("span");
      descEl.className = "command-suggest-description";
      descEl.textContent = item.command.description;
      itemEl.appendChild(descEl);

      // Input hint (if command requires input)
      if (item.command.input?.hint) {
        const hintEl = document.createElement("span");
        hintEl.className = "command-suggest-hint";
        hintEl.textContent = `<${item.command.input.hint}>`;
        itemEl.appendChild(hintEl);
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

    // Position above the input with proper gap (24px)
    const inputRect = this.inputEl.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();

    setCssProps(this.dropdown, {
      "--dropdown-bottom": `${containerRect.bottom - inputRect.top + 24}px`,
    });
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

    const items = this.dropdown.querySelectorAll(".command-suggest-item");
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

    // Get command name (ensure it starts with /)
    const commandName = selected.command.name.startsWith("/")
      ? selected.command.name
      : `/${selected.command.name}`;

    // Close dropdown AFTER saving state (close() resets triggerStart)
    this.close();

    // Handle builtin commands immediately
    if (selected.isBuiltin) {
      // Clear input for builtin commands
      this.inputEl.value = "";
      this.inputEl.dispatchEvent(new Event("input"));
      this.onBuiltinCommand(commandName);
      return;
    }

    // For ACP commands, replace ENTIRE input with command + space
    // This prevents partial text issues and re-triggering
    const suffix = " ";
    const newValue = `${commandName}${suffix}`;

    this.inputEl.value = newValue;

    // Move cursor to end (after command + space)
    const newCursorPos = newValue.length;
    this.inputEl.setSelectionRange(newCursorPos, newCursorPos);

    // Trigger input event for textarea auto-resize
    // Note: This won't re-trigger dropdown because cursor is after space
    this.inputEl.dispatchEvent(new Event("input"));

    // Notify parent
    this.onSelect(selected.command);
  }

  destroy(): void {
    this.close();
  }

  isSuggestOpen(): boolean {
    return this.isOpen;
  }
}
