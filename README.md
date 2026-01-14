# Obsidian Claude Code Plugin

Use [Claude Code](https://claude.ai/code) directly inside Obsidian via the [Agent Client Protocol (ACP)](https://agentclientprotocol.com/).

This is not just a chat with an API — it's a full agentic workflow with tool calls, permission requests, and file operations, similar to the Claude Code integration in Zed or Cursor.

## Features

- **Full Claude Code Agent** — Complete Claude Code experience inside Obsidian
- **ACP Protocol** — Uses the official Agent Client Protocol for communication
- **Streaming Responses** — Real-time message streaming with markdown rendering
- **Tool Calls** — Support for tool execution with permission requests
- **Vault Integration** — Works with your Obsidian vault as the working directory

## Prerequisites

1. **claude-code-acp** — Install the ACP adapter globally:
   ```bash
   npm install -g @zed-industries/claude-code-acp
   ```

2. **ANTHROPIC_API_KEY** — Set your API key in environment:
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

## Installation

### From Release (Recommended)

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create folder: `YOUR_VAULT/.obsidian/plugins/obsidian-claude-code/`
3. Copy the downloaded files into this folder
4. Enable the plugin in Obsidian Settings → Community Plugins

### From Source

```bash
git clone https://github.com/YOUR_USERNAME/obsidian-claude-code-plugin
cd obsidian-claude-code-plugin
npm install
npm run build

# Copy to your vault
cp main.js manifest.json styles.css YOUR_VAULT/.obsidian/plugins/obsidian-claude-code/
```

## Usage

1. Click the **bot icon** in the ribbon (left sidebar) to open Claude Code chat
2. Click the **plug icon** in the chat header to connect
3. Start chatting!

### Commands

Open Command Palette (`Cmd/Ctrl + P`) and search for:

- **Claude Code: Open Chat** — Open the chat panel
- **Claude Code: Connect** — Connect to claude-code-acp
- **Claude Code: Disconnect** — Disconnect from the agent

## Architecture

```
┌─────────────────────────────────────────┐
│              Obsidian                   │
│  ┌───────────────────────────────────┐  │
│  │   obsidian-claude-code-plugin     │  │
│  │          (ACP Client)             │  │
│  │  ┌─────────┐  ┌────────────────┐  │  │
│  │  │ ChatView│  │ AcpClient      │  │  │
│  │  └─────────┘  └───────┬────────┘  │  │
│  └───────────────────────│───────────┘  │
└──────────────────────────│──────────────┘
                           │ JSON-RPC/stdio
                           ▼
┌──────────────────────────────────────────┐
│            claude-code-acp               │
│      (ACP Server / Claude Agent)         │
└──────────────────────────────────────────┘
```

## Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Development mode (watch)
npm run dev

# Type check
npm run typecheck

# Run headless ACP test (no Obsidian needed)
npm run test:headless
```

## Roadmap

- [x] Phase 1: Project structure
- [x] Phase 2: ACP connection
- [x] Phase 3: Basic Chat UI
- [ ] Phase 4: Tool calls & permission UI
- [ ] Phase 5: Vault integration (@-mentions)
- [ ] Phase 6: Settings
- [ ] Phase 7: Advanced features (MCP, slash commands)

See [PLAN.md](./PLAN.md) for detailed implementation plan.

## Related Projects

- [claude-code-acp](https://github.com/zed-industries/claude-code-acp) — ACP adapter for Claude Code
- [Agent Client Protocol](https://agentclientprotocol.com/) — Protocol specification
- [@agentclientprotocol/sdk](https://github.com/agentclientprotocol/typescript-sdk) — TypeScript SDK

## License

[MIT](./LICENSE)
