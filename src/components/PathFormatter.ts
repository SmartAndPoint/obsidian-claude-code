/**
 * PathFormatter - Utilities for formatting and displaying vault paths
 *
 * Converts full system paths to Obsidian-friendly [[file]] links
 * and creates clickable elements for navigation.
 */

import { App, TFile, MarkdownRenderer } from "obsidian";

export interface FormattedPath {
  /** Original full path */
  fullPath: string;
  /** Relative path within vault */
  relativePath: string;
  /** Start line number if specified */
  startLine: number | null;
  /** End line number if specified */
  endLine: number | null;
  /** Whether the file exists in vault */
  exists: boolean;
  /** Display text (e.g., "file.md (lines 10-20)") */
  displayText: string;
}

/**
 * Parse a full system path and convert to vault-relative path info
 */
export function parseVaultPath(fullPath: string, vaultBasePath: string): FormattedPath | null {
  if (!fullPath || !vaultBasePath) return null;

  // Check if path starts with vault path
  if (!fullPath.startsWith(vaultBasePath)) return null;

  // Extract relative path
  let relativePath = fullPath.slice(vaultBasePath.length);

  // Parse line numbers if present (e.g., :10 or :10-20)
  let startLine: number | null = null;
  let endLine: number | null = null;

  const lineMatch = relativePath.match(/:(\d+)(?:-(\d+))?$/);
  if (lineMatch) {
    startLine = parseInt(lineMatch[1], 10);
    endLine = lineMatch[2] ? parseInt(lineMatch[2], 10) : startLine;
    relativePath = relativePath.replace(/:(\d+)(?:-(\d+))?$/, '');
  }

  // Remove leading slash if present
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.slice(1);
  }

  // Build display text
  let displayText = relativePath;
  if (startLine !== null) {
    if (startLine === endLine) {
      displayText += ` (line ${startLine})`;
    } else {
      displayText += ` (lines ${startLine}-${endLine})`;
    }
  }

  return {
    fullPath,
    relativePath,
    startLine,
    endLine,
    exists: false, // Will be set by caller with vault access
    displayText
  };
}

/**
 * Format a full path to display text, checking if file exists
 */
export function formatPath(app: App, fullPath: string): string {
  const vaultBasePath = (app.vault.adapter as any).basePath as string;
  if (!vaultBasePath) return fullPath;

  const parsed = parseVaultPath(fullPath, vaultBasePath);
  if (!parsed) return fullPath;

  // Check if file exists
  const file = app.vault.getAbstractFileByPath(parsed.relativePath);
  if (!file) return fullPath; // Return original if file not found

  return parsed.displayText;
}

/**
 * Create a clickable path element that opens the file in Obsidian
 */
export function createClickablePath(
  app: App,
  parent: HTMLElement,
  fullPath: string,
  options?: {
    cls?: string;
  }
): HTMLElement {
  const vaultBasePath = (app.vault.adapter as any).basePath as string;
  const pathEl = parent.createEl("span", { cls: options?.cls ?? "vault-path" });

  if (!vaultBasePath) {
    pathEl.setText(fullPath);
    return pathEl;
  }

  const parsed = parseVaultPath(fullPath, vaultBasePath);
  if (!parsed) {
    pathEl.setText(fullPath);
    return pathEl;
  }

  // Check if file exists
  const file = app.vault.getAbstractFileByPath(parsed.relativePath);

  if (file) {
    // Create clickable link
    pathEl.addClass("vault-path-clickable");
    pathEl.setText(parsed.displayText);
    pathEl.setAttribute("data-path", parsed.relativePath);
    if (parsed.startLine !== null) {
      pathEl.setAttribute("data-line", String(parsed.startLine));
    }
    if (parsed.endLine !== null) {
      pathEl.setAttribute("data-end-line", String(parsed.endLine));
    }

    pathEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openFileAtLine(app, parsed.relativePath, parsed.startLine, parsed.endLine);
    });
  } else {
    // File not found - show full path grayed out
    pathEl.addClass("vault-path-missing");
    pathEl.setText(fullPath);
    pathEl.setAttribute("title", "File not found in vault");
  }

  return pathEl;
}

/**
 * Open a file at a specific line (or line range)
 */
export async function openFileAtLine(
  app: App,
  relativePath: string,
  startLine: number | null,
  endLine: number | null
): Promise<void> {
  const file = app.vault.getAbstractFileByPath(relativePath);
  if (!file || !(file instanceof TFile)) {
    console.warn(`[PathFormatter] File not found: ${relativePath}`);
    return;
  }

  // Open the file
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file);

  // If line numbers specified, scroll to that line
  if (startLine !== null) {
    // Wait for editor to be ready
    setTimeout(() => {
      const view = leaf.view;
      if (view && "editor" in view) {
        const editor = (view as any).editor;
        if (editor) {
          // Convert to 0-based line index
          const line = startLine - 1;
          const endLineIdx = (endLine ?? startLine) - 1;

          // Set cursor and scroll
          editor.setCursor({ line, ch: 0 });

          // Select the line range if multiple lines
          if (endLineIdx > line) {
            const lastLineLength = editor.getLine(endLineIdx)?.length ?? 0;
            editor.setSelection(
              { line, ch: 0 },
              { line: endLineIdx, ch: lastLineLength }
            );
          }

          // Scroll to center
          editor.scrollIntoView({ from: { line, ch: 0 }, to: { line: endLineIdx, ch: 0 } }, true);
        }
      }
    }, 100);
  }
}

/**
 * Convert full vault paths in text to [[file]] links
 * Handles any UTF-8 characters (Cyrillic, Chinese, Spanish, etc.)
 */
export function formatAgentPaths(app: App, text: string): string {
  const vaultPath = (app.vault.adapter as any).basePath as string;
  if (!vaultPath) return text;

  let result = text;
  let searchStart = 0;

  while (true) {
    // Find next occurrence of vaultPath
    const vaultIndex = result.indexOf(vaultPath, searchStart);
    if (vaultIndex === -1) break;

    // Extend right until we hit a delimiter
    let endIndex = vaultIndex + vaultPath.length;

    while (endIndex < result.length) {
      const char = result[endIndex];

      // Stop at whitespace or common punctuation (but include various quote styles)
      if (/[\s,;!?()\[\]<>"'«»„"'']/.test(char)) break;

      // Allow : only if followed by digits (line numbers)
      if (char === ':') {
        const nextChar = result[endIndex + 1] || '';
        if (!/\d/.test(nextChar)) break;
      }

      endIndex++;
    }

    const fullPath = result.slice(vaultIndex, endIndex);

    // Parse line numbers if present (e.g., :10 or :10-20)
    let relativePath = fullPath.slice(vaultPath.length);
    let startLine: number | null = null;
    let endLine: number | null = null;

    const lineMatch = relativePath.match(/:(\d+)(?:-(\d+))?$/);
    if (lineMatch) {
      startLine = parseInt(lineMatch[1], 10);
      endLine = lineMatch[2] ? parseInt(lineMatch[2], 10) : startLine;
      relativePath = relativePath.replace(/:(\d+)(?:-(\d+))?$/, '');
    }

    // Remove leading slash if present
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.slice(1);
    }

    // Validate that file exists in vault
    const file = app.vault.getAbstractFileByPath(relativePath);

    if (file) {
      // Build replacement string
      let replacement = `[[${relativePath}]]`;

      if (startLine !== null) {
        if (startLine === endLine) {
          replacement += ` (line ${startLine})`;
        } else {
          replacement += ` (lines ${startLine}-${endLine})`;
        }
      }

      // Replace in result
      result = result.slice(0, vaultIndex) + replacement + result.slice(endIndex);

      // Move search position past the replacement
      searchStart = vaultIndex + replacement.length;
    } else {
      // File not found, skip this occurrence
      searchStart = endIndex;
    }
  }

  return result;
}
