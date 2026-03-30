# Session Memory: 2025-01-28

## Что сделано

### 1. Session Management (v1.1.0)
- **VaultSessionService** — хранение сессий как Markdown с YAML frontmatter
- **SessionPickerModal** — UI для выбора сессий
- **Авто-создание сессии** при первом сообщении
- **Авто-восстановление** последней сессии при подключении
- **Линковка claudeSessionId** к vault session

### 2. Hybrid Session Switching
- **SessionState**: `disconnected | live | history-only | resuming`
- **History Banner** — показывается когда Claude не помнит сессию
- **"Continue with context"** — инжектит последние 10 сообщений как контекст
- Исправлен баг: `claudeSessionId` теперь сохраняется при создании новой сессии

### 3. Permission Redirect
- Кнопка **"Do something else"** в permission cards
- Пользователь может отменить действие и дать альтернативные инструкции
- Альтернативный текст отправляется как новое сообщение

## Git Status
```
Branch: session_memory
Commit: 7f85c20 feat: add session management with hybrid resume
Tag: 1.1.0 (локально, не запушен)
```

## Планы на будущее: Cross-Session Memory

### Исследование Moltbot
Изучили https://github.com/moltbot/moltbot — продвинутая система памяти:

1. **Файловая структура памяти:**
   ```
   workspace/
   ├── MEMORY.md           ← долгосрочная память (curated)
   ├── memory/
   │   └── YYYY-MM-DD.md   ← дневной лог (append-only)
   ```

2. **Модульность через frontmatter:**
   ```yaml
   ---
   summary: "What this doc covers"
   read_when:
     - You want to understand X
     - You are debugging Y
   ---
   ```
   Claude читает только когда нужно (lazy loading).

3. **Workspace files injected:**
   - AGENTS.md — общие правила
   - SOUL.md — личность
   - TOOLS.md — инструменты
   - USER.md — предпочтения
   - MEMORY.md — долгосрочная память

### Решение для нашего плагина

**Выбрали вариант 4: Linked Sessions + модульная память**

Структура:
```
claude-code/
├── sessions/           ← сессии (уже есть)
├── MEMORY.md           ← долгосрочная память
├── USER.md             ← предпочтения пользователя
├── CONTEXT.md          ← текущий контекст проекта
└── daily/
    └── YYYY-MM-DD.md   ← дневной лог
```

**Aliases для сессий:**
```yaml
---
id: mkwipnmd-3tebvc
title: "Реализация авторизации"
aliases:
  - "claude: Реализация авторизации"
---
```

Пользователь может ссылаться через `[[claude: Реализация авторизации]]`

## Следующие шаги

1. Добавить aliases в VaultSessionService при создании/переименовании сессии
2. Создать структуру `claude-code/` с MEMORY.md, USER.md, daily/
3. Инжектить эти файлы в контекст при старте сессии
4. (Опционально) Vector search по памяти

## Файлы для справки

- `/tmp/moltbot/` — склонированный Moltbot для референса
- `/tmp/moltbot/docs/concepts/memory.md` — документация по памяти
- `/tmp/moltbot/AGENTS.md` — пример модульного CLAUDE.md
