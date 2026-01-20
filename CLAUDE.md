# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Goal

**obsidian-claude-code-plugin** — Obsidian плагин, реализующий ACP-клиент для интеграции с Claude Code.

Плагин позволяет использовать полноценный Claude Code агент прямо в Obsidian, аналогично интеграции в Zed или Cursor. Это не просто чат с API — это agentic workflow с tool calls, permission requests, edit review и доступом к файлам vault.

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

- **ACP (Agent Client Protocol)** — протокол коммуникации между редакторами и AI-агентами
- **acp-core** — внутренний модуль с типами и реализациями ACP клиента
- **claude-code-acp** — ACP-сервер, оборачивающий Claude Code SDK
- **@agentclientprotocol/sdk** — TypeScript SDK для создания ACP-клиентов
- **Obsidian Plugin API** — API для создания плагинов Obsidian

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
│   ├── DiffViewer.ts          # Full-file diff modal
│   └── ...
└── views/
    └── ChatView.ts            # Main chat interface

tests/
└── headless-test.ts           # Standalone ACP connection test

styles.css                     # Chat UI styles
manifest.json                  # Obsidian plugin manifest
```

## Development Commands

```bash
# Install dependencies
npm install

# Build plugin
npm run build

# Development mode with watch
npm run dev

# Type check
npm run typecheck

# Run ACP tests (209 tests)
npm run test:acp

# Headless ACP test (no Obsidian needed)
npm run test:headless
```

## Testing in Obsidian

1. Build plugin: `npm run build`
2. Copy `main.js`, `manifest.json`, `styles.css` to vault's `.obsidian/plugins/obsidian-claude-code/`
3. Enable plugin in Obsidian settings
4. Plugin will auto-download `claude-code-acp` binary on first connect

## Key Concepts

### acp-core Module
Внутренний модуль с чистой архитектурой:
- `IAcpClient` - интерфейс для всех реализаций
- `NativeAcpClient` - основная реализация
- `createAcpClient()` - фабрика с DI
- 209 тестов покрывают 100% публичного API

### ACP Transport
Плагин спавнит `claude-code-acp` как child process и общается через JSON-RPC over stdio.

### Vault Integration
Файлы vault маппятся на ACP file system protocol. `[[` синтаксис позволяет добавлять заметки в контекст.

### Permission Model
Tool calls требуют подтверждения пользователя через inline PermissionCard.

## Development Workflow

### Making Changes

1. **Implement feature/fix** - write code
2. **Build**: `npm run build`
3. **Typecheck**: `npm run typecheck`
4. **Test**: `npm run test:acp`
5. **Ask user to test** - wait for user approval before release
6. Only proceed to release after user confirms it works

### Release Process

**IMPORTANT**: Always use `npm run version` script, never edit version manually!

**IMPORTANT**: Tags must be WITHOUT 'v' prefix (Obsidian requirement)!
- ✅ Correct: `1.0.0`
- ❌ Wrong: `v1.0.0`

```bash
# 1. Bump version (choose one):
npm run version patch   # 1.0.9 -> 1.0.10 (bug fixes)
npm run version minor   # 1.0.9 -> 1.1.0 (new features)
npm run version major   # 1.0.9 -> 2.0.0 (breaking changes)

# 2. Build with new version:
npm run build

# 3. Commit changes:
git add -A
git commit -m "Release X.Y.Z: Short description"

# 4. Tag and push (NO 'v' prefix!):
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

## Current Version: 1.0.12

- acp-core module with 209 tests
- NativeAcpClient implementation
- Plugin fully migrated to acp-core
- ESLint with obsidianmd rules (same as Review Bot)
- Repository moved to SmartAndPoint organization
