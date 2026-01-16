# Obsidian Linter Fix Plan

## Status Legend
- [ ] Pending
- [x] Done

---

## Required Fixes

### 1. Console statements (51 issues)
**Rule:** Only `console.warn`, `console.error`, `console.debug` allowed

**Files:**
- [ ] `src/acpClient.ts` - 19 occurrences
- [ ] `src/binaryManager.ts` - 9 occurrences
- [ ] `src/main.ts` - 10 occurrences
- [ ] `src/views/ChatView.ts` - 13 occurrences

**Action:** Replace `console.log` with `console.debug`

---

### 2. Async methods without await (5 issues)
**Rule:** Async methods must have await expression

**Files:**
- [ ] `src/acpClient.ts:57` - `sessionUpdate`
- [ ] `src/acpClient.ts:266` - `disconnect`
- [ ] `src/main.ts:9` - `onload`
- [ ] `src/views/ChatView.ts:83` - `onOpen`
- [ ] `src/views/ChatView.ts:176` - `onClose`

**Action:** Remove `async` keyword or add `await`

---

### 3. Inline styles → CSS classes (9+ issues)
**Rule:** Use CSS classes instead of `element.style.X`

**Files:**
- [ ] `src/components/FileSuggest.ts:301-302` - `style.left`, `style.right`
- [ ] `src/components/SelectionChip.ts:27,92,103` - `style.display`
- [ ] `src/components/ThinkingBlock.ts:35` - `style.display`
- [ ] `src/components/ToolCallCard.ts:85,124` - `style.display`
- [ ] `src/views/ChatView.ts:143,240,890` - `style.height`

**Action:** Create CSS classes and use `classList.add/remove` or `setCssProps`

---

### 4. Unhandled Promises (10 issues)
**Rule:** Promises must be awaited or marked with `void`

**Files:**
- [ ] `src/components/PathFormatter.ts:133`
- [ ] `src/main.ts:129-132,138,163`
- [ ] `src/views/ChatView.ts:137,622,638-644,681,693-699,727`

**Action:** Add `void` operator before fire-and-forget promises

---

### 5. innerHTML usage (1 issue)
**Rule:** Do not use innerHTML directly

**File:**
- [ ] `src/components/FileSuggest.ts:253`

**Action:** Use DOM API (`createEl`, `setText`, etc.)

---

### 6. Sentence case in UI (25 issues)
**Rule:** UI text must be sentence case

**Files:**
- [ ] `src/components/CodeViewer.ts:37,40,41`
- [ ] `src/components/DiffViewer.ts:403,413,426,430,431,452,532,540`
- [ ] `src/components/PermissionCard.ts:48,114`
- [ ] `src/components/PermissionModal.ts:38`
- [ ] `src/components/ToolCallCard.ts:145,185`
- [ ] `src/main.ts:70,75,91,110,137`
- [ ] `src/views/ChatView.ts:76,91,127,436`

**Action:** Change "Copy Code" → "Copy code", etc.

---

### 7. Type `any` usage (9 issues)
**Rule:** Specify concrete types instead of `any`

**Files:**
- [ ] `src/components/DiffViewer.ts:259`
- [ ] `src/components/FileSuggest.ts:411`
- [ ] `src/components/PathFormatter.ts:77,101,170,201`
- [ ] `src/main.ts:170`
- [ ] `src/views/ChatView.ts:247,800`

**Action:** Replace `any` with proper types

---

### 8. Default hotkey (1 issue)
**Rule:** Don't provide default hotkeys

**File:**
- [ ] `src/main.ts:111`

**Action:** Remove `hotkeys` property from command

---

### 9. RegisterView memory leak (1 issue)
**Rule:** Don't assign view to plugin property in registerView

**File:**
- [ ] `src/main.ts:14`

**Action:** Refactor to not store view reference during registration

---

### 10. Promise in void context (5 issues)
**Rule:** Promise-returning function where void expected

**Files:**
- [ ] `src/components/CodeViewer.ts:38-42`
- [ ] `src/components/DiffViewer.ts:427-432`
- [ ] `src/views/ChatView.ts:105,152,759-789`

**Action:** Wrap with `void` or handle properly

---

### 11. Template literal with object (2 issues)
**Rule:** Objects will stringify as [object Object]

**Files:**
- [ ] `src/components/PermissionCard.ts:73`
- [ ] `src/components/PermissionModal.ts:62`

**Action:** Properly stringify the object (JSON.stringify or specific property)

---

### 12. Unnecessary escape character (3 issues)
**Files:**
- [ ] `src/components/FileSuggest.ts:64,405`
- [ ] `src/components/PathFormatter.ts:219`

**Action:** Remove unnecessary `\[` escapes

---

### 13. Unnecessary type assertion (2 issues)
**Files:**
- [ ] `src/views/ChatView.ts:777,778`

**Action:** Remove unnecessary `as` assertions

---

## Optional Fixes (cleanup)

### 14. Unused imports/variables (15 issues)
- [x] `src/acpClient.ts:8` - `DownloadProgress`
- [x] `src/binaryManager.ts:16` - `execSync`
- [x] `src/binaryManager.ts:50` - `packageJsonPath` (refactored)
- [x] `src/binaryManager.ts:51` - `indexPath` (refactored)
- [x] `src/binaryManager.ts:130` - `stdout`
- [x] `src/components/FileSuggest.ts:8` - `TFile`
- [x] `src/components/PathFormatter.ts:8` - `MarkdownRenderer`
- [x] `src/components/PermissionCard.ts:11` - `OPTION_STYLES`
- [x] `src/components/PermissionModal.ts:8` - `Setting`
- [x] `src/components/PermissionModal.ts:73` - `rejectOptions`
- [x] `src/components/SelectionChip.ts:242` - `visibleChips`
- [x] `src/components/ToolCallCard.ts:10` - `formatPath`
- [x] `src/components/ToolCallCard.ts:32` - `MAX_PREVIEW_LINES`
- [x] `src/main.ts:1` - `MarkdownView`
- [x] `src/views/ChatView.ts:767` - `leaf`

---

## Execution Order

1. **Unused imports** (quick cleanup, reduces noise)
2. **Console statements** (bulk replace)
3. **Async/await fixes** (structural)
4. **Default hotkey** (quick fix)
5. **RegisterView pattern** (structural)
6. **Sentence case** (text changes)
7. **Inline styles → CSS** (requires CSS additions)
8. **Promise handling** (add void operators)
9. **innerHTML** (DOM refactor)
10. **Type any** (add proper types)
11. **Template literals** (stringify objects)
12. **Escape characters** (quick fix)
13. **Type assertions** (quick fix)

---

## Progress Tracking

**Started:** 2026-01-16
**Current Step:** Not started
**Completed:** 0/13 categories
