# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Goal

**obsidian-claude-code-plugin** — Obsidian плагин, реализующий ACP-клиент для интеграции с Claude Code.

Плагин позволяет использовать полноценный Claude Code агент прямо в Obsidian, аналогично интеграции в Zed или Cursor. Это не просто чат с API — это agentic workflow с tool calls, permission requests, edit review и доступом к файлам vault.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Obsidian                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │           obsidian-claude-code-plugin             │  │
│  │                  (ACP Client)                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │  │
│  │  │  Chat View  │  │ Diff Viewer │  │ Terminal  │  │  │
│  │  └─────────────┘  └─────────────┘  └───────────┘  │  │
│  │           │                                       │  │
│  │  ┌────────▼────────────────────────────────────┐  │  │
│  │  │         ClientSideConnection                │  │  │
│  │  │    (@agentclientprotocol/sdk)               │  │  │
│  │  └────────┬────────────────────────────────────┘  │  │
│  └───────────│───────────────────────────────────────┘  │
└──────────────│──────────────────────────────────────────┘
               │ JSON-RPC over stdio
               ▼
┌──────────────────────────────────────────────────────────┐
│                   claude-code-acp                        │
│              (ACP Server / Claude Agent)                 │
│         @zed-industries/claude-code-acp                  │
└──────────────────────────────────────────────────────────┘
```

## Key Technologies

- **ACP (Agent Client Protocol)** — протокол коммуникации между редакторами и AI-агентами
- **claude-code-acp** — ACP-сервер, оборачивающий Claude Code SDK
- **@agentclientprotocol/sdk** — TypeScript SDK для создания ACP-клиентов
- **Obsidian Plugin API** — API для создания плагинов Obsidian

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

# Headless ACP test (no Obsidian needed)
npm run test:headless
```

## Plugin Structure

```
src/
├── main.ts              # Plugin entry point, commands, ribbon icon
├── acpClient.ts         # ACP connection: spawn, ClientSideConnection, events
└── views/
    └── ChatView.ts      # Chat interface (ItemView)

tests/
└── headless-test.ts     # Standalone ACP connection test

styles.css               # Chat UI styles
manifest.json            # Obsidian plugin manifest
```

## Testing in Obsidian

1. Build plugin: `npm run build`
2. Copy `main.js`, `manifest.json`, `styles.css` to vault's `.obsidian/plugins/obsidian-claude-code/`
3. Enable plugin in Obsidian settings
4. Ensure `claude-code-acp` is installed globally: `npm install -g @zed-industries/claude-code-acp`

## Key Concepts

### ACP Transport
Плагин спавнит `claude-code-acp` как child process и общается через JSON-RPC over stdio.

### Vault Integration
Файлы vault маппятся на ACP file system protocol. @-mentions позволяют добавлять заметки в контекст.

### Permission Model
Tool calls требуют подтверждения пользователя через UI (edit review, command execution).
