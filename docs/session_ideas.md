# Session Management Ideas

> Discussion date: 2026-01-26
> Status: Research phase → **ACP Investigation Complete**
> Last updated: 2026-01-26

## Problem Statement

Current behavior:
- Each connection spawns fresh `claude-code-acp` process
- Session lost on disconnect (close Obsidian, connection drop)
- No conversation history between sessions
- User must re-explain context every time

## What "Session" Means

| Layer | What's Stored | Where |
|-------|---------------|-------|
| **UI History** | Messages, tool cards, diffs | Obsidian plugin |
| **Conversation** | User/assistant messages | Claude API context |
| **Project Context** | Files read, understanding | Claude's working memory |
| **Permissions** | Approved tools/paths | Session state |
| **Transcript** | Full interaction log | `~/.claude/projects/.../*.jsonl` |

## Option 1: Client-Side Only (Simple)

Store conversation UI in Obsidian plugin data.

```typescript
interface ConversationHistory {
  id: string;
  projectPath: string;
  created: Date;
  updated: Date;
  messages: Message[];
  toolCalls: ToolCallRecord[];
}

// Storage location
// Option A: plugin.data (invisible to user)
// Option B: vault://claudecode/sessions/*.json (visible, searchable)
```

**Flow:**
1. Save messages to Obsidian storage on each exchange
2. On reconnect, show saved UI history
3. Optionally replay context to Claude: "Here's our previous conversation: ..."

**Pros:**
- Simple to implement
- User controls their data
- Works offline (for viewing)
- Searchable in Obsidian

**Cons:**
- Claude doesn't truly "remember" — just sees replayed text
- Large context = expensive tokens
- No tool state, permission state
- Feels like "fake" continuity

## Option 2: Server-Side Sessions (Claude Code Native)

Use Claude Code's built-in session management.

```bash
# Session files location
~/.claude/projects/-Users-username-Projects-xyz/
├── abc123def456.jsonl    # Session transcript

# Resume commands (CLI)
claude --continue                  # Most recent session
claude --resume <session-id>      # Specific session
```

**Question:** Does `claude-code-acp` support session parameters?

```typescript
// Hypothetical
const client = spawn('claude-code-acp', [
  '--project', '/path/to/project',
  '--resume', 'session-id',        // ?
  '--continue',                    // ?
]);
```

**Pros:**
- True context preservation
- Claude actually remembers
- Efficient (no token replay)
- Consistent with CLI behavior

**Cons:**
- Depends on ACP server support
- Less control over data
- Session files in `~/.claude/` (outside vault)

## Option 3: Hybrid (Best of Both)

```
Obsidian (UI Layer)              Claude Code (Agent Layer)
┌─────────────────┐              ┌─────────────────┐
│ Conversation UI │◄────────────►│ Session State   │
│ - Messages      │   linked by  │ - Context       │
│ - Tool cards    │   session_id │ - Permissions   │
│ - User prefs    │              │ - Transcript    │
└─────────────────┘              └─────────────────┘
        │                                │
        ▼                                ▼
  plugin.data.json            ~/.claude/projects/...
```

**Flow:**
1. On connect, check for existing sessions (from Claude Code)
2. Let user pick: "New" or "Resume [session-name]"
3. Store UI state in Obsidian, link to Claude session ID
4. On reconnect, resume both UI and Claude session

## Implementation Phases

### Phase 1: UI History Only (Quick Win)

Save conversation to plugin data for viewing/searching.

```typescript
// On message received
await this.saveConversation(currentConversation);

// On plugin load
const history = await this.loadConversations();
// Show conversation list in sidebar or modal
```

Features:
- [ ] Save messages to plugin data
- [ ] Conversation list view
- [ ] Load/view past conversations
- [ ] Search in history
- [ ] Export to Obsidian note

### Phase 2: Context Replay (Medium)

Replay conversation context to new Claude session.

```typescript
// On "resume" action
const conversation = await this.loadConversation(id);
const contextPrompt = this.buildContextPrompt(conversation);
await this.sendMessage(contextPrompt);
```

Features:
- [ ] Build context summary from history
- [ ] Smart truncation for token limits
- [ ] "Resume" button on past conversations

### Phase 3: Native Session Resume (If ACP Supports)

Use Claude Code's session management via ACP.

```typescript
// On connect with session
await this.client.initialize({
  sessionId: savedSessionId,
  // or
  resumeLatest: true,
});
```

Features:
- [ ] Detect available sessions
- [ ] Session picker UI
- [ ] Link Obsidian conversation to Claude session
- [ ] Auto-resume on reconnect

## Research Findings (2026-01-26)

### ACP SDK 0.13.0 Session Support

**Confirmed: ACP protocol HAS session management built-in!**

#### Available Methods in SDK

| Method | Stability | SDK Method | Description |
|--------|-----------|------------|-------------|
| `session/load` | ✅ Stable | `loadSession()` | Load session, replays history via updates |
| `session/list` | ⚠️ UNSTABLE | `unstable_listSessions()` | List available sessions |
| `session/resume` | ⚠️ UNSTABLE | `unstable_resumeSession()` | Resume without replay |
| `session/fork` | ⚠️ UNSTABLE | `unstable_forkSession()` | Fork at specific point |

#### Agent Capabilities (from schema)

```typescript
interface AgentCapabilities {
  loadSession?: boolean;  // Stable - top-level capability
  sessionCapabilities?: {
    fork?: SessionForkCapabilities;   // UNSTABLE
    list?: SessionListCapabilities;   // UNSTABLE
    resume?: SessionResumeCapabilities; // UNSTABLE
  };
}
```

#### Our Implementation Status

**Already implemented in `acp-core`:**
- ✅ `IAcpClient.listSessions()` - Interface defined
- ✅ `IAcpClient.loadSession()` - Interface defined
- ✅ `IAcpClient.resumeSession()` - Interface defined
- ✅ `IAcpClient.forkSession()` - Interface defined
- ✅ `NativeAcpClient` - All methods implemented
- ✅ `ZedAcpAdapter` - All methods implemented

**Not yet exposed:**
- ❌ `ObsidianAcpClient` does not expose session methods
- ❌ No UI for session management
- ❌ Not tested with real `claude-code-acp` binary

#### Key Code Locations

```
src/acp-core/interfaces/types.ts:84-97    # SessionCapabilities type
src/acp-core/interfaces/types.ts:283-334  # List/Load/Fork/Resume params/results
src/acp-core/interfaces/client.ts:230-265 # IAcpClient session methods
src/acp-core/adapters/native-client.ts:540-648 # Implementation
```

### Next Steps

1. **Test with real binary** - Verify `claude-code-acp` reports session capabilities
2. **Expose in ObsidianAcpClient** - Add `listSessions()`, `loadSession()`, etc.
3. **Build Session UI** - Session picker, resume button
4. **Handle UNSTABLE APIs** - Graceful fallback if not supported

## Research Tasks

- [x] Check `@agentclientprotocol/sdk` for session params ✅ Found!
- [ ] Check `claude-code-acp` source/CLI flags
- [ ] Analyze `~/.claude/projects/` session file format
- [ ] See how Zed editor handles sessions
- [ ] Test CLI `--resume` and `--continue` behavior
- [ ] **NEW:** Test `listSessions()` with real binary
- [ ] **NEW:** Verify agent advertises session capabilities

## Implementation Plan (v2 - Usage-Based Scope)

### Design Decisions (2026-01-26)

1. **Storage format**: Markdown files for semantic search & Obsidian MCP compatibility
2. **Naming**: Auto-generate first, user can rename via chat command
3. **Cleanup**: Keep forever (for now)
4. **Location**: `/vault/claude-code/sessions/*.md`

### Storage Format

```markdown
<!-- /vault/claude-code/sessions/sess-abc123.md -->
---
id: sess-abc123
claudeSessionId: claude-xyz789
title: "API Design Discussion"
created: 2026-01-26T10:00:00Z
updated: 2026-01-26T12:30:00Z
referencedFiles:
  - path: projects/webapp/api/routes.ts
    type: read
    addedAt: 2026-01-26T10:05:00Z
  - path: notes/api-patterns.md
    type: explicit
    addedAt: 2026-01-26T10:02:00Z
referencedFolders:
  - projects/webapp/
  - notes/
tags:
  - api
  - typescript
messageCount: 24
---

# API Design Discussion

## User (10:00)
Help me design the authentication flow for [[projects/webapp/api/routes.ts]]

## Assistant (10:01)
I'll analyze the current routes and suggest an authentication approach...

[Tool: Read projects/webapp/api/routes.ts]

Based on the code, I recommend...

## User (10:15)
Can you also check [[notes/api-patterns.md]] for our existing patterns?

...
```

### Implementation Phases

#### Phase 1: Foundation ✅ DONE
- [x] **#1 Expose session methods in ObsidianAcpClient**

#### Phase 2: Session Storage Service
- [ ] **#6 Create VaultSessionService**
  - Interface for session CRUD operations
  - Markdown serialization/deserialization
  - YAML frontmatter for metadata
  - File: `src/services/VaultSessionService.ts`

- [ ] **#7 Create session folder structure**
  - Ensure `/vault/claude-code/sessions/` exists
  - Create index file for quick lookup
  - File operations via Obsidian Vault API

#### Phase 3: Reference Tracking
- [ ] **#8 Track file references during chat**
  - Extract [[wikilinks]] from user messages
  - Hook tool calls for read/write operations
  - Update session metadata in real-time
  - Files: `src/views/ChatView.ts`, `src/acpClient.ts`

- [ ] **#9 Auto-generate session titles**
  - From first user message (truncated)
  - Fallback to referenced files/folders
  - Fallback to timestamp
  - File: `src/services/VaultSessionService.ts`

#### Phase 4: Session Persistence
- [ ] **#10 Save session on each message**
  - Append message to session .md file
  - Update frontmatter metadata
  - Handle concurrent writes safely

- [ ] **#11 Load sessions on plugin start**
  - Read all session files from folder
  - Parse frontmatter for index
  - Cache in memory for quick access

#### Phase 5: Session UI
- [ ] **#3 Build SessionPicker component** (updated)
  - Show sessions from VaultSessionService
  - Display: title, files, folders, message count, date
  - Filter/search by file or folder
  - File: `src/components/SessionPicker.ts`

- [ ] **#12 Add session info to ChatView header**
  - Show current session title
  - Click to rename
  - Show referenced files count

- [ ] **#13 Rename session via chat command**
  - `/rename New Title` command
  - Update frontmatter and filename
  - Instant feedback in UI

#### Phase 6: Resume Integration
- [ ] **#5 Connect-with-session flow** (updated)
  - Show SessionPicker on connect
  - New session vs Resume existing
  - Link vault session to Claude session
  - Restore UI from cached messages

- [ ] **#2 Test with real binary** (moved here)
  - Verify session capabilities
  - Test full resume flow

### File Structure

```
src/
├── services/
│   └── VaultSessionService.ts    # NEW: Session CRUD & storage
├── components/
│   └── SessionPicker.ts          # NEW: Session selection UI
├── views/
│   └── ChatView.ts               # MODIFY: Add session tracking
└── acpClient.ts                  # DONE: Session methods exposed

vault/
└── claude-code/
    └── sessions/
        ├── sess-abc123.md
        ├── sess-def456.md
        └── ...
```

## Open Questions

1. **Storage location for UI history?**
   - Plugin data (invisible) vs vault file (visible)
   - **Recommendation**: Plugin data for MVP, vault file as export option

2. **Session scope?**
   - Per-vault? Per-project folder? Global?
   - **Recommendation**: Per-project (cwd), matching Claude Code behavior

3. **Conflict handling?**
   - What if session was modified outside Obsidian?
   - **Recommendation**: Always prefer Claude's session state, UI is just cache

4. **Session cleanup?**
   - Auto-delete old sessions? User-managed?
   - **Recommendation**: User-managed, with "clear old" option in settings

5. **UNSTABLE API handling?**
   - `listSessions`, `resumeSession`, `forkSession` are marked UNSTABLE
   - **Recommendation**: Check capabilities first, graceful fallback to `loadSession` only

## References

- Claude Code session files: `~/.claude/projects/`
- ACP SDK: `@agentclientprotocol/sdk`
- Related: claudecode-telegram uses `--resume` and `--continue` CLI flags
