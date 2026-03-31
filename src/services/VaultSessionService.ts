/**
 * VaultSessionService
 *
 * Manages chat sessions stored as Markdown files in the vault.
 * Sessions are stored in /vault/claude-code/sessions/*.md with YAML frontmatter.
 *
 * Features:
 * - Session CRUD operations
 * - Markdown serialization with frontmatter
 * - File reference tracking
 * - Message persistence
 */

import { App, TFile, TFolder, normalizePath } from "obsidian";

// ============================================================================
// Types
// ============================================================================

export interface FileReference {
  /** Vault-relative path */
  path: string;
  /** How the file was referenced */
  type: "explicit" | "read" | "written";
  /** When first referenced */
  addedAt: Date;
}

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  /** Tool names used in this message */
  toolCalls?: string[];
}

export interface VaultSession {
  /** Unique session ID */
  id: string;
  /** Claude Code session ID (for resume) */
  claudeSessionId?: string;
  /** Session title */
  title: string;
  /** Creation timestamp */
  created: Date;
  /** Last update timestamp */
  updated: Date;
  /** Files referenced in this session */
  referencedFiles: FileReference[];
  /** Unique folders from referenced files */
  referencedFolders: string[];
  /** Tags extracted from referenced files */
  tags: string[];
  /** Number of messages */
  messageCount: number;
  /** Cached messages */
  messages: SessionMessage[];
}

export interface VaultSessionSummary {
  id: string;
  title: string;
  created: Date;
  updated: Date;
  referencedFolders: string[];
  messageCount: number;
  /** Preview of last message */
  lastMessagePreview?: string;
}

// ============================================================================
// Constants
// ============================================================================

const SESSIONS_FOLDER = "claude-code/sessions";
const SESSION_PREFIX = "session-";

// ============================================================================
// Service
// ============================================================================

export class VaultSessionService {
  private app: App;
  private sessionsPath: string;
  private sessionCache: Map<string, VaultSession> = new Map();

  constructor(app: App) {
    this.app = app;
    this.sessionsPath = SESSIONS_FOLDER;
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Ensure the sessions folder exists
   */
  async ensureSessionsFolder(): Promise<void> {
    const folderPath = normalizePath(this.sessionsPath);
    const folder = this.app.vault.getAbstractFileByPath(folderPath);

    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    }
  }

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Create a new session
   */
  async createSession(initialTitle?: string): Promise<VaultSession> {
    await this.ensureSessionsFolder();

    const id = this.generateSessionId();
    const now = new Date();

    const session: VaultSession = {
      id,
      title: initialTitle || `Session ${this.formatDate(now)}`,
      created: now,
      updated: now,
      referencedFiles: [],
      referencedFolders: [],
      tags: [],
      messageCount: 0,
      messages: [],
    };

    await this.saveSession(session);
    this.sessionCache.set(id, session);

    return session;
  }

  /**
   * Get a session by ID
   */
  async getSession(id: string): Promise<VaultSession | null> {
    // Check cache first
    if (this.sessionCache.has(id)) {
      return this.sessionCache.get(id)!;
    }

    const filePath = this.getSessionFilePath(id);
    const file = this.app.vault.getAbstractFileByPath(filePath);

    if (!file || !(file instanceof TFile)) {
      return null;
    }

    const session = await this.loadSessionFromFile(file);
    if (session) {
      this.sessionCache.set(id, session);
    }

    return session;
  }

  /**
   * List all sessions (summaries only for performance)
   */
  async listSessions(): Promise<VaultSessionSummary[]> {
    await this.ensureSessionsFolder();

    const folderPath = normalizePath(this.sessionsPath);
    const folder = this.app.vault.getAbstractFileByPath(folderPath);

    if (!folder || !(folder instanceof TFolder)) {
      return [];
    }

    const summaries: VaultSessionSummary[] = [];

    for (const file of folder.children) {
      if (file instanceof TFile && file.extension === "md") {
        const summary = await this.loadSessionSummary(file);
        if (summary) {
          summaries.push(summary);
        }
      }
    }

    // Sort by updated date, newest first
    summaries.sort((a, b) => b.updated.getTime() - a.updated.getTime());

    return summaries;
  }

  /**
   * Update a session
   */
  async updateSession(session: VaultSession): Promise<void> {
    session.updated = new Date();
    await this.saveSession(session);
    this.sessionCache.set(session.id, session);
  }

  /**
   * Delete a session
   */
  async deleteSession(id: string): Promise<void> {
    const filePath = this.getSessionFilePath(id);
    const file = this.app.vault.getAbstractFileByPath(filePath);

    if (file instanceof TFile) {
      await this.app.fileManager.trashFile(file);
    }

    this.sessionCache.delete(id);
  }

  // ==========================================================================
  // Message Operations
  // ==========================================================================

  /**
   * Append a message to a session
   */
  async appendMessage(id: string, message: SessionMessage): Promise<void> {
    const session = await this.getSession(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }

    session.messages.push(message);
    session.messageCount = session.messages.length;
    session.updated = new Date();

    await this.saveSession(session);
    this.sessionCache.set(id, session);
  }

  /**
   * Add a file reference to a session
   */
  async addFileReference(id: string, path: string, type: FileReference["type"]): Promise<void> {
    const session = await this.getSession(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }

    // Check if already referenced
    const existing = session.referencedFiles.find((f) => f.path === path);
    if (existing) {
      // Update type if more significant (written > read > explicit)
      const priority = { explicit: 0, read: 1, written: 2 };
      if (priority[type] > priority[existing.type]) {
        existing.type = type;
      }
      return;
    }

    // Add new reference
    session.referencedFiles.push({
      path,
      type,
      addedAt: new Date(),
    });

    // Update folders
    const folder = this.getParentFolder(path);
    if (folder && !session.referencedFolders.includes(folder)) {
      session.referencedFolders.push(folder);
    }

    session.updated = new Date();
    await this.saveSession(session);
    this.sessionCache.set(id, session);
  }

  /**
   * Update session title
   */
  async renameSession(id: string, newTitle: string): Promise<void> {
    const session = await this.getSession(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }

    session.title = newTitle;
    session.updated = new Date();

    await this.saveSession(session);
    this.sessionCache.set(id, session);
  }

  /**
   * Link a Claude session ID to this vault session
   */
  async linkClaudeSession(id: string, claudeSessionId: string): Promise<void> {
    const session = await this.getSession(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }

    session.claudeSessionId = claudeSessionId;
    session.updated = new Date();

    await this.saveSession(session);
    this.sessionCache.set(id, session);
  }

  // ==========================================================================
  // Title Generation
  // ==========================================================================

  /**
   * Auto-generate a title for the session
   */
  generateTitle(session: VaultSession): string {
    // Priority 1: First user message
    const firstUserMessage = session.messages.find((m) => m.role === "user");
    if (firstUserMessage) {
      return this.truncateText(firstUserMessage.content, 50);
    }

    // Priority 2: Main referenced file
    if (session.referencedFiles.length > 0) {
      const mainFile = session.referencedFiles[0].path;
      const fileName = mainFile.split("/").pop() || mainFile;
      return `Working on ${fileName}`;
    }

    // Priority 3: Main folder
    if (session.referencedFolders.length > 0) {
      return `Session in ${session.referencedFolders[0]}`;
    }

    // Priority 4: Timestamp
    return `Session ${this.formatDate(session.created)}`;
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  /**
   * Serialize session to Markdown with YAML frontmatter
   */
  private serializeSession(session: VaultSession): string {
    const frontmatter = this.buildFrontmatter(session);
    const body = this.buildBody(session);

    return `---\n${frontmatter}---\n\n${body}`;
  }

  private buildFrontmatter(session: VaultSession): string {
    const lines: string[] = [];

    lines.push(`id: ${session.id}`);
    if (session.claudeSessionId) {
      lines.push(`claudeSessionId: ${session.claudeSessionId}`);
    }
    lines.push(`title: "${this.escapeYamlString(session.title)}"`);
    lines.push(`created: ${session.created.toISOString()}`);
    lines.push(`updated: ${session.updated.toISOString()}`);
    lines.push(`messageCount: ${session.messageCount}`);

    // Referenced files
    if (session.referencedFiles.length > 0) {
      lines.push("referencedFiles:");
      for (const ref of session.referencedFiles) {
        lines.push(`  - path: "${this.escapeYamlString(ref.path)}"`);
        lines.push(`    type: ${ref.type}`);
        lines.push(`    addedAt: ${ref.addedAt.toISOString()}`);
      }
    }

    // Referenced folders
    if (session.referencedFolders.length > 0) {
      lines.push("referencedFolders:");
      for (const folder of session.referencedFolders) {
        lines.push(`  - "${this.escapeYamlString(folder)}"`);
      }
    }

    // Tags
    if (session.tags.length > 0) {
      lines.push(`tags: [${session.tags.map((t) => `"${t}"`).join(", ")}]`);
    }

    return lines.join("\n") + "\n";
  }

  private buildBody(session: VaultSession): string {
    const lines: string[] = [];

    lines.push(`# ${session.title}`);
    lines.push("");

    for (const msg of session.messages) {
      const timestamp = this.formatTime(msg.timestamp);
      const role = msg.role === "user" ? "User" : "Assistant";

      lines.push(`## ${role} (${timestamp})`);
      lines.push("");
      lines.push(msg.content);

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        lines.push("");
        lines.push(`*Tools: ${msg.toolCalls.join(", ")}*`);
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Parse session from Markdown file
   */
  private async loadSessionFromFile(file: TFile): Promise<VaultSession | null> {
    try {
      const content = await this.app.vault.read(file);
      return this.parseSession(content);
    } catch (error) {
      console.error(`Failed to load session from ${file.path}:`, error);
      return null;
    }
  }

  private parseSession(content: string): VaultSession | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!frontmatterMatch) {
      return null;
    }

    const frontmatter = frontmatterMatch[1];
    const body = content.slice(frontmatterMatch[0].length);

    // Parse frontmatter
    const data = this.parseFrontmatter(frontmatter);
    if (!data.id || typeof data.id !== "string") {
      return null;
    }

    // Parse messages from body
    const messages = this.parseMessages(body);

    return {
      id: data.id,
      claudeSessionId: typeof data.claudeSessionId === "string" ? data.claudeSessionId : undefined,
      title: typeof data.title === "string" ? data.title : "Untitled",
      created: new Date(
        typeof data.created === "string" || typeof data.created === "number"
          ? data.created
          : Date.now()
      ),
      updated: new Date(
        typeof data.updated === "string" || typeof data.updated === "number"
          ? data.updated
          : Date.now()
      ),
      referencedFiles: Array.isArray(data.referencedFiles)
        ? (data.referencedFiles as FileReference[])
        : [],
      referencedFolders: Array.isArray(data.referencedFolders)
        ? (data.referencedFolders as string[])
        : [],
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
      messageCount: typeof data.messageCount === "number" ? data.messageCount : messages.length,
      messages,
    };
  }

  private parseFrontmatter(frontmatter: string): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const lines = frontmatter.split("\n");

    let currentKey = "";
    let currentArray: unknown[] | null = null;
    let currentObject: Record<string, unknown> | null = null;

    for (const line of lines) {
      // Simple key: value
      const simpleMatch = line.match(/^(\w+):\s*(.*)$/);
      if (simpleMatch && !line.startsWith("  ")) {
        if (currentArray && currentKey) {
          data[currentKey] = currentArray;
          currentArray = null;
        }
        currentKey = simpleMatch[1];
        const value = simpleMatch[2].trim();

        if (value === "") {
          // Array or object follows
          currentArray = [];
        } else if (value.startsWith("[") && value.endsWith("]")) {
          // Inline array
          data[currentKey] = this.parseInlineArray(value);
        } else if (value.startsWith('"') && value.endsWith('"')) {
          data[currentKey] = value.slice(1, -1);
        } else if (value === "true" || value === "false") {
          data[currentKey] = value === "true";
        } else if (!isNaN(Number(value))) {
          data[currentKey] = Number(value);
        } else {
          data[currentKey] = value;
        }
        continue;
      }

      // Array item
      const arrayItemMatch = line.match(/^\s+-\s*(.*)$/);
      if (arrayItemMatch && currentArray) {
        const value = arrayItemMatch[1].trim();
        if (value.startsWith("path:")) {
          // Start of object in array
          currentObject = {};
          const pathValue = value.replace("path:", "").trim();
          currentObject.path = pathValue.replace(/^"|"$/g, "");
        } else if (value.startsWith('"') && value.endsWith('"')) {
          currentArray.push(value.slice(1, -1));
        } else {
          currentArray.push(value);
        }
        continue;
      }

      // Object property in array
      const objectPropMatch = line.match(/^\s+(\w+):\s*(.*)$/);
      if (objectPropMatch && currentObject) {
        const key = objectPropMatch[1];
        let value: unknown = objectPropMatch[2].trim();

        if (typeof value === "string") {
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          } else if (key === "addedAt") {
            value = new Date(value);
          }
        }

        currentObject[key] = value;

        // Check if this is the last property of the object
        if (key === "addedAt" && currentArray) {
          // Convert the generic object to FileReference
          const fileRef: FileReference = {
            path: typeof currentObject.path === "string" ? currentObject.path : "",
            type: (currentObject.type as FileReference["type"]) || "explicit",
            addedAt:
              currentObject.addedAt instanceof Date
                ? currentObject.addedAt
                : new Date(
                    typeof currentObject.addedAt === "string" ||
                      typeof currentObject.addedAt === "number"
                      ? currentObject.addedAt
                      : Date.now()
                  ),
          };
          currentArray.push(fileRef);
          currentObject = null;
        }
      }
    }

    // Push any remaining array
    if (currentArray && currentKey) {
      data[currentKey] = currentArray;
    }

    return data;
  }

  private parseInlineArray(value: string): string[] {
    const inner = value.slice(1, -1);
    if (!inner.trim()) return [];

    return inner.split(",").map((item) => {
      const trimmed = item.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1);
      }
      return trimmed;
    });
  }

  private parseMessages(body: string): SessionMessage[] {
    const messages: SessionMessage[] = [];
    const sections = body.split(/^## /m).filter((s) => s.trim());

    for (const section of sections) {
      const headerMatch = section.match(/^(User|Assistant)\s*\(([^)]+)\)\s*\n/);
      if (!headerMatch) continue;

      const role = headerMatch[1].toLowerCase() as "user" | "assistant";
      const timeStr = headerMatch[2];
      const content = section.slice(headerMatch[0].length).trim();

      // Extract tool calls if present
      const toolMatch = content.match(/\*Tools:\s*([^*]+)\*\s*$/);
      const toolCalls = toolMatch ? toolMatch[1].split(",").map((t) => t.trim()) : undefined;
      const cleanContent = toolMatch ? content.slice(0, -toolMatch[0].length).trim() : content;

      messages.push({
        role,
        content: cleanContent,
        timestamp: this.parseTime(timeStr),
        toolCalls,
      });
    }

    return messages;
  }

  /**
   * Load only summary info (faster than full load)
   */
  private async loadSessionSummary(file: TFile): Promise<VaultSessionSummary | null> {
    try {
      const content = await this.app.vault.read(file);
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);

      if (!frontmatterMatch) {
        return null;
      }

      const data = this.parseFrontmatter(frontmatterMatch[1]);
      if (!data.id) {
        return null;
      }

      // Get last message preview from body
      const body = content.slice(frontmatterMatch[0].length);
      const lastMessageMatch = body.match(/## (?:User|Assistant)[^\n]*\n\n([^\n]+)/g);
      const lastMessagePreview = lastMessageMatch
        ? this.truncateText(
            lastMessageMatch[lastMessageMatch.length - 1].replace(
              /^## (?:User|Assistant)[^\n]*\n\n/,
              ""
            ),
            100
          )
        : undefined;

      return {
        id: data.id as string,
        title: (data.title as string) || "Untitled",
        created: new Date((data.created as string) || Date.now()),
        updated: new Date((data.updated as string) || Date.now()),
        referencedFolders: (data.referencedFolders as string[]) || [],
        messageCount: (data.messageCount as number) || 0,
        lastMessagePreview,
      };
    } catch (error) {
      console.error(`Failed to load session summary from ${file.path}:`, error);
      return null;
    }
  }

  // ==========================================================================
  // File Operations
  // ==========================================================================

  private async saveSession(session: VaultSession): Promise<void> {
    await this.ensureSessionsFolder();

    const filePath = this.getSessionFilePath(session.id);
    const content = this.serializeSession(session);

    const existingFile = this.app.vault.getAbstractFileByPath(filePath);

    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      await this.app.vault.create(filePath, content);
    }
  }

  private getSessionFilePath(id: string): string {
    return normalizePath(`${this.sessionsPath}/${SESSION_PREFIX}${id}.md`);
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  private parseTime(timeStr: string): Date {
    // Try to parse time like "10:00" or full ISO
    if (timeStr.includes("T")) {
      return new Date(timeStr);
    }
    // Assume today's date with given time
    const today = new Date();
    const [hours, minutes] = timeStr.split(":").map(Number);
    today.setHours(hours, minutes, 0, 0);
    return today;
  }

  private truncateText(text: string, maxLength: number): string {
    // Remove newlines and extra spaces
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    return cleaned.slice(0, maxLength - 3) + "...";
  }

  private escapeYamlString(str: string): string {
    return str.replace(/"/g, '\\"').replace(/\n/g, "\\n");
  }

  private getParentFolder(path: string): string {
    const parts = path.split("/");
    if (parts.length <= 1) {
      return "";
    }
    return parts.slice(0, -1).join("/");
  }

  /**
   * Clear the session cache (useful for testing)
   */
  clearCache(): void {
    this.sessionCache.clear();
  }
}
