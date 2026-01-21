# Fix Plan for Obsidian Review Bot Issues

**PR**: https://github.com/obsidianmd/obsidian-releases/pull/9667
**Status**: Changes requested
**Bot Comment**: 2026-01-20T15:04:57Z

---

## Phase 1: Setup Local Linting (Prevent Future Issues)

### Task 1.1: Install @typescript-eslint Rules

The Review Bot uses additional TypeScript-ESLint rules beyond our current setup.

```bash
npm install --save-dev @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

**Already installed** - verify versions are up to date.

### Task 1.2: Update ESLint Config

Add the rules that the bot checks to `eslint.config.mjs`:

```javascript
// Rules to add:
"@typescript-eslint/require-await": "error",           // Async with no await
"@typescript-eslint/no-this-alias": "error",           // No this aliasing
"@typescript-eslint/no-unnecessary-type-assertion": "error",  // Unnecessary assertions
"@typescript-eslint/no-empty-interface": "error",      // Empty interfaces
"@typescript-eslint/no-empty-object-type": "error",    // Empty object types
"no-case-declarations": "error",                        // Lexical in case block
"@typescript-eslint/no-unused-vars": "warn",           // Unused variables (optional)
```

### Task 1.3: Verify Local Lint Catches All Issues

Run `npm run lint` and confirm it catches the same issues as the bot.

---

## Phase 2: Fix Required Issues

### Task 2.1: Async Methods With No Await (9 locations)

**Issue**: Methods declared `async` but don't use `await`.
**Fix**: Remove `async` keyword OR add `await` if needed.

| File | Line | Method | Action |
|------|------|--------|--------|
| native-client.ts | 103 | `getOutput` | Remove `async` |
| native-client.ts | 114 | `kill` | Remove `async` |
| native-client.ts | 649 | `createTerminal` | Remove `async` |
| native-client.ts | 724 | `handleSessionUpdate` | Remove `async` |
| native-client.ts | 848 | `handleCreateTerminal` | Remove `async` |
| native-client.ts | 868 | `findBinary` | Remove `async` |
| zed-adapter.ts | 89 | (check context) | Remove `async` |
| zed-adapter.ts | 261 | `disconnect` | Remove `async` |
| zed-adapter.ts | 571 | `createTerminal` | Remove `async` |
| zed-adapter.ts | 633 | `handleSessionUpdate` | Remove `async` |
| acpClient.ts | 201 | `exists` | Remove `async` |

**Note**: Check if these methods are implementing an interface that requires `async`. If so, add `await Promise.resolve()` as a no-op.

---

### Task 2.2: Aliasing 'this' to Local Variable (2 locations)

**Issue**: Using `const self = this` pattern.
**Fix**: Use arrow functions to preserve `this` context.

| File | Line | Action |
|------|------|--------|
| native-client.ts | 167 | Replace `self` usage with arrow functions |
| zed-adapter.ts | 89 | Replace `self` usage with arrow functions |

**Example Fix**:
```typescript
// Before:
const self = this;
someCallback(function() {
  self.doSomething();
});

// After:
someCallback(() => {
  this.doSomething();
});
```

---

### Task 2.3: Unnecessary Type Assertions (9 locations)

**Issue**: Type assertions like `as Type` that don't change the type.
**Fix**: Remove the unnecessary `as Type` assertion.

| File | Line |
|------|------|
| native-client.ts | 939 |
| native-client.ts | 946 |
| zed-adapter.ts | 790 |
| zed-adapter.ts | 797 |
| acpClient.ts | 290 |
| acpClient.ts | 321 |
| acpClient.ts | 328 |
| acpClient.ts | 334 |
| acpClient.ts | 350 |

**Action**: Read each line and remove `as SomeType` if TypeScript already infers the correct type.

---

### Task 2.4: Empty Interface Declarations (6 locations)

**Issue**: Empty interfaces like `interface Foo {}` allow any non-nullish value.
**Fix**: Use `object`, `unknown`, or `Record<string, unknown>` instead.

| File | Line | Interface |
|------|------|-----------|
| types.ts | 115 | Check and fix |
| types.ts | 212 | Check and fix |
| types.ts | 239 | Check and fix |
| types.ts | 736 | Check and fix |
| types.ts | 791 | Check and fix |
| types.ts | 800 | Check and fix |

**Options**:
1. Replace with `type Foo = object` or `type Foo = Record<string, unknown>`
2. Add `// eslint-disable-next-line @typescript-eslint/no-empty-object-type` if intentional
3. Add actual properties if known

---

### Task 2.5: Interface Equivalent to Supertype (2 locations)

**Issue**: Interface extends another but adds no new members.
**Fix**: Use type alias instead.

| File | Line | Interface |
|------|------|-----------|
| types.ts | 316 | Check and fix |
| types.ts | 339 | Check and fix |

**Example Fix**:
```typescript
// Before:
interface SpecificThing extends BaseThing {}

// After:
type SpecificThing = BaseThing;
```

---

### Task 2.6: Lexical Declaration in Case Block (3 locations in acpClient.ts)

**Issue**: Using `const`/`let` directly in `case` without braces.
**Fix**: Wrap case body in braces `{}`.

| File | Line |
|------|------|
| acpClient.ts | 290 |
| acpClient.ts | 334 |
| acpClient.ts | 350 |

**Example Fix**:
```typescript
// Before:
switch (x) {
  case 'a':
    const result = doSomething();
    break;
}

// After:
switch (x) {
  case 'a': {
    const result = doSomething();
    break;
  }
}
```

---

### Task 2.7: Sentence Case for UI Text (8 locations)

**Issue**: UI strings not using sentence case (only first letter capitalized).

**Analysis Result (2026-01-21)**:

| File | Line | String | Verdict |
|------|------|--------|---------|
| PermissionModal.ts | 41 | `"⚠️ Permission required"` | ✅ Correct - emoji prefix exception |
| main.ts | 80 | `"Connected to Claude Code"` | ✅ Correct - brand name exception |
| main.ts | 85 | `"Disconnected from Claude Code"` | ✅ Correct - brand name exception |
| main.ts | 152 | `"Claude Code"` | ✅ Brand name for tooltip |
| ChatView.ts | 102 | `return "bot"` | ❓ Internal icon ID - NOT UI text |
| ChatView.ts | 118 | `updateStatus("disconnected")` | ❓ Status code - NOT UI text |
| ChatView.ts | 154 | `e.key === "Enter"` | ❓ Key constant - NOT UI text |
| ChatView.ts | 486 | Loop variable | ❓ Not even a string |

**Conclusion**: All UI strings are already correctly formatted with sentence case. The ChatView.ts flagged lines appear to be **false positives** (internal code identifiers, not user-facing text). Our eslint.config.mjs includes proper exceptions for brand names and emoji prefixes.

**Action**: No changes needed. Local lint passes. Push and see if bot accepts.

---

## Phase 3: Fix Optional Issues (Recommended)

### Task 3.1: Remove Unused Imports

| File | Import |
|------|--------|
| client.ts | `InitializeResult` |
| client.ts | `ClientCapabilities` |
| client.ts | `SessionInfo` |
| ChatView.ts | `ToolKind` |
| ChatView.ts | `ToolCallStatus` |
| ChatView.ts | `ToolCallLocation` |
| ChatView.ts | `ToolCallContent` |

---

## Phase 4: Validation

### Task 4.1: Run Local Lint
```bash
npm run lint
```
Should pass with no errors.

### Task 4.2: Run Type Check
```bash
npm run typecheck
```
Should pass with no errors.

### Task 4.3: Run Tests
```bash
npm run test:acp
```
All 209 tests should pass.

### Task 4.4: Build
```bash
npm run build
```
Should complete successfully.

---

## Phase 5: Release

### Task 5.1: Commit Changes
```bash
git add -A
git commit -m "fix: resolve Review Bot lint issues

- Remove async from methods without await
- Replace this aliasing with arrow functions
- Remove unnecessary type assertions
- Fix empty interface declarations
- Wrap case blocks with lexical declarations
- Fix sentence case for UI text
- Remove unused imports
- Update ESLint config with stricter rules

Maintainer: ekonev@smartandpoint.com"
```

### Task 5.2: Bump Version
```bash
npm run version patch  # 1.0.12 -> 1.0.13
```

### Task 5.3: Push and Tag
```bash
git push origin main
git tag 1.0.13
git push origin 1.0.13
```

### Task 5.4: Wait for Bot Rescan
Bot will rescan within 6 hours after push.

---

## Summary

| Phase | Tasks | Estimated Changes |
|-------|-------|-------------------|
| Phase 1: Setup | 3 tasks | eslint.config.mjs |
| Phase 2: Required | 7 tasks | ~30 lines across 6 files |
| Phase 3: Optional | 1 task | ~10 lines across 2 files |
| Phase 4: Validation | 4 tasks | Run commands |
| Phase 5: Release | 4 tasks | Git operations |

**Files to modify**:
- `eslint.config.mjs` - Add stricter rules
- `src/acp-core/adapters/native-client.ts` - Async, this alias, assertions
- `src/acp-core/adapters/zed-adapter.ts` - Async, this alias, assertions
- `src/acp-core/interfaces/types.ts` - Empty interfaces
- `src/acp-core/interfaces/client.ts` - Unused imports
- `src/acpClient.ts` - Assertions, case blocks
- `src/components/PermissionModal.ts` - Sentence case
- `src/main.ts` - Sentence case
- `src/views/ChatView.ts` - Sentence case, unused imports
