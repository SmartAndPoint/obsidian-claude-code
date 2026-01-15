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
export { DiffViewer, createSimpleDiff } from "./DiffViewer";
export { PermissionModal, showQuickPermission } from "./PermissionModal";
export { PermissionCard } from "./PermissionCard";
export { CodeViewerModal, collapseCodeBlocks } from "./CodeViewer";
