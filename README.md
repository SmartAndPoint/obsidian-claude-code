# Claude Code Integration for Obsidian

Use **Claude Code** — Anthropic's AI coding assistant — directly inside Obsidian.

This plugin integrates the full Claude Code agent experience into your vault: not just a simple chat, but a complete agentic workflow with file operations, tool calls, and intelligent code assistance.

> **Note:** This is a third-party integration, not an official Anthropic product.

[![Install in Obsidian](https://img.shields.io/badge/Install%20in-Obsidian-7C3AED?style=for-the-badge&logo=obsidian)](https://github.com/SmartAndPoint/obsidian-claude-code/releases/latest)

## Features

- **Full Claude Code Agent** — The same powerful AI assistant used in VS Code, Cursor, and Zed
- **Works with Claude Pro/Max subscriptions** — Uses the official Claude Agent SDK, no API key required
- **Session memory** — Conversations persist in your vault and Claude restores context automatically when you resume
- **File Operations** — Claude can read, write, and edit files in your vault with your permission
- **Tool Execution** — Supports bash commands, file search, and other tools
- **Clipboard paste** — Paste images and files directly into chat (images saved to vault, files referenced by path)
- **Permission System** — You control what Claude can do with intuitive Allow/Deny prompts
- **Streaming Responses** — Real-time message display with markdown rendering
- **Code Selection** — Select code and send it to Claude with `Cmd+Shift+.` — shows as @N chip references
- **Diff Viewer** — Review file changes before applying them
- **Session picker** — Switch between conversations, each stored as a searchable markdown file in your vault

## Requirements

| Requirement | Description | Installation |
|-------------|-------------|--------------|
| **Claude Code** | Main requirement — must be installed and working | [Install Claude Code](https://claude.ai/code) |
| **Obsidian** | Version 1.5.0+ (Desktop only) | [Download Obsidian](https://obsidian.md/download) |
| **Node.js** | Version 18+ (for automatic component download) | [Download Node.js](https://nodejs.org/) |

### Authentication

You need **one** of the following:
- **Claude Pro/Team subscription** — Claude Code uses your subscription automatically
- **Anthropic API Key** — Get one at [console.anthropic.com](https://console.anthropic.com/) if you don't have a subscription

> **Note:** If you already use Claude Code in your terminal and it works, you're all set!

## Installation

### Via BRAT (Recommended)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs the plugin directly from GitHub and keeps it updated automatically.

1. Install **BRAT** from Obsidian: Settings → Community plugins → Browse → search "BRAT" → Install → Enable
2. Open BRAT settings: Settings → BRAT → **Add Beta Plugin**
3. Paste the repository URL: `SmartAndPoint/obsidian-claude-code`
4. Click **Add Plugin** — BRAT downloads and installs everything automatically
5. Enable the plugin: Settings → Community plugins → Enable "Claude Code Integration"

> **Auto-updates:** BRAT checks for new releases on Obsidian startup. You can also manually check via Command Palette → "BRAT: Check for updates to all beta plugins".

### From GitHub Releases

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/SmartAndPoint/obsidian-claude-code/releases/latest)
2. Create folder: `YOUR_VAULT/.obsidian/plugins/obsidian-claude-code/`
3. Copy the 3 files into that folder
4. In Obsidian: Settings → Community plugins → Enable "Claude Code Integration"

### From Source

```bash
# Clone the repository
git clone https://github.com/SmartAndPoint/obsidian-claude-code
cd obsidian-claude-code

# Install dependencies and build
npm install
npm run build

# Copy to your vault's plugins folder
mkdir -p YOUR_VAULT/.obsidian/plugins/obsidian-claude-code
cp main.js manifest.json styles.css YOUR_VAULT/.obsidian/plugins/obsidian-claude-code/
```

## Setup

### 1. Verify Claude Code Works

Before using this plugin, make sure Claude Code works in your terminal:

```bash
claude "Hello, Claude!"
```

If this works, you're ready to go! The plugin will use the same authentication.

### 2. API Key (Optional)

If you're using an API key instead of a subscription, set it before launching Obsidian:

<details>
<summary><b>macOS/Linux</b></summary>

```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
open /Applications/Obsidian.app
```

Add to `~/.zshrc` or `~/.bashrc` for persistence.
</details>

<details>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-api03-..."
& "C:\Users\YOU\AppData\Local\Obsidian\Obsidian.exe"
```
</details>

### 3. First Run

1. Click the **bot icon** in the left ribbon to open the Claude Code Integration panel
2. Click the **plug icon** (⚡) in the chat header to connect
3. Start chatting!

## Usage

### Basic Chat

Just type your message and press Enter or click Send. Claude will respond with helpful answers, code suggestions, and can perform actions in your vault.

### Code Selection

1. Select text in any file
2. Press `Cmd+Shift+.` (or `Ctrl+Shift+.` on Windows)
3. The selection appears as a chip in the chat input
4. Ask Claude about it!

### Commands

Open Command Palette (`Cmd/Ctrl + P`):

| Command | Description |
|---------|-------------|
| Claude Code Integration: Open Chat | Open the chat panel |
| Claude Code Integration: Connect | Connect to Claude |
| Claude Code Integration: Disconnect | Disconnect from Claude |
| Claude Code Integration: Add Selection to Chat | Add selected text to chat |

### Permissions

When Claude wants to perform actions (edit files, run commands), you'll see a permission prompt:

- **Allow** — Permit this specific action
- **Allow All** — Permit all similar actions this session
- **Deny** — Reject this action

## Troubleshooting

### "Claude CLI not found"

The plugin requires the `claude` CLI to be installed and in your PATH:
```bash
claude --version  # Should print version
which claude      # Should print path (e.g., /opt/homebrew/bin/claude)
```

If not installed, visit [claude.ai/code](https://claude.ai/code) to install Claude Code.

### Connection Issues

1. Make sure `claude` works in your terminal first: `claude "Hello"`
2. If using an API key, check it's set in your environment
3. Restart Obsidian after installing Claude Code or setting environment variables
4. Check the Developer Console (`Cmd+Option+I`) for error messages

### Session Data

Sessions are stored as markdown files in your vault:
```
YOUR_VAULT/claude-code/sessions/
```

Pasted images are stored in:
```
YOUR_VAULT/claude-code/images/
```

## Privacy & Security

- Your API key is only used to communicate with Anthropic's API
- All file operations require your explicit permission
- The plugin works entirely locally — no data is sent to third parties
- See [Anthropic's Privacy Policy](https://www.anthropic.com/privacy) for API usage

## Development

```bash
# Development mode with hot reload
npm run dev

# Type checking
npm run typecheck

# Production build
npm run build
```

## Author

Created and maintained by [Evgenii Konev](https://smartandpoint.com/people/evgenii-konev) <ekonev@smartandpoint.com> (SmartAndPoint)

## License

[MIT](./LICENSE)

## Links

- [Claude Code](https://claude.ai/code) — Official Claude Code
- [Anthropic](https://anthropic.com) — The company behind Claude
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) — The SDK powering this integration
