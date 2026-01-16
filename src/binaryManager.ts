/**
 * BinaryManager - Handles claude-code-acp binary discovery, download, and execution
 *
 * Standalone mode: Downloads and installs the package automatically on first run
 *
 * Priority order:
 * 1. Cached installation (in plugin data directory)
 * 2. Local node_modules (development)
 * 3. Global npm installation
 * 4. System PATH (homebrew, etc.)
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";

// Package version to install (should match package.json)
const ACP_PACKAGE = "@zed-industries/claude-code-acp";
const ACP_VERSION = "0.13.1";

export interface BinaryInfo {
  path: string;
  type: "cached" | "local" | "global" | "system";
  needsNode: boolean;
  version?: string;
}

export interface DownloadProgress {
  status: "checking" | "downloading" | "installing" | "ready" | "error";
  message: string;
  progress?: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

/**
 * Get the cache directory for the plugin
 * Uses Obsidian's plugin data directory pattern
 */
export function getCacheDir(pluginDir: string): string {
  // Store in plugin's own directory under 'bin' folder
  return join(pluginDir, "bin");
}

/**
 * Check if cached installation exists and is valid
 */
export function isCachedInstallationValid(cacheDir: string): boolean {
  // Check path structure for scoped npm package
  const packageJsonPath = join(cacheDir, "node_modules", "@zed-industries", "claude-code-acp", "package.json");
  const indexPath = join(cacheDir, "node_modules", "@zed-industries", "claude-code-acp", "dist", "index.js");

  if (existsSync(indexPath) && existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      if (pkg.version === ACP_VERSION) {
        return true;
      }
      console.debug(`[BinaryManager] Cached version ${pkg.version} differs from required ${ACP_VERSION}`);
    } catch {
      // Invalid package.json
    }
  }

  return false;
}

/**
 * Get the path to the cached binary
 */
export function getCachedBinaryPath(cacheDir: string): string | null {
  const indexPath = join(cacheDir, "node_modules", "@zed-industries", "claude-code-acp", "dist", "index.js");

  if (existsSync(indexPath)) {
    return indexPath;
  }

  return null;
}

/**
 * Install the ACP package to the cache directory
 */
export async function installAcpPackage(
  cacheDir: string,
  onProgress?: ProgressCallback
): Promise<boolean> {
  try {
    onProgress?.({ status: "checking", message: "Preparing installation directory..." });

    // Create cache directory if it doesn't exist
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    // Create a minimal package.json for npm install
    const packageJson = {
      name: "obsidian-claude-code-acp-cache",
      version: "1.0.0",
      private: true,
      dependencies: {
        [ACP_PACKAGE]: ACP_VERSION,
      },
    };

    writeFileSync(join(cacheDir, "package.json"), JSON.stringify(packageJson, null, 2));

    onProgress?.({ status: "downloading", message: `Installing ${ACP_PACKAGE}@${ACP_VERSION}...` });

    // Find npm executable
    const npmPath = findNpmPath();
    console.debug(`[BinaryManager] Using npm: ${npmPath}`);

    // Run npm install
    return new Promise((resolve) => {
      const npmProcess = spawn(npmPath, ["install", "--no-audit", "--no-fund", "--loglevel", "error"], {
        cwd: cacheDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PATH: `${process.env.PATH || ""}:/opt/homebrew/bin:/usr/local/bin:/usr/bin`,
        },
        shell: process.platform === "win32",
      });

      let stderr = "";

      npmProcess.stdout?.on("data", (data) => {
        console.debug("[npm]", data.toString().trim());
      });

      npmProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
        console.debug("[npm stderr]", data.toString().trim());
      });

      npmProcess.on("error", (err) => {
        console.error("[BinaryManager] npm spawn error:", err);
        onProgress?.({ status: "error", message: `Failed to run npm: ${err.message}` });
        resolve(false);
      });

      npmProcess.on("close", (code) => {
        if (code === 0) {
          onProgress?.({ status: "ready", message: "Installation complete!" });
          resolve(true);
        } else {
          console.error("[BinaryManager] npm install failed:", stderr);
          onProgress?.({ status: "error", message: `npm install failed (exit code ${code})` });
          resolve(false);
        }
      });
    });
  } catch (error) {
    const err = error as Error;
    console.error("[BinaryManager] Installation error:", err);
    onProgress?.({ status: "error", message: `Installation failed: ${err.message}` });
    return false;
  }
}

/**
 * Find npm executable path
 */
function findNpmPath(): string {
  const isWindows = process.platform === "win32";
  const npmBinary = isWindows ? "npm.cmd" : "npm";

  const npmPaths = [
    // macOS Homebrew (Apple Silicon)
    "/opt/homebrew/bin/npm",
    // macOS Homebrew (Intel)
    "/usr/local/bin/npm",
    // Linux
    "/usr/bin/npm",
    // nvm (common locations)
    join(homedir(), ".nvm", "versions", "node"),
    // Volta
    join(homedir(), ".volta", "bin", "npm"),
    // Windows
    join(homedir(), "AppData", "Roaming", "npm", npmBinary),
  ];

  for (const npmPath of npmPaths) {
    if (existsSync(npmPath)) {
      return npmPath;
    }
  }

  // Fallback: assume npm is in PATH
  return npmBinary;
}

/**
 * Find claude-code-acp binary, with automatic download if needed
 */
export async function ensureBinaryAvailable(
  pluginDir: string,
  onProgress?: ProgressCallback
): Promise<BinaryInfo | null> {
  // 1. Check cached installation first
  const cacheDir = getCacheDir(pluginDir);

  if (isCachedInstallationValid(cacheDir)) {
    const cachedPath = getCachedBinaryPath(cacheDir);
    if (cachedPath) {
      console.debug("[BinaryManager] Using cached binary:", cachedPath);
      onProgress?.({ status: "ready", message: "Using cached installation" });
      return { path: cachedPath, type: "cached", needsNode: true, version: ACP_VERSION };
    }
  }

  // 2. Check local node_modules (development)
  const localPath = findLocalBinary(pluginDir);
  if (localPath) {
    console.debug("[BinaryManager] Using local binary:", localPath);
    onProgress?.({ status: "ready", message: "Using local installation" });
    return { path: localPath, type: "local", needsNode: true };
  }

  // 3. Check global/system installations
  const globalPath = findGlobalBinary();
  if (globalPath) {
    console.debug("[BinaryManager] Using global binary:", globalPath);
    onProgress?.({ status: "ready", message: "Using global installation" });
    return { path: globalPath, type: "global", needsNode: false };
  }

  const systemPath = findSystemBinary();
  if (systemPath) {
    console.debug("[BinaryManager] Using system binary:", systemPath);
    onProgress?.({ status: "ready", message: "Using system installation" });
    return { path: systemPath, type: "system", needsNode: false };
  }

  // 4. Need to download and install
  console.debug("[BinaryManager] No binary found, installing...");
  onProgress?.({ status: "downloading", message: "Binary not found, downloading..." });

  const success = await installAcpPackage(cacheDir, onProgress);

  if (success) {
    const installedPath = getCachedBinaryPath(cacheDir);
    if (installedPath) {
      return { path: installedPath, type: "cached", needsNode: true, version: ACP_VERSION };
    }
  }

  onProgress?.({ status: "error", message: "Failed to install binary" });
  return null;
}

/**
 * Synchronous version - find binary without downloading
 */
export function findClaudeCodeAcpBinary(pluginDir?: string): BinaryInfo {
  // Try cached first
  if (pluginDir) {
    const cacheDir = getCacheDir(pluginDir);
    if (isCachedInstallationValid(cacheDir)) {
      const cachedPath = getCachedBinaryPath(cacheDir);
      if (cachedPath) {
        return { path: cachedPath, type: "cached", needsNode: true, version: ACP_VERSION };
      }
    }

    // Try local
    const localPath = findLocalBinary(pluginDir);
    if (localPath) {
      return { path: localPath, type: "local", needsNode: true };
    }
  }

  // Try global/system
  const globalPath = findGlobalBinary();
  if (globalPath) {
    return { path: globalPath, type: "global", needsNode: false };
  }

  const systemPath = findSystemBinary();
  if (systemPath) {
    return { path: systemPath, type: "system", needsNode: false };
  }

  // Fallback
  const binaryName = process.platform === "win32" ? "claude-code-acp.cmd" : "claude-code-acp";
  return { path: binaryName, type: "system", needsNode: false };
}

/**
 * Find binary in local node_modules
 */
function findLocalBinary(pluginDir: string): string | null {
  const acpPackagePath = join("node_modules", "@zed-industries", "claude-code-acp", "dist", "index.js");

  const possiblePaths = [
    join(pluginDir, acpPackagePath),
    join(pluginDir, "..", acpPackagePath),
    join(dirname(pluginDir), acpPackagePath),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Find binary in global npm installations
 */
function findGlobalBinary(): string | null {
  const isWindows = process.platform === "win32";
  const binaryName = isWindows ? "claude-code-acp.cmd" : "claude-code-acp";

  const globalPaths = [
    join(homedir(), ".npm-global", "bin", binaryName),
    join(homedir(), "AppData", "Roaming", "npm", binaryName),
    join(homedir(), ".local", "share", "pnpm", binaryName),
    join(homedir(), ".volta", "bin", binaryName),
  ];

  for (const path of globalPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Find binary in system paths
 */
function findSystemBinary(): string | null {
  const isWindows = process.platform === "win32";
  const binaryName = isWindows ? "claude-code-acp.cmd" : "claude-code-acp";

  const systemPaths = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];

  for (const dir of systemPaths) {
    const fullPath = join(dir, binaryName);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Get the Node.js executable path
 */
export function getNodePath(): string {
  const isWindows = process.platform === "win32";
  const nodeBinary = isWindows ? "node.exe" : "node";

  const nodePaths = [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
    join(homedir(), ".volta", "bin", "node"),
  ];

  for (const nodePath of nodePaths) {
    if (existsSync(nodePath)) {
      return nodePath;
    }
  }

  return nodeBinary;
}

/**
 * Get spawn arguments for the binary
 */
export function getSpawnArgs(binaryInfo: BinaryInfo): { command: string; args: string[] } {
  if (binaryInfo.needsNode) {
    const nodePath = getNodePath();
    return {
      command: nodePath,
      args: [binaryInfo.path],
    };
  }

  return {
    command: binaryInfo.path,
    args: [],
  };
}
