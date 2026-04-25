/**
 * Plugin settings — persisted via Obsidian's loadData/saveData.
 *
 * Source-of-truth principle: runtime SDK options come from these settings on
 * every query, file-based config (additionalDirectories, permission rules)
 * lives in <vault>/.claude/settings.local.json which the SDK reads via
 * settingSources: ["user", "project", "local"].
 */

export type PermissionMode = "default" | "acceptEdits" | "plan" | "bypassPermissions";

export const PERMISSION_MODES: Array<{
  id: PermissionMode;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    id: "default",
    label: "Cautious",
    icon: "🛡",
    description: "Ask before each tool call (terminal default)",
  },
  {
    id: "acceptEdits",
    label: "Auto-edit",
    icon: "✅",
    description: "Auto-approve file edits; ask for Bash and other tools",
  },
  {
    id: "plan",
    label: "Plan",
    icon: "📝",
    description: "Read-only planning mode; Claude proposes a plan before editing",
  },
  {
    id: "bypassPermissions",
    label: "Bypass",
    icon: "🚨",
    description: "Auto-approve EVERYTHING — use with care",
  },
];

export interface ToolDescriptor {
  id: string;
  description: string;
  example: string;
}

export const KNOWN_TOOLS: readonly ToolDescriptor[] = [
  { id: "Read", description: "Read file contents", example: 'Read("/notes/idea.md")' },
  { id: "Write", description: "Create or overwrite files", example: 'Write("/path/file.ts", ...)' },
  { id: "Edit", description: "Modify a file in place", example: 'Edit("/path/file.ts", ...)' },
  { id: "Glob", description: "Find files by pattern", example: 'Glob("**/*.ts")' },
  { id: "Grep", description: "Search file contents", example: 'Grep("regex", "/dir/")' },
  { id: "LS", description: "List directory entries", example: 'LS("/path/")' },
  { id: "Bash", description: "Run shell commands", example: 'Bash("npm test")' },
  { id: "WebFetch", description: "Fetch URL content", example: 'WebFetch("https://docs...")' },
  { id: "WebSearch", description: "Search the web", example: 'WebSearch("obsidian plugin")' },
  { id: "Task", description: "Spawn a sub-agent", example: 'Task("explore", "find X")' },
] as const;

export interface PluginSettings {
  /** Empty string = auto-detect via resolveClaudePath(). */
  claudePath: string;

  /** Mode used when chip hasn't been touched in this session. */
  defaultPermissionMode: PermissionMode;

  /** Last mode picked via chip — restored on reconnect. */
  lastUsedPermissionMode: PermissionMode;

  /**
   * Tools auto-approved without prompting, regardless of permissionMode.
   * Passed to SDK as `allowedTools`.
   */
  autoApprovedTools: string[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  claudePath: "",
  defaultPermissionMode: "default",
  lastUsedPermissionMode: "default",
  autoApprovedTools: ["Read", "Glob", "Grep", "LS"],
};
