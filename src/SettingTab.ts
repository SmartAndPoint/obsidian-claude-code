import { App, PluginSettingTab, Setting, Notice } from "obsidian";
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
      .setName("Default permission mode")
      .setDesc(
        "Mode applied to new sessions. The mode chip in chat overrides this for the current session."
      )
      .addDropdown((dd) => {
        for (const mode of PERMISSION_MODES) {
          dd.addOption(mode.id, `${mode.icon} ${mode.label} — ${mode.description}`);
        }
        dd.setValue(this.plugin.settings.defaultPermissionMode).onChange(async (value) => {
          this.plugin.settings.defaultPermissionMode = value as PermissionMode;
          await this.plugin.saveSettings();
        });
      });

    const toolsSetting = new Setting(containerEl).setName("Auto-approved tools").setDesc(
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- tool names are proper nouns
      "Tools allowed without prompting, regardless of permission mode. Read-only tools (Read/Glob/Grep/LS) are safe defaults. Bash, WebFetch, WebSearch, and Write/Edit broaden auto-approval — enable carefully."
    );

    const checkboxContainer = toolsSetting.controlEl.createDiv({
      cls: "claude-code-tool-checkboxes",
    });

    for (const tool of KNOWN_TOOLS) {
      const label = checkboxContainer.createEl("label", { cls: "claude-code-tool-checkbox" });
      const input = label.createEl("input", { type: "checkbox" });
      input.checked = this.plugin.settings.autoApprovedTools.includes(tool);
      label.createSpan({ text: tool });

      input.addEventListener("change", () => {
        const set = new Set(this.plugin.settings.autoApprovedTools);
        if (input.checked) {
          set.add(tool);
        } else {
          set.delete(tool);
        }
        this.plugin.settings.autoApprovedTools = Array.from(set);
        void this.plugin.saveSettings();
      });
    }
  }
}
