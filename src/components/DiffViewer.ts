/**
 * DiffViewer - Full-file diff display with inline changes (Cursor-style)
 *
 * Shows the entire file with changes highlighted inline:
 * - Reads full file content from disk
 * - Finds where the change occurs in the file
 * - Shows complete file with deleted/added lines highlighted
 * - Accept/Reject buttons per change block
 *
 * Uses LCS algorithm for accurate diff computation.
 */

import { App, Modal, TFile } from "obsidian";
import type * as acp from "@agentclientprotocol/sdk";
import { createClickablePath } from "./PathFormatter";

interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLineNum: number | null;
  newLineNum: number | null;
}

interface ChangeBlock {
  id: number;
  startIdx: number; // Index in diffLines where this block starts
  endIdx: number;   // Index in diffLines where this block ends (exclusive)
  accepted: boolean | null; // null = not decided, true = accepted, false = rejected
}

/**
 * Compute LCS (Longest Common Subsequence) indices
 */
function computeLCS(oldLines: string[], newLines: string[]): [number, number][] {
  const m = oldLines.length;
  const n = newLines.length;

  // For very large files, use a simpler approach to avoid memory issues
  if (m * n > 10000000) {
    return computeLCSSimple(oldLines, newLines);
  }

  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: [number, number][] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      result.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

/**
 * Simple LCS for large files - just find matching lines
 */
function computeLCSSimple(oldLines: string[], newLines: string[]): [number, number][] {
  const result: [number, number][] = [];
  const newLineMap = new Map<string, number[]>();

  // Build index of new lines
  for (let j = 0; j < newLines.length; j++) {
    const line = newLines[j];
    if (!newLineMap.has(line)) {
      newLineMap.set(line, []);
    }
    newLineMap.get(line)!.push(j);
  }

  let lastJ = -1;
  for (let i = 0; i < oldLines.length; i++) {
    const positions = newLineMap.get(oldLines[i]);
    if (positions) {
      for (const j of positions) {
        if (j > lastJ) {
          result.push([i, j]);
          lastJ = j;
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Parse oldText and newText into structured diff lines (ALL lines)
 */
function computeDiffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  let oldIdx = 0;
  let newIdx = 0;

  const lcs = computeLCS(oldLines, newLines);

  let lcsIdx = 0;
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (lcsIdx < lcs.length && oldIdx < oldLines.length && newIdx < newLines.length) {
      const [lcsOldIdx, lcsNewIdx] = lcs[lcsIdx];

      while (oldIdx < lcsOldIdx) {
        result.push({
          type: "remove",
          content: oldLines[oldIdx],
          oldLineNum: oldIdx + 1,
          newLineNum: null,
        });
        oldIdx++;
      }

      while (newIdx < lcsNewIdx) {
        result.push({
          type: "add",
          content: newLines[newIdx],
          oldLineNum: null,
          newLineNum: newIdx + 1,
        });
        newIdx++;
      }

      result.push({
        type: "context",
        content: oldLines[oldIdx],
        oldLineNum: oldIdx + 1,
        newLineNum: newIdx + 1,
      });
      oldIdx++;
      newIdx++;
      lcsIdx++;
    } else {
      while (oldIdx < oldLines.length) {
        result.push({
          type: "remove",
          content: oldLines[oldIdx],
          oldLineNum: oldIdx + 1,
          newLineNum: null,
        });
        oldIdx++;
      }
      while (newIdx < newLines.length) {
        result.push({
          type: "add",
          content: newLines[newIdx],
          oldLineNum: null,
          newLineNum: newIdx + 1,
        });
        newIdx++;
      }
    }
  }

  return result;
}

/**
 * Find change blocks (consecutive non-context lines)
 */
function findChangeBlocks(diffLines: DiffLine[]): ChangeBlock[] {
  const blocks: ChangeBlock[] = [];
  let blockId = 0;
  let inChange = false;
  let startIdx = 0;

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];

    if (line.type !== "context") {
      if (!inChange) {
        inChange = true;
        startIdx = i;
      }
    } else {
      if (inChange) {
        blocks.push({
          id: blockId++,
          startIdx,
          endIdx: i,
          accepted: null,
        });
        inChange = false;
      }
    }
  }

  if (inChange) {
    blocks.push({
      id: blockId++,
      startIdx,
      endIdx: diffLines.length,
      accepted: null,
    });
  }

  return blocks;
}

/**
 * Reconstruct final text based on accepted/rejected blocks
 */
function reconstructText(
  diffLines: DiffLine[],
  blocks: ChangeBlock[]
): string {
  const lineToBlock = new Map<number, ChangeBlock>();
  for (const block of blocks) {
    for (let i = block.startIdx; i < block.endIdx; i++) {
      lineToBlock.set(i, block);
    }
  }

  const result: string[] = [];

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];
    const block = lineToBlock.get(i);

    if (line.type === "context") {
      result.push(line.content);
    } else if (line.type === "remove") {
      if (block && block.accepted === false) {
        result.push(line.content);
      }
    } else if (line.type === "add") {
      if (!block || block.accepted !== false) {
        result.push(line.content);
      }
    }
  }

  return result.join("\n");
}

/**
 * Get relative path from absolute path
 */
function getRelativePath(app: App, absolutePath: string): string {
  const vaultPath = (app.vault.adapter as any).basePath as string;
  let relativePath = absolutePath;

  if (vaultPath && absolutePath.startsWith(vaultPath)) {
    relativePath = absolutePath.slice(vaultPath.length);
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.slice(1);
    }
  }

  return relativePath;
}

/**
 * Modal for viewing full file diff with inline changes (Cursor-style)
 */
export class DiffModal extends Modal {
  private diff: acp.Diff;
  private fullOldText: string = "";
  private fullNewText: string = "";
  private diffLines: DiffLine[] = [];
  private blocks: ChangeBlock[] = [];
  private onApply?: (newText: string) => void;
  private onReject?: () => void;
  private blockElements: Map<number, HTMLElement> = new Map();
  private contentContainer: HTMLElement | null = null;

  constructor(
    app: App,
    diff: acp.Diff,
    options?: {
      onApply?: (newText: string) => void;
      onReject?: () => void;
    }
  ) {
    super(app);
    this.diff = diff;
    this.onApply = options?.onApply;
    this.onReject = options?.onReject;
  }

  async onOpen(): Promise<void> {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("diff-modal");
    modalEl.addClass("diff-modal-container");

    // Show loading state
    const loadingEl = contentEl.createDiv({ cls: "diff-loading" });
    loadingEl.setText("Loading file...");

    try {
      // Load full file content from disk
      await this.loadFileContent();

      // Remove loading state
      loadingEl.remove();

      // Render the diff view
      this.renderDiffView();
    } catch (error) {
      loadingEl.setText(`Error loading file: ${error}`);
      console.error("[DiffModal] Error:", error);
    }
  }

  private async loadFileContent(): Promise<void> {
    const diffOldText = this.diff.oldText ?? "";
    const diffNewText = this.diff.newText ?? "";

    // Try to read the full file from disk
    if (this.diff.path) {
      const relativePath = getRelativePath(this.app, this.diff.path);
      const file = this.app.vault.getAbstractFileByPath(relativePath);

      if (file instanceof TFile) {
        const fileContent = await this.app.vault.read(file);

        // Find where the oldText appears in the file
        const oldTextIndex = fileContent.indexOf(diffOldText);

        if (oldTextIndex !== -1) {
          // We found the oldText in the file - create full file diff
          this.fullOldText = fileContent;
          this.fullNewText = fileContent.slice(0, oldTextIndex) +
                            diffNewText +
                            fileContent.slice(oldTextIndex + diffOldText.length);
        } else {
          // oldText not found - maybe it's already applied or file changed
          // Fall back to showing just the diff
          console.warn("[DiffModal] oldText not found in file, showing diff only");
          this.fullOldText = diffOldText;
          this.fullNewText = diffNewText;
        }
      } else {
        // File not found in vault - use diff as-is
        console.warn("[DiffModal] File not found in vault:", relativePath);
        this.fullOldText = diffOldText;
        this.fullNewText = diffNewText;
      }
    } else {
      // No path provided - use diff as-is
      this.fullOldText = diffOldText;
      this.fullNewText = diffNewText;
    }

    // Compute diff lines
    this.diffLines = computeDiffLines(this.fullOldText, this.fullNewText);
    this.blocks = findChangeBlocks(this.diffLines);
  }

  private renderDiffView(): void {
    const { contentEl } = this;

    // Header
    const header = contentEl.createDiv({ cls: "diff-modal-header" });

    // Title with clickable path
    const titleContainer = header.createDiv({ cls: "diff-modal-title" });
    titleContainer.createSpan().setText("📄 ");
    if (this.diff.path) {
      createClickablePath(this.app, titleContainer, this.diff.path, { cls: "diff-modal-path" });
    } else {
      titleContainer.createSpan().setText("Unknown file");
    }

    // Stats
    const additions = this.diffLines.filter(l => l.type === "add").length;
    const deletions = this.diffLines.filter(l => l.type === "remove").length;

    const stats = header.createDiv({ cls: "diff-modal-stats" });
    if (additions > 0) {
      const addStat = stats.createSpan({ cls: "diff-stat-add" });
      addStat.setText(`+${additions}`);
    }
    if (deletions > 0) {
      const delStat = stats.createSpan({ cls: "diff-stat-remove" });
      delStat.setText(`-${deletions}`);
    }

    // Main action buttons
    const actions = header.createDiv({ cls: "diff-modal-actions" });

    const acceptAllBtn = actions.createEl("button", { cls: "diff-modal-btn diff-btn-accept" });
    acceptAllBtn.setText("✓ Accept All");
    acceptAllBtn.addEventListener("click", () => {
      this.blocks.forEach(b => {
        b.accepted = true;
        this.updateBlockState(b);
      });
      this.applyChanges();
    });

    const rejectAllBtn = actions.createEl("button", { cls: "diff-modal-btn diff-btn-reject" });
    rejectAllBtn.setText("✗ Reject All");
    rejectAllBtn.addEventListener("click", () => {
      this.blocks.forEach(b => {
        b.accepted = false;
        this.updateBlockState(b);
      });
      if (this.onReject) {
        this.onReject();
      }
      this.close();
    });

    const copyBtn = actions.createEl("button", { cls: "diff-modal-btn" });
    copyBtn.setText("📋 Copy");
    copyBtn.addEventListener("click", async () => {
      const diffText = this.generateDiffText();
      await navigator.clipboard.writeText(diffText);
      copyBtn.setText("✓ Copied!");
      setTimeout(() => copyBtn.setText("📋 Copy"), 2000);
    });

    // Changes count info
    const changesInfo = header.createDiv({ cls: "diff-modal-hunks-info" });
    changesInfo.setText(`${this.blocks.length} change${this.blocks.length !== 1 ? "s" : ""} · ${this.diffLines.filter(l => l.type === "context").length} lines`);

    // Content - render full file with inline changes
    this.contentContainer = contentEl.createDiv({ cls: "diff-modal-content" });

    if (this.diffLines.length === 0) {
      this.contentContainer.setText("No changes to display");
    } else {
      this.renderFullFile(this.contentContainer);
    }

    // Footer with Apply Selected button (if multiple changes)
    if (this.blocks.length > 1) {
      const footer = contentEl.createDiv({ cls: "diff-modal-footer" });

      const applySelectedBtn = footer.createEl("button", { cls: "diff-modal-btn diff-btn-apply-selected" });
      applySelectedBtn.setText("Apply Selected Changes");
      applySelectedBtn.addEventListener("click", () => {
        this.applyChanges();
      });
    }
  }

  private renderFullFile(container: HTMLElement): void {
    const table = container.createEl("table", { cls: "diff-table diff-full-file" });
    const tbody = table.createEl("tbody");

    // Build a map of line index to block
    const lineToBlock = new Map<number, ChangeBlock>();
    for (const block of this.blocks) {
      for (let i = block.startIdx; i < block.endIdx; i++) {
        lineToBlock.set(i, block);
      }
    }

    // Track which blocks we've rendered headers for
    const renderedBlockHeaders = new Set<number>();

    for (let i = 0; i < this.diffLines.length; i++) {
      const line = this.diffLines[i];
      const block = lineToBlock.get(i);

      // If this is the first line of a change block, render block header with buttons
      if (block && !renderedBlockHeaders.has(block.id)) {
        renderedBlockHeaders.add(block.id);
        this.renderBlockHeader(tbody, block);
      }

      // Render the line
      const tr = tbody.createEl("tr", {
        cls: `diff-row diff-row-${line.type}`,
        attr: block ? { "data-block-id": String(block.id) } : {}
      });

      // Line number columns
      const oldNumTd = tr.createEl("td", { cls: "diff-line-num diff-line-num-old" });
      if (line.oldLineNum !== null) {
        oldNumTd.setText(String(line.oldLineNum));
      }

      const newNumTd = tr.createEl("td", { cls: "diff-line-num diff-line-num-new" });
      if (line.newLineNum !== null) {
        newNumTd.setText(String(line.newLineNum));
      }

      // Prefix column (+/-)
      const prefixTd = tr.createEl("td", { cls: "diff-line-prefix" });
      if (line.type === "add") {
        prefixTd.setText("+");
      } else if (line.type === "remove") {
        prefixTd.setText("-");
      } else {
        prefixTd.setText(" ");
      }

      // Content column
      const contentTd = tr.createEl("td", { cls: "diff-line-content" });
      const pre = contentTd.createEl("pre");
      pre.setText(line.content || " ");
    }
  }

  private renderBlockHeader(tbody: HTMLElement, block: ChangeBlock): void {
    const headerRow = tbody.createEl("tr", {
      cls: "diff-block-header-row",
      attr: { "data-block-id": String(block.id) }
    });

    const td = headerRow.createEl("td", {
      cls: "diff-block-header",
      attr: { colspan: "4" }
    });

    const actions = td.createDiv({ cls: "diff-block-actions" });

    const acceptBtn = actions.createEl("button", { cls: "diff-block-btn diff-block-accept" });
    acceptBtn.setText("✓ Accept");
    acceptBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      block.accepted = true;
      this.updateBlockState(block);
    });

    const rejectBtn = actions.createEl("button", { cls: "diff-block-btn diff-block-reject" });
    rejectBtn.setText("✗ Reject");
    rejectBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      block.accepted = false;
      this.updateBlockState(block);
    });

    this.blockElements.set(block.id, headerRow);
  }

  private updateBlockState(block: ChangeBlock): void {
    const rows = this.contentEl.querySelectorAll(`[data-block-id="${block.id}"]`);

    rows.forEach(row => {
      row.removeClass("block-accepted", "block-rejected", "block-pending");

      if (block.accepted === true) {
        row.addClass("block-accepted");
      } else if (block.accepted === false) {
        row.addClass("block-rejected");
      } else {
        row.addClass("block-pending");
      }
    });
  }

  private applyChanges(): void {
    // Default undecided blocks to accepted
    for (const block of this.blocks) {
      if (block.accepted === null) {
        block.accepted = true;
      }
    }

    const finalText = reconstructText(this.diffLines, this.blocks);

    if (this.onApply) {
      this.onApply(finalText);
    }

    this.close();
  }

  private generateDiffText(): string {
    const lines: string[] = [];
    lines.push(`--- ${this.diff.path ?? "a/file"}`);
    lines.push(`+++ ${this.diff.path ?? "b/file"}`);

    for (const line of this.diffLines) {
      if (line.type === "add") {
        lines.push("+" + line.content);
      } else if (line.type === "remove") {
        lines.push("-" + line.content);
      } else {
        lines.push(" " + line.content);
      }
    }

    return lines.join("\n");
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.blockElements.clear();
  }
}

/**
 * Inline diff viewer for tool cards (compact version)
 */
export class DiffViewer {
  private container: HTMLElement;

  constructor(parent: HTMLElement, diff: acp.Diff) {
    this.container = parent.createDiv({ cls: "diff-viewer" });

    const header = this.container.createDiv({ cls: "diff-viewer-header" });
    header.setText(`📄 ${diff.path ?? "Unknown file"}`);

    const content = this.container.createDiv({ cls: "diff-viewer-content" });

    const oldText = diff.oldText ?? "";
    const newText = diff.newText ?? "";

    if (oldText || newText) {
      this.renderSimpleDiff(content, oldText, newText);
    } else {
      content.setText("No diff content available");
    }
  }

  private renderSimpleDiff(container: HTMLElement, oldText: string, newText: string): void {
    const diffLines = computeDiffLines(oldText, newText);
    const linesContainer = container.createDiv({ cls: "diff-viewer-lines" });

    const maxLines = Math.min(diffLines.length, 10);

    for (let i = 0; i < maxLines; i++) {
      const line = diffLines[i];
      const lineEl = linesContainer.createDiv({ cls: `diff-viewer-line diff-line-${line.type}` });

      const prefix = line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  ";
      const contentSpan = lineEl.createSpan({ cls: "diff-line-content" });
      contentSpan.setText(prefix + line.content);
    }

    if (diffLines.length > 10) {
      const moreEl = linesContainer.createDiv({ cls: "diff-viewer-line diff-line-context" });
      moreEl.setText(`  ... (${diffLines.length - 10} more lines)`);
    }
  }

  getElement(): HTMLElement {
    return this.container;
  }
}

/**
 * Creates a simple inline diff from old and new text
 */
export function createSimpleDiff(oldText: string, newText: string): HTMLElement {
  const container = document.createElement("div");
  container.className = "simple-diff";

  const diffLines = computeDiffLines(oldText, newText);

  for (const line of diffLines) {
    const lineEl = document.createElement("div");
    lineEl.className = `diff-line diff-line-${line.type}`;

    const prefix = line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  ";
    lineEl.textContent = prefix + line.content;
    container.appendChild(lineEl);
  }

  return container;
}
