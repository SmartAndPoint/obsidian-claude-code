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

## Phase 4: Full Agent UI ✅ COMPLETED

### 4.1 Message Types & Components ✅
- [x] Thinking Block (collapsible agent reasoning)
- [x] Tool Call Cards with status
- [x] Permission Cards (inline)
- [x] Diff Viewer (Cursor-style full file view)
- [x] Plan View

### 4.2 ACP Session Updates ✅
| ACP Update Type | UI Component | Status |
|-----------------|--------------|--------|
| `agent_thought_chunk` | Thinking Block | ✅ |
| `agent_message_chunk` | Response Block | ✅ |
| `user_message_chunk` | User Message | ✅ |
| `tool_call` | Tool Card | ✅ |
| `tool_call_update` | Tool Card Update | ✅ |
| `plan` | Plan View | ✅ |

### 4.3 Components ✅
- [x] ThinkingBlock - collapsible thinking display
- [x] ToolCallCard - tool status with clickable paths
- [x] PermissionCard - inline permission requests
- [x] DiffViewer/DiffModal - full file diff with accept/reject
- [x] Plan View - todo-style progress display

---

## Phase 5: Vault Integration ✅ PARTIAL

### 5.1 File References
- [x] `[[` syntax for file insertion with fuzzy search
- [x] `Cmd+Shift+.` for code selection with line markers
- [x] Drag & drop files from vault
- [x] Clickable `[[file]]` links in messages
- [x] Click on `[[file]] (lines X-Y)` opens file and selects lines

### 5.2 File Operations
- [x] Implement `readTextFile` → `vault.read()`
- [x] Implement `writeTextFile` → `vault.modify()` / `vault.create()`
- [ ] Handle binary files gracefully
- [ ] Respect `.obsidian` and other system folders

### 5.3 Obsidian-specific Context
- [ ] Frontmatter parsing and display
- [ ] Wikilinks resolution
- [ ] Tags extraction
- [ ] Backlinks information

---

## Phase 6: Settings & Configuration 🔄 PARTIAL

### 6.1 Plugin Settings Tab
- [x] API key input (secure storage)
- [x] Auto-download binary option
- [ ] Path to claude-code-acp binary (manual override)
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
- [x] BRAT: add repository URL for beta testing
- [ ] Community Plugins: PR submitted (#9593), awaiting approval

---

## Phase 8: ACP Core Module ✅ COMPLETED (NEW)

### 8.1 Architecture
- [x] Create `src/acp-core/` module with clean interfaces
- [x] Define `IAcpClient` interface for all implementations
- [x] Factory pattern with `createAcpClient()` and implementation registration
- [x] Type definitions aligned with SDK 0.13.0

### 8.2 Implementations
- [x] `ZedAcpAdapter` - adapter for Zed-style integration
- [x] `NativeAcpClient` - pure TypeScript implementation
- [x] Auto-registration of implementations on import

### 8.3 Testing
- [x] 209 comprehensive tests covering 100% of public API
- [x] Unit tests for all type categories
- [x] Integration tests with real ACP connection
- [x] `npm run test:acp` command

### 8.4 Plugin Migration
- [x] Migrate `acpClient.ts` to use acp-core
- [x] Update all components to use acp-core types
- [x] Remove direct SDK imports from UI components

---

## Phase 9: Advanced Features (Future)

### 9.1 Conversation Management
- [ ] Multiple parallel conversations
- [ ] Conversation history persistence
- [ ] Export conversation to note
- [ ] Search in conversation history

### 9.2 Custom Slash Commands
- [ ] `/help` - show available commands
- [ ] `/clear` - clear conversation
- [ ] `/model` - switch model
- [ ] `/template` - use Obsidian template

### 9.3 MCP Integration
- [ ] Client MCP servers via ACP
- [ ] Obsidian-specific MCP server (tags, graph, search)
- [ ] Custom MCP server configuration

### 9.4 Advanced UI
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
Phase 4 (Full Agent UI) ✅
    │
    ▼
Phase 7 (Distribution) ✅
    │
    ▼
Phase 8 (ACP Core) ✅ ◀── COMPLETED
    │
    ▼
Phase 5 (Vault Integration) ◀── NEXT FOCUS
    │
    ▼
Phase 6 (Settings)
    │
    ▼
Phase 9 (Advanced)
```

---

## Current Status (v1.0.9)

✅ **Completed:**
- Phases 1-4, 7, 8 fully completed
- Phase 5-6 partially completed
- ACP connection with full agent UI
- acp-core module with 209 tests
- Plugin migrated to use acp-core
- PR #9593 submitted to obsidian-releases

**Next Steps (Priority Order):**

### HIGH PRIORITY
1. **Community Plugins approval** — Wait for PR #9593 review
2. **Settings Tab completion** — More configuration options

### MEDIUM PRIORITY
3. **Vault Integration** — Frontmatter, wikilinks, tags
4. **Binary management** — Better error handling, manual path override

### LOW PRIORITY
5. **Chat history** — Save/load conversations
6. **MCP Integration** — Custom MCP servers
