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
- [x] Error handling

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

## Phase 4: Tool Calls & Permissions

### 4.1 Permission Requests UI
- [ ] Modal for tool call confirmation
- [ ] Display: which tool, what parameters
- [ ] Buttons: Approve / Deny / Approve All
- [ ] Timeout handling

### 4.2 Edit Review
- [ ] Diff viewer for proposed file changes
- [ ] Syntax highlighting (if possible via Obsidian API)
- [ ] Accept / Reject changes
- [ ] Batch operations

### 4.3 Terminal Output
- [ ] Display stdout/stderr from commands
- [ ] Distinguish interactive vs background terminals
- [ ] Copy to clipboard

---

## Phase 5: Vault Integration

### 5.1 @-mentions
- [ ] Autocomplete for vault files when typing @
- [ ] Fuzzy search by note names
- [ ] Add file content to context

### 5.2 File Operations
- [ ] Map vault path ↔ ACP file system
- [ ] Read files via Obsidian API (vault.read)
- [ ] Write files via Obsidian API (vault.modify/create)
- [ ] Handle .obsidian and other system folders

### 5.3 Obsidian-specific Context
- [ ] Frontmatter parsing
- [ ] Wikilinks resolution
- [ ] Tags extraction
- [ ] Possibly: backlinks graph

---

## Phase 6: Settings & Configuration

### 6.1 Plugin Settings
- [ ] Settings tab in Obsidian
- [ ] Path to claude-code-acp (if not global)
- [ ] ANTHROPIC_API_KEY (or use from env)
- [ ] Default model selection
- [ ] Auto-connect on startup

### 6.2 Per-conversation Settings
- [ ] System prompt customization
- [ ] Context window management
- [ ] Conversation history persistence

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

### 8.1 Custom Slash Commands
- [ ] Register custom commands
- [ ] Obsidian templates integration

### 8.2 Multi-conversation
- [ ] Multiple parallel chats
- [ ] Conversation history

### 8.3 MCP Integration
- [ ] Client MCP servers via ACP
- [ ] Obsidian-specific MCP server (tags, graph, search)

---

## Implementation Order

```
Phase 1 (Foundation) ✅
    │
    ▼
Phase 2 (ACP Connection) ✅ ──── Milestone: connection works
    │
    ▼
Phase 3 (Basic Chat) ✅ ──────── Milestone: can chat
    │
    ▼
Phase 7 (Distribution) ✅ ────── Milestone: installable release
    │
    ▼
Phase 4 (Tool Calls) ─────────── Milestone: agentic workflow
    │
    ▼
Phase 5 (Vault) ──────────────── Milestone: notes integration
    │
    ▼
Phase 6 (Settings) ───────────── Milestone: production-ready
    │
    ▼
Phase 8 (Advanced) ───────────── Future iterations
```

---

## Technical Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Obsidian API limited for complex UI | Use React via `createRoot` (supported) |
| stdio transport in Electron | Node.js available, child_process works |
| ACP SDK may change | Pin version, watch for breaking changes |
| Large vault files | Streaming, pagination, lazy loading |

---

## Current Status

✅ **Phase 1-3, 7 COMPLETED** — Plugin ready for testing and distribution

**What works:**
- ACP connection to claude-code-acp (headless test passed)
- Chat UI with markdown rendering
- Streaming responses
- Status indicator
- Ribbon icon and commands
- GitHub Actions release workflow

**Next Step**: Phase 4 — Tool Calls & Permissions
