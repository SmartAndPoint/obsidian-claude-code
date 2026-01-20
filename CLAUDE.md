# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**obsidian-claude-code** — An Obsidian plugin implementing an ACP client for Claude Code integration.

The plugin enables the full Claude Code agent experience directly in Obsidian, similar to integrations in Zed or Cursor. This is not just a simple chat with the API — it's a complete agentic workflow with tool calls, permission requests, edit review, and vault file access.

**Repository**: https://github.com/SmartAndPoint/obsidian-claude-code
**Maintainer**: Evgenii Konev <ekonev@smartandpoint.com>

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Obsidian                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │            obsidian-claude-code-plugin                  │ │
│  │                                                         │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │ │
│  │  │  Chat View  │  │ Diff Viewer │  │ Permission Card │  │ │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │ │
│  │         │                │                  │           │ │
│  │  ┌──────▼────────────────▼──────────────────▼────────┐  │ │
│  │  │              ObsidianAcpClient                    │  │ │
│  │  │                (acpClient.ts)                     │  │ │
│  │  └──────────────────────┬────────────────────────────┘  │ │
│  │                         │                               │ │
│  │  ┌──────────────────────▼────────────────────────────┐  │ │
│  │  │                   acp-core                        │  │ │
│  │  │  ┌─────────────────────────────────────────────┐  │  │ │
│  │  │  │            IAcpClient Interface             │  │  │ │
│  │  │  └─────────────────────────────────────────────┘  │  │ │
│  │  │  ┌─────────────────┐  ┌─────────────────────────┐ │  │ │
│  │  │  │ NativeAcpClient │  │    ZedAcpAdapter       │ │  │ │
│  │  │  └────────┬────────┘  └────────────────────────┘ │  │ │
│  │  └───────────│───────────────────────────────────────┘  │ │
│  └──────────────│──────────────────────────────────────────┘ │
└─────────────────│───────────────────────────────────────────┘
                  │ JSON-RPC over stdio
                  ▼
┌──────────────────────────────────────────────────────────────┐
│                     claude-code-acp                          │
│                (ACP Server / Claude Agent)                   │
│           @zed-industries/claude-code-acp                    │
└──────────────────────────────────────────────────────────────┘
```

## Key Technologies

- **ACP (Agent Client Protocol)** — Communication protocol between editors and AI agents
- **acp-core** — Internal module with types and ACP client implementations
- **claude-code-acp** — ACP server wrapping the Claude Code SDK
- **@agentclientprotocol/sdk** — TypeScript SDK for creating ACP clients
- **Obsidian Plugin API** — API for creating Obsidian plugins

## Project Structure

```
src/
├── main.ts                    # Plugin entry point, commands, ribbon icon
├── acpClient.ts               # ObsidianAcpClient wrapper (uses acp-core)
├── binaryManager.ts           # Binary download and management
├── acp-core/                  # ACP Core Module
│   ├── index.ts               # Public exports
│   ├── factory.ts             # createAcpClient factory
│   ├── interfaces/
│   │   ├── index.ts           # Type exports
│   │   ├── types.ts           # All type definitions (SDK 0.13.0 aligned)
│   │   └── client.ts          # IAcpClient interface
│   ├── adapters/
│   │   ├── index.ts           # Adapter exports
│   │   ├── native-client.ts   # NativeAcpClient implementation
│   │   └── zed-adapter.ts     # ZedAcpAdapter implementation
│   └── __tests__/
│       └── client.test.ts     # 209 comprehensive tests
├── components/
│   ├── ThinkingBlock.ts       # Collapsible thinking display
│   ├── ToolCallCard.ts        # Tool call status cards
│   ├── PermissionCard.ts      # Inline permission requests
│   ├── PermissionModal.ts     # Full-screen permission dialog
│   ├── DiffViewer.ts          # Full-file diff modal
│   ├── CodeViewer.ts          # Code block viewer with syntax highlighting
│   ├── FileSuggest.ts         # [[ file autocomplete
│   ├── CommandSuggest.ts      # / slash command autocomplete
│   └── PathFormatter.ts       # File path formatting utilities
└── views/
    └── ChatView.ts            # Main chat interface

tests/
└── headless-test.ts           # Standalone ACP connection test

eslint.config.mjs              # ESLint config (obsidianmd rules)
styles.css                     # Chat UI styles
manifest.json                  # Obsidian plugin manifest
```

## Development Commands

```bash
# Install dependencies
npm install

# Lint code (uses obsidianmd rules - same as Review Bot)
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Type check
npm run typecheck

# Build plugin (runs lint + typecheck + esbuild)
npm run build

# Development mode with watch
npm run dev

# Run ACP tests (209 tests)
npm run test:acp

# Headless ACP test (no Obsidian needed)
npm run test:headless

# Bump version (runs lint + typecheck first)
npm run version patch|minor|major
```

## Testing in Obsidian

1. Build plugin: `npm run build`
2. Copy `main.js`, `manifest.json`, `styles.css` to vault's `.obsidian/plugins/obsidian-claude-code/`
3. Enable plugin in Obsidian settings
4. Plugin will auto-download `claude-code-acp` binary on first connect

## Key Concepts

### acp-core Module
Internal module with clean architecture:
- `IAcpClient` — Interface for all implementations
- `NativeAcpClient` — Main implementation
- `createAcpClient()` — Factory with dependency injection
- 209 tests covering 100% of public API

### ACP Transport
The plugin spawns `claude-code-acp` as a child process and communicates via JSON-RPC over stdio.

### Vault Integration
Vault files are mapped to the ACP file system protocol. The `[[` syntax allows adding notes to context.

### Permission Model
Tool calls require user confirmation through inline PermissionCard.

### Slash Commands
The `/` prefix triggers command autocomplete with both built-in commands and ACP-provided commands from Claude Code.

## Development Workflow

### Making Changes

1. **Implement feature/fix** — Write code
2. **Lint**: `npm run lint` (auto-runs before build)
3. **Typecheck**: `npm run typecheck` (auto-runs before build)
4. **Build**: `npm run build`
5. **Test**: `npm run test:acp`
6. **Manual test** — Test in Obsidian, wait for user approval
7. Only proceed to release after user confirms it works

### Pull Request Process

**IMPORTANT**: Before creating any PR to this repository, always ask the maintainer for review first!

### Release Process

**IMPORTANT**: Always use `npm run version` script, never edit version manually!

**IMPORTANT**: Tags must be WITHOUT 'v' prefix (Obsidian requirement)!
- ✅ Correct: `1.0.12`
- ❌ Wrong: `v1.0.12`

```bash
# 1. Ensure clean lint and typecheck (version script does this automatically)
npm run version patch   # 1.0.12 -> 1.0.13 (bug fixes)
npm run version minor   # 1.0.12 -> 1.1.0 (new features)
npm run version major   # 1.0.12 -> 2.0.0 (breaking changes)

# 2. Commit changes:
git add -A
git commit -m "release: X.Y.Z - Short description

Maintainer: ekonev@smartandpoint.com"

# 3. Tag and push (NO 'v' prefix!):
git tag X.Y.Z
git push origin main --tags
```

GitHub Actions will automatically create the release with `main.js`, `manifest.json`, `styles.css`.

### Commit Message Format

```
type: Short description

- Detail 1
- Detail 2

Maintainer: ekonev@smartandpoint.com
```

**Types**: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `release`

**Rules**:
- NO Co-Authored-By references to Anthropic/Claude
- Always include `Maintainer: ekonev@smartandpoint.com`

### Version Semantics

- **patch** (0.0.X): Bug fixes, small improvements
- **minor** (0.X.0): New features, backwards compatible
- **major** (X.0.0): Breaking changes

## Code Quality

### ESLint Setup
The project uses `eslint-plugin-obsidianmd` with the same rules as Obsidian's Review Bot. This ensures code passes automated checks before PR submission.

Key rules enforced:
- No direct `style.*` assignments (use CSS classes or `setCssProps`)
- Sentence case for UI text
- Proper promise handling with `void` operator
- No deprecated APIs

### Pre-release Checks
The `npm run version` script automatically runs:
1. `npm run lint` — ESLint with obsidianmd rules
2. `npm run typecheck` — TypeScript type checking

Build will fail if either check fails.

## Git Configuration

Local git config for this repository:
- **Name**: Evgenii Konev
- **Email**: ekonev@smartandpoint.com

This does not affect global git settings.

## Current Version: 1.0.12

Features:
- Full Claude Code agent integration
- acp-core module with 209 tests
- NativeAcpClient implementation
- Slash command autocomplete (`/`)
- File reference autocomplete (`[[`)
- ESLint with obsidianmd rules
- Permission system with inline cards
- Diff viewer for file changes
- Code viewer with syntax highlighting

Organization: SmartAndPoint
