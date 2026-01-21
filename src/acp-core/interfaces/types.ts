/**
 * ACP Core Types
 *
 * Version: 1.1.0 (aligned with @agentclientprotocol/sdk 0.13.0)
 *
 * These types define the contract for ACP implementations.
 * Any implementation (Zed, Native, etc.) must adhere to these types.
 *
 * @see https://agentclientprotocol.com/protocol/overview
 */

// ============================================================================
// Protocol Constants
// ============================================================================

export const PROTOCOL_VERSION = 1;

// ============================================================================
// Initialization Types
// ============================================================================

export interface InitializeParams {
  /** Protocol version the client supports */
  protocolVersion: number;
  /** Client capabilities */
  clientCapabilities: ClientCapabilities;
  /** Client implementation info */
  clientInfo?: Implementation;
}

export interface InitializeResult {
  /** Protocol version the agent will use */
  protocolVersion: number;
  /** Agent capabilities */
  agentCapabilities: AgentCapabilities;
  /** Agent implementation info */
  agentInfo?: Implementation;
  /** Available authentication methods */
  authMethods?: AuthMethod[];
}

export interface Implementation {
  name: string;
  version?: string;
}

export interface ClientCapabilities {
  /** File system capabilities */
  fs?: FileSystemCapability;
  /** Terminal support */
  terminal?: boolean;
}

export interface FileSystemCapability {
  /** Can read text files */
  readTextFile?: boolean;
  /** Can write text files */
  writeTextFile?: boolean;
}

export interface AgentCapabilities {
  /** Supports session/load */
  loadSession?: boolean;
  /** MCP capabilities */
  mcpCapabilities?: McpCapabilities;
  /** Prompt capabilities */
  promptCapabilities?: PromptCapabilities;
  /** Session capabilities */
  sessionCapabilities?: SessionCapabilities;
}

export interface McpCapabilities {
  /** Supports MCP servers */
  servers?: boolean;
}

export interface PromptCapabilities {
  /** Supported content types in prompts */
  contentTypes?: ContentType[];
  /** Supports streaming */
  streaming?: boolean;
}

export interface SessionCapabilities {
  /** Supports session modes */
  modes?: boolean;
  /** Supports session fork */
  fork?: boolean;
  /** Supports session resume */
  resume?: boolean;
  /** Supports session list */
  list?: boolean;
  /** Supports config options */
  configOptions?: boolean;
  /** Supports model selection */
  modelSelection?: boolean;
}

export type ContentType = "text" | "image" | "audio" | "resource_link" | "resource";

// ============================================================================
// Authentication Types
// ============================================================================

export interface AuthMethod {
  id: string;
  name: string;
  description?: string;
}

export interface AuthenticateParams {
  methodId: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- ACP protocol: empty response on success
export interface AuthenticateResult {}

// ============================================================================
// Session Types
// ============================================================================

export interface SessionConfig {
  /** Working directory for the session */
  cwd: string;
  /** Optional API key (falls back to env) */
  apiKey?: string;
  /** Optional MCP servers to enable */
  mcpServers?: McpServerConfig[];
  /** Optional path to ACP binary (for native client) */
  binaryPath?: string;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface NewSessionParams {
  /** Working directory */
  cwd: string;
  /** MCP servers to connect */
  mcpServers?: McpServerConfig[];
}

export interface NewSessionResult {
  /** Unique session ID */
  sessionId: string;
  /** Available session modes */
  availableModes?: SessionMode[];
  /** Current mode */
  currentMode?: SessionModeState;
  /** Available models */
  availableModels?: ModelInfo[];
  /** Current model */
  currentModel?: SessionModelState;
  /** Configuration options */
  configOptions?: SessionConfigOption[];
  /** Session info */
  sessionInfo?: SessionInfo;
}

export interface Session {
  /** Unique session identifier */
  id: string;
  /** Working directory */
  cwd: string;
  /** Session creation timestamp */
  createdAt: Date;
  /** Whether session is active */
  isActive: boolean;
  /** Current mode */
  currentMode?: SessionModeState;
  /** Available modes */
  availableModes?: SessionMode[];
  /** Session info */
  info?: SessionInfo;
}

export interface SessionInfo {
  /** Session title */
  title?: string;
  /** Last update time */
  lastUpdated?: Date;
}

// ============================================================================
// Session Mode Types
// ============================================================================

export interface SessionMode {
  /** Mode ID (e.g., "ask", "code", "architect") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description?: string;
}

export interface SessionModeState {
  /** Current mode ID */
  modeId: string;
}

export interface SetSessionModeParams {
  sessionId: string;
  modeId: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- ACP protocol: empty response on success
export interface SetSessionModeResult {}

// ============================================================================
// Session Model Types (Experimental)
// ============================================================================

export interface ModelInfo {
  /** Model ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description?: string;
}

export interface SessionModelState {
  /** Current model ID */
  modelId: string;
}

export interface SetSessionModelParams {
  sessionId: string;
  modelId: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- ACP protocol: empty response on success
export interface SetSessionModelResult {}

// ============================================================================
// Session Config Types (Experimental)
// ============================================================================

export interface SessionConfigOption {
  /** Option ID */
  id: string;
  /** Category */
  category?: SessionConfigCategory;
  /** Human-readable name */
  name: string;
  /** Current value */
  currentValue?: string;
  /** Available options */
  options?: SessionConfigSelectOption[];
}

export type SessionConfigCategory = "mode" | "model" | "thought_level" | "other";

export interface SessionConfigSelectOption {
  /** Option value ID */
  id: string;
  /** Human-readable label */
  label: string;
  /** Description */
  description?: string;
}

export interface SetSessionConfigParams {
  sessionId: string;
  configId: string;
  valueId: string;
}

export interface SetSessionConfigResult {
  /** Updated config options */
  configOptions: SessionConfigOption[];
}

// ============================================================================
// Session List/Load/Fork/Resume Types (Experimental)
// ============================================================================

export interface ListSessionsParams {
  /** Filter by working directory */
  cwd?: string;
  /** Pagination cursor */
  cursor?: string;
  /** Max results */
  limit?: number;
}

export interface ListSessionsResult {
  /** List of sessions */
  sessions: SessionListItem[];
  /** Next page cursor */
  nextCursor?: string;
}

export interface SessionListItem {
  sessionId: string;
  cwd: string;
  title?: string;
  lastUpdated?: Date;
}

export interface LoadSessionParams {
  /** Session ID to load */
  sessionId: string;
  /** MCP servers to connect */
  mcpServers?: McpServerConfig[];
}

export type LoadSessionResult = NewSessionResult;

export interface ForkSessionParams {
  /** Session ID to fork */
  sessionId: string;
  /** Optional: fork at specific message index */
  atMessageIndex?: number;
}

export interface ForkSessionResult {
  /** New forked session ID */
  sessionId: string;
}

export interface ResumeSessionParams {
  /** Session ID to resume */
  sessionId: string;
  /** MCP servers to connect */
  mcpServers?: McpServerConfig[];
}

export type ResumeSessionResult = NewSessionResult;

// ============================================================================
// Prompt Types
// ============================================================================

export interface PromptParams {
  /** Session ID */
  sessionId: string;
  /** User prompt content */
  prompt: PromptContent[];
  /** Optional: command to execute */
  command?: string;
}

export type PromptContent =
  | TextPromptContent
  | ImagePromptContent
  | AudioPromptContent
  | ResourcePromptContent;

export interface TextPromptContent {
  type: "text";
  text: string;
}

export interface ImagePromptContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface AudioPromptContent {
  type: "audio";
  data: string;
  mimeType: string;
}

export interface ResourcePromptContent {
  type: "resource";
  uri: string;
  mimeType?: string;
  text?: string;
}

export interface PromptResult {
  /** Why the turn ended */
  stopReason: StopReason;
}

export type StopReason =
  | "end_turn"
  | "tool_use"
  | "max_tokens"
  | "max_turn_requests"
  | "refusal"
  | "cancelled";

// ============================================================================
// Cancel Types
// ============================================================================

export interface CancelParams {
  sessionId: string;
}

// ============================================================================
// Session Update / Stream Event Types
// ============================================================================

export type SessionUpdate =
  | UserMessageChunkUpdate
  | AgentMessageChunkUpdate
  | AgentThoughtChunkUpdate
  | ToolCallUpdate
  | ToolCallUpdateUpdate
  | PlanUpdate
  | AvailableCommandsUpdate
  | CurrentModeUpdate
  | ConfigOptionUpdate
  | SessionInfoUpdate;

export interface UserMessageChunkUpdate {
  sessionUpdate: "user_message_chunk";
  content: ContentBlock;
}

export interface AgentMessageChunkUpdate {
  sessionUpdate: "agent_message_chunk";
  content: ContentBlock;
}

export interface AgentThoughtChunkUpdate {
  sessionUpdate: "agent_thought_chunk";
  content: ContentBlock;
}

export interface ToolCallUpdate {
  sessionUpdate: "tool_call";
  toolCallId: string;
  title: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  locations?: ToolCallLocation[];
  content?: ToolCallContent[];
}

export interface ToolCallUpdateUpdate {
  sessionUpdate: "tool_call_update";
  toolCallId: string;
  title?: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  locations?: ToolCallLocation[];
  content?: ToolCallContent[];
}

export interface PlanUpdate {
  sessionUpdate: "plan";
  entries: PlanEntry[];
}

export interface PlanEntry {
  id: string;
  title: string;
  status: PlanEntryStatus;
  priority?: PlanEntryPriority;
}

export type PlanEntryStatus = "pending" | "in_progress" | "completed";
export type PlanEntryPriority = "high" | "medium" | "low";

export interface AvailableCommandsUpdate {
  sessionUpdate: "available_commands_update";
  availableCommands: AvailableCommand[];
}

export interface AvailableCommand {
  name: string;
  description: string;
  input?: CommandInput;
}

export interface CommandInput {
  hint: string;
}

export interface CurrentModeUpdate {
  sessionUpdate: "current_mode_update";
  currentMode: SessionModeState;
}

export interface ConfigOptionUpdate {
  sessionUpdate: "config_option_update";
  configOptions: SessionConfigOption[];
}

export interface SessionInfoUpdate {
  sessionUpdate: "session_info_update";
  sessionInfo: SessionInfo;
}

// ============================================================================
// Content Block Types
// ============================================================================

export type ContentBlock =
  | TextContentBlock
  | ImageContentBlock
  | AudioContentBlock
  | ResourceLinkContentBlock
  | EmbeddedResourceContentBlock;

export interface TextContentBlock {
  type: "text";
  text: string;
  annotations?: ContentAnnotations;
}

export interface ImageContentBlock {
  type: "image";
  data: string;
  mimeType: string;
  annotations?: ContentAnnotations;
}

export interface AudioContentBlock {
  type: "audio";
  data: string;
  mimeType: string;
  annotations?: ContentAnnotations;
}

export interface ResourceLinkContentBlock {
  type: "resource_link";
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  annotations?: ContentAnnotations;
}

export interface EmbeddedResourceContentBlock {
  type: "resource";
  resource: TextResource | BlobResource;
  annotations?: ContentAnnotations;
}

export interface TextResource {
  uri: string;
  text: string;
  mimeType?: string;
}

export interface BlobResource {
  uri: string;
  blob: string;
  mimeType?: string;
}

export interface ContentAnnotations {
  audience?: ("user" | "assistant")[];
  priority?: number;
  lastModified?: string;
}

// ============================================================================
// Tool Types
// ============================================================================

export type ToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "switch_mode"
  | "other";

export type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed";

export interface ToolCallLocation {
  path: string;
  line?: number;
}

export type ToolCallContent = ToolCallContentBlock | ToolCallDiff | ToolCallTerminal;

export interface ToolCallContentBlock {
  type: "content";
  content: ContentBlock;
}

export interface ToolCallDiff {
  type: "diff";
  path: string;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface ToolCallTerminal {
  type: "terminal";
  terminalId: string;
}

// SDK-compatible Diff type (oldText/newText format)
export interface Diff {
  type: "diff";
  path?: string;
  oldText?: string;
  newText?: string;
}

// SDK-compatible Terminal type
export interface Terminal {
  type: "terminal";
  terminalId: string;
}

// SDK-compatible Content type
export interface Content {
  type: "content";
  content: ContentBlock;
}

export interface ToolCall {
  id: string;
  name: string;
  title?: string;
  kind?: ToolKind;
  input?: Record<string, unknown>;
  status: ToolCallStatus;
  /** File paths affected by this tool */
  locations?: string[];
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

// ============================================================================
// Permission Types
// ============================================================================

export interface PermissionRequestParams {
  sessionId: string;
  toolCall: PermissionToolCall;
  options: PermissionOption[];
}

export interface PermissionToolCall {
  toolCallId: string;
  title?: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  locations?: ToolCallLocation[];
}

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: PermissionOptionKind;
}

export type PermissionOptionKind = "allow_once" | "allow_always" | "reject_once" | "reject_always";

export interface PermissionResponse {
  outcome: PermissionOutcome;
}

export type PermissionOutcome =
  | { outcome: "cancelled" }
  | { outcome: "selected"; optionId: string };

// Simplified permission types for our interface
export interface PermissionRequest {
  /** The tool call requiring permission */
  toolCall: ToolCall;
  /** Available options */
  options?: PermissionOption[];
  /** Human-readable description */
  description?: string;
  /** Risk level assessment */
  riskLevel?: "low" | "medium" | "high";
}

export type PermissionHandlerResponse =
  | { granted: true; optionId?: string }
  | { granted: false; reason?: string };

export type PermissionHandler = (request: PermissionRequest) => Promise<PermissionHandlerResponse>;

// ============================================================================
// File System Types
// ============================================================================

export interface ReadTextFileParams {
  path: string;
}

export interface ReadTextFileResult {
  content: string;
}

export interface WriteTextFileParams {
  path: string;
  content: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- ACP protocol: empty response on success
export interface WriteTextFileResult {}

export interface FileSystemHandler {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

// ============================================================================
// Terminal Types
// ============================================================================

export interface CreateTerminalParams {
  sessionId: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface CreateTerminalResult {
  terminalId: string;
}

export interface TerminalOutputParams {
  sessionId: string;
  terminalId: string;
}

export interface TerminalOutputResult {
  output: string;
  exitStatus?: TerminalExitStatus;
}

export interface TerminalExitStatus {
  code?: number;
  signal?: string;
}

export interface WaitForTerminalExitParams {
  sessionId: string;
  terminalId: string;
}

export interface WaitForTerminalExitResult {
  exitStatus: TerminalExitStatus;
}

export interface KillTerminalParams {
  sessionId: string;
  terminalId: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- ACP protocol: empty response on success
export interface KillTerminalResult {}

export interface ReleaseTerminalParams {
  sessionId: string;
  terminalId: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- ACP protocol: empty response on success
export interface ReleaseTerminalResult {}

// ============================================================================
// Stream Event Types (for our streaming interface)
// ============================================================================

export type StreamEvent =
  | MessageStartEvent
  | TextDeltaEvent
  | ThinkingDeltaEvent
  | ToolCallStartEvent
  | ToolCallDeltaEvent
  | ToolCallCompleteEvent
  | PlanEvent
  | ModeChangeEvent
  | CommandsUpdateEvent
  | SessionInfoEvent
  | MessageCompleteEvent
  | ErrorEvent;

export interface MessageStartEvent {
  type: "message_start";
  messageId: string;
}

export interface TextDeltaEvent {
  type: "text_delta";
  text: string;
}

export interface ThinkingDeltaEvent {
  type: "thinking_delta";
  text: string;
}

export interface ToolCallStartEvent {
  type: "tool_call_start";
  toolCallId: string;
  toolName: string;
  title?: string;
  kind?: ToolKind;
  locations?: ToolCallLocation[];
}

export interface ToolCallDeltaEvent {
  type: "tool_call_delta";
  toolCallId: string;
  /** Partial input JSON */
  inputDelta?: string;
  /** Status update */
  status?: ToolCallStatus;
  /** Content update */
  content?: ToolCallContent[];
}

export interface ToolCallCompleteEvent {
  type: "tool_call_complete";
  toolCallId: string;
  result?: string;
  isError?: boolean;
}

export interface PlanEvent {
  type: "plan";
  entries: PlanEntry[];
}

export interface ModeChangeEvent {
  type: "mode_change";
  mode: SessionModeState;
}

export interface CommandsUpdateEvent {
  type: "commands_update";
  commands: AvailableCommand[];
}

export interface SessionInfoEvent {
  type: "session_info";
  info: SessionInfo;
}

export interface MessageCompleteEvent {
  type: "message_complete";
  stopReason: StopReason;
}

export interface ErrorEvent {
  type: "error";
  error: Error;
  code?: number;
}

// ============================================================================
// Client Configuration
// ============================================================================

export interface AcpClientConfig {
  /** Permission handler for tool approvals */
  permissionHandler?: PermissionHandler;
  /** File system handlers (optional, for sandboxing) */
  fileSystem?: FileSystemHandler;
  /** Event callbacks */
  onEvent?: (event: StreamEvent) => void;
  /** Session update callback (raw ACP updates) */
  onSessionUpdate?: (update: SessionUpdate) => void;
  /** Connection lifecycle callbacks */
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// Error Types
// ============================================================================

export class AcpError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "AcpError";
    this.code = code;
    this.data = data;
  }

  static parseError(message?: string): AcpError {
    return new AcpError(-32700, message ?? "Parse error");
  }

  static invalidRequest(message?: string): AcpError {
    return new AcpError(-32600, message ?? "Invalid request");
  }

  static methodNotFound(method: string): AcpError {
    return new AcpError(-32601, `Method not found: ${method}`);
  }

  static invalidParams(message?: string): AcpError {
    return new AcpError(-32602, message ?? "Invalid params");
  }

  static internalError(message?: string): AcpError {
    return new AcpError(-32603, message ?? "Internal error");
  }

  static authRequired(message?: string): AcpError {
    return new AcpError(-32000, message ?? "Authentication required");
  }

  static resourceNotFound(uri?: string): AcpError {
    return new AcpError(-32002, uri ? `Resource not found: ${uri}` : "Resource not found");
  }
}
