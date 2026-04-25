# Plan: Terminal-parity UX for Obsidian plugin

Goal: bring the Obsidian chat experience close to the `claude` CLI in terminal —
permission modes, plan mode, auto mode, and a real Settings tab that edits
`.claude/settings.local.json` directly. The plugin stays a thin UI on top of
the SDK; configuration lives in Claude's own settings files.

## Workflow

- After each Phase: commit, stop, user tests manually, gives feedback.
- Only proceed to next Phase after explicit approval.
- No release bump until all phases land and user signs off on the whole thing.

---

## Phase 0 — Claude CLI path resolution (DONE)

Cross-platform `claude` lookup in `sdk-client.ts`:
- env override `CLAUDE_CODE_PATH` / `CLAUDE_BIN`
- `which`/`where` with augmented PATH
- direct probe of known install dirs (macOS/Linux/Windows)

Files: `src/acp-core/adapters/sdk-client.ts`

---

## Phase 1 — SettingTab + permission-mode chip

### 1.1 Plugin settings infrastructure

- New file `src/settings.ts`:
  - `interface PluginSettings` with fields: `claudePath?`, `defaultPermissionMode`,
    `autoApprovedTools: string[]`, `lastUsedMode?`.
  - `DEFAULT_SETTINGS` constant.
- `main.ts`:
  - Add `settings: PluginSettings` field.
  - `loadSettings()` / `saveSettings()` using Obsidian's `loadData`/`saveData`.
  - Pass settings into `ObsidianAcpClient` constructor.

### 1.2 SettingTab (basic)

- New file `src/SettingTab.ts` extending `PluginSettingTab`.
- Sections (only what's needed for Phase 1):
  - **Claude CLI** — path override (text field + "Auto-detect" button that
    calls `resolveClaudePath()` and fills it in; empty = auto).
  - **Permissions** — default mode dropdown (default/acceptEdits/plan/bypass);
    auto-approved tools (multi-checkbox: Read/Write/Edit/Glob/Grep/LS/Bash/WebFetch/WebSearch).
- Register tab in `onload()`.

### 1.3 Mode chip in ChatView

- Add chip element to ChatView header (next to model picker if present).
- Chip shows current mode with icon + label: `🛡 Cautious`, `📝 Plan`,
  `✅ Auto-edit`, `⚡ Auto`, `🚨 Bypass`.
- Click → menu with the 5 options. Selection updates session mode.
- Persist last-used mode per-session to `settings.lastUsedMode`.

### 1.4 Wire mode through SDK

- `SdkAcpClient` exposes `setPermissionMode(mode)`.
- On each `query()` call, build `sdkOptions.permissionMode` from current mode.
- For "Auto" preset: set `permissionMode: "acceptEdits"` and merge
  `[Read, Write, Edit, Glob, Grep, LS, Bash, WebFetch]` into `allowedTools`.
- For "Bypass": `permissionMode: "bypassPermissions"`, no allowedTools filter.
- For "Plan": `permissionMode: "plan"`. (UX in Phase 2.)
- Default-mode → just `permissionMode: "default"`, ask for everything.

### 1.5 Verification

- `npm run build` clean.
- Manual: switch mode in chip → next message respects new mode (e.g. Bash auto-allowed in Auto).
- Setting tab persists across Obsidian restart.
- CLI path override actually used by `connect()`.

### Commit

`feat: settings tab + permission-mode chip for terminal parity`

**STOP — user tests Phase 1.**

---

## Phase 2 — Plan mode UX + settings.local.json editing

### 2.1 Plan mode handler

- Detect `ExitPlanMode` tool call in `onToolCall` (or its SDK equivalent).
- Render special card with:
  - Plan content (markdown).
  - Buttons: "Approve & continue (Auto-edit)" / "Approve & continue (Cautious)" / "Reject".
- On approve: switch mode (chip updates), resume session with the same prompt
  context so Claude continues with edits enabled.
- On reject: send rejection back via `permissionResult`.

### 2.2 Settings.local.json editor

- Generalize existing `addDirectoryToSettings` into `src/settingsFileManager.ts`
  with `readLocalSettings()` / `mergeLocalSettings()` / `writeLocalSettings()`.
- New SettingTab section **Additional Directories**:
  - List current `additionalDirectories` from `<vault>/.claude/settings.local.json`.
  - Buttons to add (folder picker / text input) and remove.
  - On change → write back to file. SDK picks up on next query.
- New SettingTab section **Permission rules** (settings.local.json):
  - Show `permissions.allow` / `permissions.deny` arrays with edit UI.
  - Persist to file.

### 2.3 Mode-aware status banner

- When in Plan mode: persistent banner in chat "Planning mode — Claude will
  not edit files until you approve the plan." Dismisses on mode switch.
- When in Bypass mode: red banner "Bypass mode — all permissions auto-approved.
  Use carefully."

### 2.4 Verification

- `npm run build` clean.
- Manual: plan mode → Claude produces plan → approve → continues with edits.
- additionalDirectories list edits actually update file and unlock paths.
- Banners appear/disappear correctly on mode switch.

### Commit

`feat: plan mode UX + settings.local.json editor`

**STOP — user tests Phase 2.**

---

## Out of scope (potential Phase 3+)

- Subagent inline rendering inside Task tool cards
- MCP server management UI
- Hooks (PreToolUse/PostToolUse) editor
- Output style picker
- Memory files (CLAUDE.md hierarchy) editor

These are valuable but heavier. Pick up after the user validates Phase 1+2 and
decides which one matters most.

---

## Architectural principle

Plugin holds **no duplicate state**. Configuration is one of two things:
- **Runtime SDK options** (permission mode, allowedTools) — passed per `query()`.
- **`.claude/settings.local.json`** — written by plugin, read by SDK via
  `settingSources: ["user", "project", "local"]`.

This means everything user configures in plugin UI is the same config terminal
sees. No drift, no sync layer.
