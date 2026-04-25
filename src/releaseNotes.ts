/**
 * In-plugin release notes — shown in a modal after the user updates the
 * plugin (compared via manifest.version vs settings.lastSeenVersion).
 *
 * NOTE: keep this in sync with docs/releases/X.Y.Z.md whenever you bump
 * the version. The modal is also opened on demand from the SettingTab.
 */

export const LATEST_RELEASE_VERSION = "1.8.1";

export const RELEASE_NOTES: Record<string, string> = {
  "1.8.1": `# 1.8.1 — In-app release notes

A small follow-up to 1.8.0: the plugin now greets you with a release-notes
modal the first time you open Obsidian after an update, and the new
"View release notes" button in Settings lets you re-read them anytime.

- After every plugin update, a modal renders the current version's notes
  using Obsidian's native markdown renderer
- "View release notes" button added to the Claude CLI section in
  Settings — handy for sharing context with teammates or revisiting
  what changed
- Skipped on first install (no version comparison until you've seen
  at least one release), so new users aren't ambushed

Repository: <https://github.com/SmartAndPoint/obsidian-claude-code>
`,
  "1.8.0": `# 1.8.0 — Status bar, permission modes, smarter setup

This release brings the **Claude Code Obsidian plugin** much closer to the
terminal experience. You can see what the **Claude AI assistant** is doing at
a glance, control how much it's allowed to do without asking, and get a
friendlier first-time setup whether you installed the \`claude\` CLI via the
official installer, Homebrew, npm, or anywhere else.

## What's new

### A status bar that tells you what's happening

A new status row now sits under the chat input. On the left, a flat **mode
chip** shows how Claude is treating your permissions right now. On the right,
a colored dot tells you whether the connection is live, the agent is
thinking, or something dropped. No more guessing why your message hasn't
started streaming — the bar speaks for itself, in both light and dark
Obsidian themes.

### Permission modes that match how you work

The terminal version of Claude Code cycles through Cautious, Auto-edit,
Plan, and Bypass via \`Shift+Tab\`. The same modes are now one click (or one
keyboard shortcut) away inside Obsidian:

- **Cautious** confirms each tool call before running it.
- **Auto-edit** lets file changes flow without prompts but still asks for
  shell and web operations.
- **Plan** keeps Claude read-only and asks it to propose a plan before
  touching anything.
- **Bypass** auto-approves every action for trusted vaults.

### Settings that put you in control

The brand-new **Settings tab** gives you direct access to the parts of the
integration that used to live in opaque internals: the path to the \`claude\`
binary, the default permission mode for new sessions, and a tools table
where you decide which Claude tools skip the permission prompt. Bind your
own keyboard shortcut for cycling modes — the plugin reads Obsidian's
hotkey manager and shows the currently bound key.

### Auto-detect that finally works everywhere

The plugin now finds your \`claude\` CLI regardless of how you installed it:
the new official installer (\`~/.local/bin/claude\`), Homebrew, npm-global,
Bun, Volta, npx caches, or a custom path. macOS, Linux, and Windows are
all covered with the right extension and search rules.

Repository: <https://github.com/SmartAndPoint/obsidian-claude-code>
`,
};

/**
 * Look up release notes for a specific version. Falls back to the latest
 * release if the requested version isn't in the map.
 */
export function getReleaseNotes(version: string): string | null {
  return RELEASE_NOTES[version] ?? null;
}
