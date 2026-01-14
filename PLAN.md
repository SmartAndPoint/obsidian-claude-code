# PLAN.md — План разработки Obsidian Claude Code Plugin

## Phase 1: Базовая структура плагина ✅ COMPLETED

### 1.1 Инициализация проекта
- [x] Создать структуру Obsidian плагина (package.json, manifest.json, tsconfig.json)
- [x] Настроить esbuild для сборки
- [x] Создать базовый main.ts с регистрацией плагина
- [x] Добавить hot-reload для разработки (npm run dev)

### 1.2 Зависимости
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
- [x] Создать `src/acpClient.ts` — менеджер подключения
- [x] Реализовать spawn child process для `claude-code-acp`
- [x] Настроить JSON-RPC транспорт через stdio
- [x] Обработка lifecycle: запуск при активации, graceful shutdown

### 2.2 ClientSideConnection
- [x] Инициализировать `ClientSideConnection` из SDK
- [x] Реализовать обработку входящих сообщений от агента
- [x] Реализовать отправку сообщений пользователя
- [x] Обработка ошибок

### 2.3 Проверка подключения
- [x] Команда в Command Palette: "Claude Code: Connect"
- [x] Headless тест: `npm run test:headless` — PASSED ✅
- [x] Логирование в консоль разработчика

---

## Phase 3: Минимальный Chat UI ✅ COMPLETED

### 3.1 Chat View
- [x] Создать кастомный View (`ChatView extends ItemView`)
- [x] Регистрация view в плагине
- [x] Команда "Claude Code: Open Chat"
- [x] Базовая HTML/CSS структура чата
- [x] Ribbon icon для быстрого доступа

### 3.2 Message Rendering
- [x] Рендеринг markdown сообщений (Obsidian MarkdownRenderer)
- [x] Отображение сообщений пользователя и агента
- [x] Поддержка streaming (partial messages)
- [x] Scroll to bottom при новых сообщениях

### 3.3 Input
- [x] Textarea для ввода сообщений
- [x] Отправка по Enter (Shift+Enter для новой строки)
- [x] Кнопка отправки
- [x] Индикатор статуса (Disconnected/Connecting/Connected/Thinking)

---

## Phase 4: Tool Calls & Permissions

### 4.1 Permission Requests UI
- [ ] Modal для подтверждения tool calls
- [ ] Отображение: какой инструмент, какие параметры
- [ ] Кнопки: Approve / Deny / Approve All
- [ ] Timeout handling

### 4.2 Edit Review
- [ ] Diff viewer для предлагаемых изменений файлов
- [ ] Syntax highlighting (если возможно через Obsidian API)
- [ ] Accept / Reject изменений
- [ ] Batch operations

### 4.3 Terminal Output
- [ ] Отображение stdout/stderr от команд
- [ ] Различие interactive vs background terminals
- [ ] Copy to clipboard

---

## Phase 5: Vault Integration

### 5.1 @-mentions
- [ ] Autocomplete для файлов vault при вводе @
- [ ] Fuzzy search по именам заметок
- [ ] Добавление содержимого файла в контекст

### 5.2 File Operations
- [ ] Маппинг vault path ↔ ACP file system
- [ ] Чтение файлов через Obsidian API (vault.read)
- [ ] Запись файлов через Obsidian API (vault.modify/create)
- [ ] Учёт .obsidian и других системных папок

### 5.3 Obsidian-specific Context
- [ ] Frontmatter parsing
- [ ] Wikilinks resolution
- [ ] Tags extraction
- [ ] Возможно: граф связей (backlinks)

---

## Phase 6: Settings & Configuration

### 6.1 Plugin Settings
- [ ] Settings tab в Obsidian
- [ ] Путь к claude-code-acp (если не глобальный)
- [ ] ANTHROPIC_API_KEY (или использовать из env)
- [ ] Default model selection
- [ ] Auto-connect on startup

### 6.2 Per-conversation Settings
- [ ] System prompt customization
- [ ] Context window management
- [ ] Conversation history persistence

---

## Phase 7: Advanced Features (Future)

### 7.1 Custom Slash Commands
- [ ] Регистрация кастомных команд
- [ ] Интеграция с Obsidian templates

### 7.2 Multi-conversation
- [ ] Несколько параллельных чатов
- [ ] История разговоров

### 7.3 MCP Integration
- [ ] Клиентские MCP серверы через ACP
- [ ] Obsidian-specific MCP server (теги, граф, поиск)

---

## Implementation Order

```
Phase 1 (Foundation)
    │
    ▼
Phase 2 (ACP Connection) ──── Первый milestone: подключение работает
    │
    ▼
Phase 3 (Basic Chat) ──────── Второй milestone: можно общаться
    │
    ▼
Phase 4 (Tool Calls) ──────── Третий milestone: agentic workflow
    │
    ▼
Phase 5 (Vault) ───────────── Четвёртый milestone: интеграция с заметками
    │
    ▼
Phase 6 (Settings) ────────── Пятый milestone: production-ready
    │
    ▼
Phase 7 (Advanced) ────────── Future iterations
```

---

## Technical Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Obsidian API ограничен для сложного UI | Использовать React через `createRoot` (поддерживается) |
| stdio transport в Electron | Node.js доступен, child_process работает |
| ACP SDK может измениться | Зафиксировать версию, следить за breaking changes |
| Большие файлы vault | Streaming, pagination, lazy loading |

---

## Current Status

✅ **Phase 1-3 COMPLETED** — Плагин готов к тестированию в Obsidian

**Что работает:**
- ACP подключение к claude-code-acp (headless тест пройден)
- Chat UI с markdown рендерингом
- Streaming ответов
- Статус индикатор
- Ribbon icon и команды

**Next Step**: Phase 4 — Tool Calls & Permissions (или тест в Obsidian)
