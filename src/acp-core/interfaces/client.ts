/**
 * ACP Client Interface
 *
 * Version: 1.1.0 (aligned with @agentclientprotocol/sdk 0.13.0)
 *
 * This interface defines the contract for ACP client implementations.
 * It supports all features from the ACP specification including:
 * - Session management (create, load, fork, resume, list)
 * - Prompt processing with streaming
 * - Permission handling
 * - File system operations
 * - Terminal operations
 * - Session modes and configuration
 *
 * @see https://agentclientprotocol.com/protocol/overview
 */

import type {
  // Initialization
  AgentCapabilities,

  // Session
  Session,
  SessionConfig,
  SessionMode,
  SessionModeState,
  McpServerConfig,

  // Session management (experimental)
  ListSessionsParams,
  ListSessionsResult,

  // Session config
  ModelInfo,
  SessionConfigOption,

  // Prompt
  PromptContent,

  // Streaming
  StreamEvent,

  // Permissions
  PermissionHandler,

  // Terminal
  TerminalOutputResult,
  WaitForTerminalExitResult,

  // Config
  AcpClientConfig,
} from "./types";

/**
 * Main ACP Client Interface
 *
 * All ACP client implementations must implement this interface.
 * The interface is designed to be implementation-agnostic, allowing
 * different backends (Zed adapter, native implementation, etc.)
 */
export interface IAcpClient {
  // ==========================================================================
  // Connection Lifecycle
  // ==========================================================================

  /**
   * Connect to the ACP agent and create a new session.
   *
   * This performs:
   * 1. Process/connection initialization
   * 2. Protocol negotiation (initialize)
   * 3. Session creation (newSession)
   *
   * @param config - Session configuration
   * @returns Created session
   */
  connect(config: SessionConfig): Promise<Session>;

  /**
   * Disconnect from the ACP agent.
   *
   * Closes the session and cleans up resources.
   */
  disconnect(): Promise<void>;

  /**
   * Check if connected to an agent.
   */
  isConnected(): boolean;

  /**
   * Get the current session.
   *
   * @returns Current session or null if not connected
   */
  getSession(): Session | null;

  /**
   * Get the agent capabilities.
   *
   * Available after connect() succeeds.
   */
  getAgentCapabilities(): AgentCapabilities | null;

  // ==========================================================================
  // Messaging
  // ==========================================================================

  /**
   * Send a message and stream the response.
   *
   * This is the main method for interacting with the agent.
   * Returns an async generator that yields events as they arrive.
   *
   * @param text - The message text
   * @param options - Optional prompt options (content type, command)
   * @returns Async generator of stream events
   */
  sendMessage(
    text: string,
    options?: SendMessageOptions
  ): AsyncGenerator<StreamEvent, void, unknown>;

  /**
   * Send a message and wait for the complete response.
   *
   * Convenience method that collects all events and returns them.
   *
   * @param text - The message text
   * @param options - Optional prompt options
   * @returns Array of all events
   */
  sendMessageSync(text: string, options?: SendMessageOptions): Promise<StreamEvent[]>;

  /**
   * Cancel an ongoing prompt.
   *
   * Sends a cancel notification to the agent.
   */
  cancel(): Promise<void>;

  // ==========================================================================
  // Permissions
  // ==========================================================================

  /**
   * Set the permission handler for tool approvals.
   *
   * The handler is called when the agent requests permission
   * to execute a tool.
   *
   * @param handler - The permission handler function
   */
  setPermissionHandler(handler: PermissionHandler): void;

  // ==========================================================================
  // Session Modes (if supported)
  // ==========================================================================

  /**
   * Get available session modes.
   *
   * @returns Array of available modes or empty if not supported
   */
  getAvailableModes(): SessionMode[];

  /**
   * Get the current session mode.
   *
   * @returns Current mode state or null
   */
  getCurrentMode(): SessionModeState | null;

  /**
   * Set the session mode.
   *
   * @param modeId - The mode ID to set
   */
  setMode(modeId: string): Promise<void>;

  // ==========================================================================
  // Session Models (experimental, if supported)
  // ==========================================================================

  /**
   * Get available models.
   *
   * @returns Array of available models or empty if not supported
   */
  getAvailableModels(): ModelInfo[];

  /**
   * Get the current model.
   *
   * @returns Current model state or null
   */
  getCurrentModel(): SessionModeState | null;

  /**
   * Set the session model.
   *
   * @param modelId - The model ID to set
   */
  setModel(modelId: string): Promise<void>;

  // ==========================================================================
  // Session Config (experimental, if supported)
  // ==========================================================================

  /**
   * Get session configuration options.
   *
   * @returns Array of config options or empty if not supported
   */
  getConfigOptions(): SessionConfigOption[];

  /**
   * Set a configuration option.
   *
   * @param configId - The config option ID
   * @param valueId - The value ID to set
   * @returns Updated config options
   */
  setConfigOption(configId: string, valueId: string): Promise<SessionConfigOption[]>;

  // ==========================================================================
  // Session Management (experimental, if supported)
  // ==========================================================================

  /**
   * List existing sessions.
   *
   * @param params - List parameters
   * @returns List of sessions
   */
  listSessions(params?: ListSessionsParams): Promise<ListSessionsResult>;

  /**
   * Load an existing session.
   *
   * The session history will be replayed via session updates.
   *
   * @param sessionId - Session ID to load
   * @param mcpServers - MCP servers to connect
   * @returns Loaded session
   */
  loadSession(sessionId: string, mcpServers?: McpServerConfig[]): Promise<Session>;

  /**
   * Fork a session to create a new independent session.
   *
   * @param sessionId - Session ID to fork
   * @param atMessageIndex - Optional message index to fork at
   * @returns New forked session ID
   */
  forkSession(sessionId: string, atMessageIndex?: number): Promise<string>;

  /**
   * Resume a session without replaying history.
   *
   * @param sessionId - Session ID to resume
   * @param mcpServers - MCP servers to connect
   * @returns Resumed session
   */
  resumeSession(sessionId: string, mcpServers?: McpServerConfig[]): Promise<Session>;

  // ==========================================================================
  // Terminal Operations (if supported)
  // ==========================================================================

  /**
   * Check if terminal operations are supported.
   */
  supportsTerminal(): boolean;

  /**
   * Create a new terminal and execute a command.
   *
   * @param command - Command to execute
   * @param options - Terminal options
   * @returns Terminal handle
   */
  createTerminal(command: string, options?: CreateTerminalOptions): Promise<ITerminalHandle>;

  // ==========================================================================
  // Connection Events
  // ==========================================================================

  /**
   * AbortSignal that aborts when the connection closes.
   *
   * Can be used to:
   * - Listen for connection closure
   * - Check connection status
   * - Pass to other APIs for automatic cancellation
   */
  readonly signal: AbortSignal;

  /**
   * Promise that resolves when the connection closes.
   */
  readonly closed: Promise<void>;
}

/**
 * Options for sendMessage
 */
export interface SendMessageOptions {
  /**
   * Additional content to include in the prompt
   */
  additionalContent?: PromptContent[];

  /**
   * Command to execute (e.g., "/commit", "/review")
   */
  command?: string;
}

/**
 * Options for createTerminal
 */
export interface CreateTerminalOptions {
  /**
   * Command arguments
   */
  args?: string[];

  /**
   * Working directory
   */
  cwd?: string;

  /**
   * Environment variables
   */
  env?: Record<string, string>;
}

/**
 * Terminal handle for controlling and monitoring terminals
 */
export interface ITerminalHandle {
  /**
   * Terminal ID
   */
  readonly id: string;

  /**
   * Get current output without waiting for exit.
   */
  getOutput(): Promise<TerminalOutputResult>;

  /**
   * Wait for the command to exit.
   */
  waitForExit(): Promise<WaitForTerminalExitResult>;

  /**
   * Kill the command without releasing the terminal.
   */
  kill(): Promise<void>;

  /**
   * Release the terminal and free resources.
   *
   * If the command is still running, it will be killed.
   */
  release(): Promise<void>;
}

/**
 * Factory function type for creating ACP clients
 * This enables DI - tests can swap implementations
 */
export type AcpClientFactory = (config?: AcpClientConfig) => IAcpClient;

/**
 * Client capabilities that can be queried
 */
export interface AcpClientCapabilities {
  /** Supports file read operations */
  fileRead: boolean;
  /** Supports file write operations */
  fileWrite: boolean;
  /** Supports terminal execution */
  terminal: boolean;
  /** Supports MCP servers */
  mcpServers: boolean;
  /** Supports thinking/reasoning display */
  thinking: boolean;
  /** Supports session modes */
  sessionModes: boolean;
  /** Supports session load */
  sessionLoad: boolean;
  /** Supports session fork */
  sessionFork: boolean;
  /** Supports session resume */
  sessionResume: boolean;
  /** Supports session list */
  sessionList: boolean;
  /** Supports model selection */
  modelSelection: boolean;
  /** Supports config options */
  configOptions: boolean;
}
