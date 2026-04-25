import { App, PluginSettingTab, Setting, Notice } from "obsidian";

interface SettingsApi {
  open: () => void;
  openTabById: (id: string) => unknown;
  activeTab?: {
    setting?: { search?: { setValue: (v: string) => void; onChanged?: () => void } };
    searchComponent?: { setValue: (v: string) => void; onChanged?: () => void };
  };
}
import type ClaudeCodePlugin from "./main";
import { PERMISSION_MODES, KNOWN_TOOLS, type PermissionMode } from "./settings";
import { findClaudeBinary } from "./acp-core/adapters";

export class ClaudeCodeSettingTab extends PluginSettingTab {
  private plugin: ClaudeCodePlugin;

  constructor(app: App, plugin: ClaudeCodePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ====================================================================
    // Claude CLI section
    // ====================================================================
    new Setting(containerEl).setName("Claude CLI").setHeading();

    new Setting(containerEl)
      .setName("Binary path")
      .setDesc(
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- Obsidian is a proper noun
        "Absolute path to the claude executable. Leave empty to auto-detect (recommended). Override useful for non-standard installs or when Obsidian can't find the binary."
      )
      .addText((text) =>
        text
          .setPlaceholder("/usr/local/bin/claude")
          .setValue(this.plugin.settings.claudePath)
          .onChange(async (value) => {
            this.plugin.settings.claudePath = value.trim();
            await this.plugin.saveSettings();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText("Auto-detect")
          .setTooltip("Probe known install locations and fill the field")
          .onClick(async () => {
            const found = findClaudeBinary();
            if (found) {
              this.plugin.settings.claudePath = found;
              await this.plugin.saveSettings();
              new Notice(`Found claude at ${found}`);
              this.display();
            } else {
              new Notice("Claude CLI not found in known locations");
            }
          })
      );

    // ====================================================================
    // Permissions section
    // ====================================================================
    new Setting(containerEl).setName("Permissions").setHeading();

    new Setting(containerEl)
      .setName("Cycle mode hotkey")
      .setDesc(
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- mode names are proper nouns
        "Bind a keyboard shortcut to cycle through Cautious → Auto-edit → Plan → Bypass. Opens Obsidian's hotkey settings pre-filtered to this command."
      )
      .addButton((btn) =>
        btn
          .setButtonText("Configure hotkey")
          .setCta()
          .onClick(() => this.openHotkeySettings())
      );

    new Setting(containerEl)
      .setName("Default permission mode")
      .setDesc(
        "Mode applied to new sessions. The mode chip in chat overrides this for the current session."
      )
      .addDropdown((dd) => {
        for (const mode of PERMISSION_MODES) {
          dd.addOption(mode.id, `${mode.label} — ${mode.description}`);
        }
        dd.setValue(this.plugin.settings.defaultPermissionMode).onChange(async (value) => {
          this.plugin.settings.defaultPermissionMode = value as PermissionMode;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl).setName("Auto-approved tools").setDesc(
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- tool names are proper nouns
      "Tools allowed without prompting, regardless of permission mode. Read-only tools (Read/Glob/Grep/LS) are safe defaults. Bash, WebFetch, WebSearch, and Write/Edit broaden auto-approval — enable carefully."
    );

    this.renderToolsTable(containerEl);
  }

  /**
   * Tools as a 4-col grid (checkbox / name / description / example) below
   * the description so it spans the full container width. Each row is
   * fully clickable to toggle.
   */
  private renderToolsTable(containerEl: HTMLElement): void {
    const table = containerEl.createDiv({ cls: "claude-code-tools-table" });

    // Header row
    const head = table.createDiv({ cls: "claude-code-tools-row claude-code-tools-head" });
    head.createDiv(); // checkbox column spacer
    head.createDiv({ text: "Tool" });
    head.createDiv({ text: "Description" });
    head.createDiv({ text: "Example" });

    for (const tool of KNOWN_TOOLS) {
      const row = table.createDiv({ cls: "claude-code-tools-row" });

      const checkCell = row.createDiv({ cls: "claude-code-tools-check" });
      const input = checkCell.createEl("input", { type: "checkbox" });
      input.checked = this.plugin.settings.autoApprovedTools.includes(tool.id);

      row.createDiv({ cls: "claude-code-tools-name", text: tool.id });
      row.createDiv({ cls: "claude-code-tools-desc", text: tool.description });
      row.createEl("code", { cls: "claude-code-tools-example", text: tool.example });

      const toggle = (next?: boolean): void => {
        input.checked = next ?? !input.checked;
        const set = new Set(this.plugin.settings.autoApprovedTools);
        if (input.checked) set.add(tool.id);
        else set.delete(tool.id);
        this.plugin.settings.autoApprovedTools = Array.from(set);
        void this.plugin.saveSettings();
      };

      // Whole-row click toggles the checkbox (except clicks on the input
      // itself — the browser already toggles it via change event below).
      row.addEventListener("click", (e) => {
        if (e.target === input) return;
        toggle();
      });
      input.addEventListener("change", () => toggle(input.checked));
    }
  }

  /**
   * Open Obsidian's Hotkeys settings with the cycle-mode command pre-searched.
   * Standard pattern used by many community plugins (Dataview, Vimrc, etc.).
   * Falls back to a Notice if the internal API surface differs.
   */
  private openHotkeySettings(): void {
    const settingApi = (this.app as unknown as { setting?: SettingsApi }).setting;
    if (!settingApi) {
      new Notice(
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- references Obsidian UI labels
        "Open Settings → Hotkeys and search for 'Cycle permission mode'"
      );
      return;
    }
    settingApi.open();
    settingApi.openTabById("hotkeys");
    // Best-effort search injection — Obsidian's internal layout has shifted
    // across versions; both shapes are seen in the wild.
    const tab = settingApi.activeTab;
    const search = tab?.searchComponent ?? tab?.setting?.search;
    if (search) {
      search.setValue("Cycle permission mode");
      search.onChanged?.();
    }
  }
}
