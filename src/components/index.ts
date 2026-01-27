/**
 * UI Components for Claude Code Plugin
 *
 * Phase 4.1 Components:
 * - ThinkingBlock: Collapsible agent reasoning display
 * - ToolCallCard: Tool execution status and results
 * - DiffViewer: File diff visualization
 * - PermissionModal: Promise-based permission dialogs (legacy)
 * - PermissionCard: Inline permission request in chat
 */

export { ThinkingBlock } from "./ThinkingBlock";
export { ToolCallCard } from "./ToolCallCard";
export { DiffViewer, DiffModal, createSimpleDiff } from "./DiffViewer";
export { PermissionModal, showQuickPermission } from "./PermissionModal";
export { PermissionCard, type PermissionCardOptions } from "./PermissionCard";
export { CodeViewerModal, collapseCodeBlocks } from "./CodeViewer";
export { FileSuggest, resolveFileReferences, extractWikilinks } from "./FileSuggest";
export { CommandSuggest } from "./CommandSuggest";
export { SelectionChipsContainer, type FileSelection } from "./SelectionChip";
export { formatPath, createClickablePath, formatAgentPaths, openFileAtLine } from "./PathFormatter";
export { SessionPickerModal, type SessionPickerResult } from "./SessionPickerModal";
