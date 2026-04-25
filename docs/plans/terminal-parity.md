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

### 1.2.1 Tools table layout (Phase 1 follow-up)

User feedback: native checkboxes don't render well in Obsidian dark theme,
and the controlEl-based layout collapses to a vertical list. Replace with
a 4-column table below the description:

| ☑ | Name | Description | Example |
|---|------|-------------|---------|
| ☑ | Read | Read file contents | `Read("/notes/idea.md")` |
| ☐ | Write | Create/overwrite files | `Write("/path/file.ts", ...)` |

Implementation:
- Tool metadata moved into `KNOWN_TOOLS` array (id, label, desc, example).
- Container is a CSS grid `auto auto 1fr 1fr` rendered in `containerEl`
  (NOT inside Setting.controlEl) — full width.
- Whole row is the click target; checkbox is visual-only.
- Hover highlights the row; checked state uses `--interactive-accent` for
  the checkbox fill so it's visible in both light and dark themes.

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

### 2.2 Settings.local.json editor (file-backed permission rules)

Generalize ad-hoc `addDirectoryToSettings` into `src/settingsFileManager.ts`
with `readLocalSettings()` / `mergeLocalSettings()` / `writeLocalSettings()`.

Three SettingTab table sections, all reading/writing `<vault>/.claude/settings.local.json`:

#### File access table
| Path / glob | Operations | Action | × |
|---|---|---|---|
| /Users/me/Vault/** | ☑Read ☑Write | ●Allow ○Deny | × |
| /Users/me/.ssh/** | ☑Read ☑Write | ○Allow ●Deny | × |

Each row maps to 1-3 entries in `permissions.allow|deny`: `Read(...)`, `Write(...)`,
`Edit(...)`. Glob patterns supported (`**` recursive). Deny wins over Allow.
"Browse folder…" button uses native Electron picker.

#### Workspace dirs (`additionalDirectories`)
Separate table — these expand SCOPE, not operations.

#### Web access table
| Domain | Tools | Action | × |
|---|---|---|---|
| docs.anthropic.com | ☑Fetch ☑Search | ●Allow | × |
| github.com | ☑Fetch ☐Search | ●Allow | × |

Maps to `WebFetch(domain:...)` / `WebSearch(domain:...)`. Note: no
"write to URL" tool exists in core Claude — POSTs go via MCP servers (§2.5).

#### Bash patterns (advanced, collapsed by default)
| Pattern | Action | × |
|---|---|---|
| npm:* | ●Allow | × |
| rm:* | ●Deny | × |

### 2.3 Auto-persist in-session approvals

When user picks "Always allow" in the chat permission card, the rule must
persist across sessions automatically (not just current session).

- Change `canUseTool` always-allow handler in `sdk-client.ts`: pass
  `destination: "localSettings"` (not `"session"`) so SDK writes to
  `.claude/settings.local.json` itself.
- Verify `additionalDirectories` writes from the chat permission flow
  also land in the file (already does via `addDirectoryToSettings` —
  just confirm).
- Reopen Settings tab → tables reflect newly added rules from chat.
- Tables remain editable: user can revoke an auto-added rule via "×".

### 2.4 Mode-aware status banner

- Plan mode: persistent banner "Planning mode — Claude will not edit files
  until you approve the plan." Dismisses on mode switch.
- Bypass mode: red banner "Bypass mode — all permissions auto-approved.
  Use carefully."

### 2.5 MCP server management

Adds a new top-level section to SettingTab:

```
MCP servers
─────────────────────────────────────────────────────────────────
Extend Claude with custom tools (databases, APIs, services).

┌─────────────────┬──────────┬──────────────────────────┬───┬───┐
│ Name            │ Type     │ Command / URL            │ ✓ │ × │
├─────────────────┼──────────┼──────────────────────────┼───┼───┤
│ obsidian-vault  │ stdio    │ npx mcp-obsidian         │ ✓ │ × │
│ atlassian       │ http     │ https://mcp.atlas.../sse │ ✓ │ × │
└─────────────────┴──────────┴──────────────────────────┴───┴───┘
[+ Add server]    [Test all]
```

Per-server modal supports:
- **Local stdio**: name, command, args[], env vars
- **HTTPS/SSE**: name, URL, optional headers (Authorization: Bearer …),
  optional OAuth token (paste-from-browser flow)
- **Test connection** button: spawns/connects, runs `tools/list`, shows
  result count or error inline.

Storage: `.claude/settings.local.json → mcpServers` (Claude's standard
schema). SDK auto-loads via `settingSources` — no extra wiring.

### 2.6 Verification

- `npm run build` clean.
- Plan mode → Claude proposes plan → approve → continues with edits.
- File access table: add `/some/path/**` Allow Read+Write → operation
  on that path no longer prompts.
- "Always allow" in chat → row appears in File access table next
  session restart.
- Web access table: deny rule for `untrusted.com` blocks WebFetch.
- additionalDirectories edits land in the file and unlock paths.
- MCP local stdio: add server, "Test" → tool count returned.
- MCP HTTPS: paste auth token → connection works.
- Banners appear/disappear correctly on mode switch.

### Commit

`feat: plan mode UX + settings.local.json editor + MCP server management`

**STOP — user tests Phase 2.**

---

## Out of scope (potential Phase 3+)

- Subagent inline rendering inside Task tool cards
- Hooks (PreToolUse/PostToolUse) editor
- Output style picker
- Memory files (CLAUDE.md hierarchy) editor
- MCP OAuth flow with browser callback (Phase 2 supports paste-token only)

Pick up after the user validates Phase 1+2.

---

## Architectural principle

Plugin holds **no duplicate state**. Configuration is one of two things:
- **Runtime SDK options** (permission mode, allowedTools) — passed per `query()`.
- **`.claude/settings.local.json`** — written by plugin, read by SDK via
  `settingSources: ["user", "project", "local"]`.

This means everything user configures in plugin UI is the same config terminal
sees. No drift, no sync layer.
