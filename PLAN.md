# PLAN.md — Obsidian Claude Code Plugin Development Plan

## Phase 1: Project Structure ✅ COMPLETED

### 1.1 Project Initialization
- [x] Create Obsidian plugin structure (package.json, manifest.json, tsconfig.json)
- [x] Configure esbuild for bundling
- [x] Create main.ts with plugin registration
- [x] Add hot-reload for development (npm run dev)

### 1.2 Dependencies
```json
{
  "dependencies": {
    "@agentclientprotocol/sdk": "^0.13.0"
  },
  "devDependencies": {
    "obsidian": "^1.5.7",
    "esbuild": "^0.20.0",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0"
  }
}
```

---

## Phase 2: ACP Connection ✅ COMPLETED

### 2.1 Spawn claude-code-acp
- [x] Create `src/acpClient.ts` — connection manager
- [x] Implement spawn child process for `claude-code-acp`
- [x] Configure JSON-RPC transport over stdio
- [x] Handle lifecycle: start on activation, graceful shutdown

### 2.2 ClientSideConnection
- [x] Initialize `ClientSideConnection` from SDK
- [x] Implement incoming message handling from agent
- [x] Implement user message sending
- [x] Error handling and logging

### 2.3 Connection Verification
- [x] Command Palette: "Claude Code: Connect"
- [x] Headless test: `npm run test:headless` — PASSED ✅
- [x] Console logging for debugging

---

## Phase 3: Basic Chat UI ✅ COMPLETED

### 3.1 Chat View
- [x] Create custom View (`ChatView extends ItemView`)
- [x] Register view in plugin
- [x] Command "Claude Code: Open Chat"
- [x] Basic HTML/CSS chat structure
- [x] Ribbon icon for quick access

### 3.2 Message Rendering
- [x] Markdown message rendering (Obsidian MarkdownRenderer)
- [x] Display user and assistant messages
- [x] Streaming support (partial messages)
- [x] Auto-scroll to bottom on new messages

### 3.3 Input
- [x] Textarea for message input
- [x] Send on Enter (Shift+Enter for newline)
- [x] Send button
- [x] Status indicator (Disconnected/Connecting/Connected/Thinking)

---

## Phase 4: Full Agent UI (Claude Code Experience)

This phase transforms basic chat into full Claude Code experience with all agent controls.

### 4.1 Message Types & Components

Based on ACP `sessionUpdate` types, we need to render:

```
┌─────────────────────────────────────────────────────────────┐
│ Chat View                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ User Message ─────────────────────────────────────────┐ │
│  │ "Help me refactor this function"                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ Agent Thinking ───────────────────────────────────────┐ │
│  │ 💭 Analyzing code structure...                         │ │
│  │    Looking at function dependencies...                 │ │
│  │    (collapsible, shows thinking process)               │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ Tool Call: Read File ─────────────────────────────────┐ │
│  │ 📖 Reading src/utils.ts                                │ │
│  │ Status: ✅ completed                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ Tool Call: Edit File ─────────────────────────────────┐ │
│  │ ✏️ Editing src/utils.ts                                │ │
│  │ ┌─ Diff View ────────────────────────────────────────┐ │ │
│  │ │ - function old() {                                 │ │ │
│  │ │ + function new() {                                 │ │ │
│  │ └────────────────────────────────────────────────────┘ │ │
│  │ [✓ Accept] [✗ Reject] [👁 View Full]                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ Permission Request ───────────────────────────────────┐ │
│  │ ⚠️ Claude wants to run a command:                      │ │
│  │ $ npm test                                             │ │
│  │ [✓ Allow] [✓ Allow All] [✗ Deny]                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ Terminal Output ──────────────────────────────────────┐ │
│  │ 🖥️ npm test                                            │ │
│  │ ┌────────────────────────────────────────────────────┐ │ │
│  │ │ PASS src/utils.test.ts                             │ │ │
│  │ │ ✓ should format date (5ms)                         │ │ │
│  │ │ ✓ should parse input (2ms)                         │ │ │
│  │ └────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ Agent Question ───────────────────────────────────────┐ │
│  │ ❓ Which testing framework do you prefer?              │ │
│  │ [Jest] [Vitest] [Mocha] [Other...]                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ Agent Response ───────────────────────────────────────┐ │
│  │ ✅ Done! I've refactored the function:                 │ │
│  │ • Extracted helper methods                             │ │
│  │ • Added type annotations                               │ │
│  │ • Updated tests                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [Type your message...]                            [Send]    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 ACP Session Updates to Handle

| ACP Update Type | UI Component | Description |
|-----------------|--------------|-------------|
| `agent_thought_chunk` | Thinking Block | Agent's reasoning process (collapsible) |
| `agent_message_chunk` | Response Block | Final response text |
| `user_message_chunk` | User Message | Echo of user input |
| `tool_call` | Tool Card | Tool invocation with status |
| `tool_call_update` | Tool Card Update | Progress/completion |
| `plan` | Plan View | Multi-step plan display |

### 4.3 Component: Thinking Block
```
┌─ 💭 Thinking ──────────────────────────────────── [▼ Collapse]
│ Let me analyze this code...
│ I can see the function has several issues:
│ 1. No error handling
│ 2. Hardcoded values
│ ...
└────────────────────────────────────────────────────────────────
```
- [ ] Collapsible by default (show summary)
- [ ] Expand to see full thinking
- [ ] Streaming text as agent thinks
- [ ] Different styling from response

### 4.4 Component: Tool Call Card
```
┌─ 🔧 Tool: Read File ────────────────────────────── Status: ✅
│ Path: src/components/Button.tsx
│
│ [📋 Copy Path] [👁 View Content]
└────────────────────────────────────────────────────────────────
```
- [ ] Show tool name and icon
- [ ] Display parameters (file path, command, etc.)
- [ ] Status indicator (pending → running → completed/failed)
- [ ] Quick actions (copy, view)

### 4.5 Component: Permission Request Modal
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️  Permission Required                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Claude wants to execute a command:                          │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ $ rm -rf node_modules && npm install                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ○ Allow once                                                │
│ ○ Allow for this session                                    │
│ ○ Always allow (add to whitelist)                           │
│                                                             │
│              [Cancel]  [Allow]                              │
└─────────────────────────────────────────────────────────────┘
```
- [ ] Modal overlay
- [ ] Show tool name and full parameters
- [ ] Permission options (once, session, always)
- [ ] Keyboard shortcuts (Enter = Allow, Esc = Cancel)
- [ ] Timeout indicator

### 4.6 Component: Diff Viewer
```
┌─ ✏️ Edit: src/utils.ts ─────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────┐ │
│ │   10 │   function formatDate(date) {                    │ │
│ │ - 11 │     return date.toString();                      │ │
│ │ + 11 │     return new Intl.DateTimeFormat('en-US', {    │ │
│ │ + 12 │       dateStyle: 'medium'                        │ │
│ │ + 13 │     }).format(date);                             │ │
│ │   14 │   }                                              │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [✓ Accept] [✗ Reject] [📋 Copy] [👁 Full File]              │
└─────────────────────────────────────────────────────────────┘
```
- [ ] Side-by-side or inline diff view
- [ ] Syntax highlighting
- [ ] Line numbers
- [ ] Accept/Reject buttons
- [ ] Copy diff to clipboard
- [ ] View full file context

### 4.7 Component: Terminal Output
```
┌─ 🖥️ Terminal: npm test ──────────────────────── [📋 Copy All]
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ > jest --coverage                                       │ │
│ │                                                         │ │
│ │ PASS src/utils.test.ts                                  │ │
│ │   ✓ formatDate returns correct format (5ms)            │ │
│ │   ✓ parseInput handles edge cases (3ms)                │ │
│ │                                                         │ │
│ │ Test Suites: 1 passed, 1 total                         │ │
│ │ Tests:       2 passed, 2 total                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Exit code: 0                                                │
└─────────────────────────────────────────────────────────────┘
```
- [ ] Monospace font
- [ ] ANSI color support (or strip colors)
- [ ] Auto-scroll during execution
- [ ] Copy output button
- [ ] Collapsible for long output
- [ ] Exit code indicator

### 4.8 Component: Agent Question
```
┌─ ❓ Claude is asking ────────────────────────────────────────┐
│                                                             │
│ Which package manager do you want to use?                   │
│                                                             │
│ [npm]  [yarn]  [pnpm]  [bun]                               │
│                                                             │
│ Or type custom answer: [_______________]                    │
└─────────────────────────────────────────────────────────────┘
```
- [ ] Display question text
- [ ] Render provided options as buttons
- [ ] Free text input option
- [ ] Submit on click or Enter

### 4.9 Component: Plan/Todo View
```
┌─ 📋 Plan ────────────────────────────────────────────────────┐
│                                                             │
│ ✅ 1. Read current implementation                           │
│ ✅ 2. Identify refactoring opportunities                    │
│ 🔄 3. Apply changes to utils.ts                             │
│ ⏳ 4. Update tests                                          │
│ ⏳ 5. Run test suite                                        │
│                                                             │
│ Progress: [████████░░░░░░░░] 3/5                            │
└─────────────────────────────────────────────────────────────┘
```
- [ ] List of steps with status icons
- [ ] Progress bar
- [ ] Current step highlighted
- [ ] Collapsible details per step

### 4.10 Implementation Tasks

#### 4.10.1 Refactor Message System
- [ ] Create `MessageRenderer` class
- [ ] Define `MessageBlock` types (thinking, tool, response, question, etc.)
- [ ] Parse ACP updates into message blocks
- [ ] Render blocks with appropriate components

#### 4.10.2 Permission System
- [ ] Implement `PermissionModal` component
- [ ] Handle `requestPermission` callback properly
- [ ] Add permission presets (allow once, session, always)
- [ ] Store session permissions in memory
- [ ] Store persistent permissions in settings

#### 4.10.3 Diff System
- [ ] Implement `DiffViewer` component
- [ ] Parse unified diff format
- [ ] Syntax highlighting with Obsidian's CodeMirror
- [ ] Accept/Reject actions that respond to ACP

#### 4.10.4 Styling
- [ ] Create CSS for all components
- [ ] Support light/dark themes
- [ ] Responsive design for sidebar
- [ ] Animations for status changes

---

## Phase 5: Vault Integration

### 5.1 @-mentions
- [ ] Autocomplete for vault files when typing @
- [ ] Fuzzy search by note names
- [ ] Add file content to context
- [ ] Preview on hover

### 5.2 File Operations via Obsidian API
- [ ] Implement `readTextFile` → `vault.read()`
- [ ] Implement `writeTextFile` → `vault.modify()` / `vault.create()`
- [ ] Handle binary files gracefully
- [ ] Respect `.obsidian` and other system folders

### 5.3 Obsidian-specific Context
- [ ] Frontmatter parsing and display
- [ ] Wikilinks resolution
- [ ] Tags extraction
- [ ] Backlinks information

---

## Phase 6: Settings & Configuration

### 6.1 Plugin Settings Tab
- [ ] Authentication method (API key vs OAuth)
- [ ] API key input (secure storage)
- [ ] Path to claude-code-acp binary
- [ ] Default model selection
- [ ] Auto-connect on startup
- [ ] Theme preferences

### 6.2 Permission Settings
- [ ] Default permission mode (ask, allow, deny)
- [ ] Whitelisted commands
- [ ] Whitelisted file patterns
- [ ] Session vs persistent permissions

### 6.3 UI Settings
- [ ] Show/hide thinking by default
- [ ] Compact vs expanded tool calls
- [ ] Terminal output max lines
- [ ] Diff view style (inline vs side-by-side)

---

## Phase 7: Distribution & Release ✅ COMPLETED

### 7.1 GitHub Actions Release
- [x] Create `.github/workflows/release.yml`
- [x] Auto-build on version tag push
- [x] Generate release with main.js, manifest.json, styles.css
- [x] Version bump script

### 7.2 Installation Methods
- [x] Manual: download from GitHub Releases
- [ ] BRAT: add repository URL for beta testing
- [ ] Community Plugins: submit to Obsidian plugin directory (future)

---

## Phase 8: Advanced Features (Future)

### 8.1 Conversation Management
- [ ] Multiple parallel conversations
- [ ] Conversation history persistence
- [ ] Export conversation to note
- [ ] Search in conversation history

### 8.2 Custom Slash Commands
- [ ] `/help` - show available commands
- [ ] `/clear` - clear conversation
- [ ] `/model` - switch model
- [ ] `/template` - use Obsidian template

### 8.3 MCP Integration
- [ ] Client MCP servers via ACP
- [ ] Obsidian-specific MCP server (tags, graph, search)
- [ ] Custom MCP server configuration

### 8.4 Advanced UI
- [ ] Split view (code + chat)
- [ ] Floating chat window
- [ ] Keyboard shortcuts for all actions
- [ ] Command palette integration

---

## Implementation Order

```
Phase 1 (Foundation) ✅
    │
    ▼
Phase 2 (ACP Connection) ✅
    │
    ▼
Phase 3 (Basic Chat) ✅
    │
    ▼
Phase 7 (Distribution) ✅
    │
    ▼
Phase 4 (Full Agent UI) ◀── CURRENT FOCUS
    │
    ├─► 4.3 Thinking Block
    ├─► 4.4 Tool Call Cards
    ├─► 4.5 Permission Modal
    ├─► 4.6 Diff Viewer
    ├─► 4.7 Terminal Output
    ├─► 4.8 Agent Questions
    └─► 4.9 Plan View
    │
    ▼
Phase 5 (Vault Integration)
    │
    ▼
Phase 6 (Settings)
    │
    ▼
Phase 8 (Advanced)
```

---

## Technical Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Obsidian API limited for complex UI | Use vanilla JS/CSS, avoid React if possible |
| Diff rendering complexity | Use simple line-by-line diff, no fancy libraries |
| Permission UX complexity | Start with simple modal, iterate |
| ACP SDK changes | Pin version, watch for breaking changes |
| Large terminal output | Virtual scrolling, truncate with "show more" |

---

## Current Status

✅ **Phase 1-3, 7 COMPLETED** — Basic plugin working
✅ **Phase 4 PARTIAL** — Agent UI components
✅ **Phase 5 PARTIAL** — Vault integration started

**What works (v0.7.0):**
- ACP connection to claude-code-acp
- Basic chat with streaming
- OAuth and API key authentication
- GitHub Actions release workflow
- Thinking blocks (collapsible)
- Tool call cards with status
- Permission cards (inline)
- File insertion via `[[` syntax with fuzzy search
- Code selection via `Cmd+Shift+.` with line markers
- Drag & drop files from vault
- Clickable `[[file]]` links in messages
- Click on `[[file]] (lines X-Y)` opens file and selects lines
- Display `@N` markers as readable `[[file]] (lines)` format

**Next Steps (Priority Order):**

### HIGH PRIORITY
1. **Convert agent paths to [[file]] links** — When agent mentions `/full/path/file.md`, display as clickable `[[file]]`
2. **Diff Viewer (Phase 4.6)** — Full diff viewing for file edits with accept/reject

### MEDIUM PRIORITY
3. **Settings Tab (Phase 6)** — Port config, hotkeys, UI preferences
4. **File preview on hover** — Show content preview when hovering chips/links

### LOW PRIORITY
5. **Chat history (Phase 8.1)** — Save/load conversations
6. **Agent Questions UI (Phase 4.8)** — Button-based answers
