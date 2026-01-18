/**
 * ACP Core Interfaces
 *
 * Version: 1.1.0 (aligned with @agentclientprotocol/sdk 0.13.0)
 *
 * Public API for the acp-core package.
 * All implementations must adhere to these interfaces.
 */

// Protocol Constants
export { PROTOCOL_VERSION, AcpError } from "./types";

// Types
export type {
  // Initialization
  InitializeParams,
  InitializeResult,
  Implementation,
  ClientCapabilities,
  FileSystemCapability,
  AgentCapabilities,
  McpCapabilities,
  PromptCapabilities,
  SessionCapabilities,
  ContentType,

  // Authentication
  AuthMethod,
  AuthenticateParams,
  AuthenticateResult,

  // Session
  Session,
  SessionConfig,
  McpServerConfig,
  NewSessionParams,
  NewSessionResult,
  SessionInfo,

  // Session Modes
  SessionMode,
  SessionModeState,
  SetSessionModeParams,
  SetSessionModeResult,

  // Session Models (Experimental)
  ModelInfo,
  SessionModelState,
  SetSessionModelParams,
  SetSessionModelResult,

  // Session Config (Experimental)
  SessionConfigOption,
  SessionConfigCategory,
  SessionConfigSelectOption,
  SetSessionConfigParams,
  SetSessionConfigResult,

  // Session List/Load/Fork/Resume (Experimental)
  ListSessionsParams,
  ListSessionsResult,
  SessionListItem,
  LoadSessionParams,
  LoadSessionResult,
  ForkSessionParams,
  ForkSessionResult,
  ResumeSessionParams,
  ResumeSessionResult,

  // Prompt
  PromptParams,
  PromptContent,
  TextPromptContent,
  ImagePromptContent,
  AudioPromptContent,
  ResourcePromptContent,
  PromptResult,
  StopReason,

  // Cancel
  CancelParams,

  // Session Updates
  SessionUpdate,
  UserMessageChunkUpdate,
  AgentMessageChunkUpdate,
  AgentThoughtChunkUpdate,
  ToolCallUpdate,
  ToolCallUpdateUpdate,
  PlanUpdate,
  PlanEntry,
  PlanEntryStatus,
  PlanEntryPriority,
  AvailableCommandsUpdate,
  AvailableCommand,
  CommandInput,
  CurrentModeUpdate,
  ConfigOptionUpdate,
  SessionInfoUpdate,

  // Content Blocks
  ContentBlock,
  TextContentBlock,
  ImageContentBlock,
  AudioContentBlock,
  ResourceLinkContentBlock,
  EmbeddedResourceContentBlock,
  TextResource,
  BlobResource,
  ContentAnnotations,

  // Tools
  ToolKind,
  ToolCallStatus,
  ToolCallLocation,
  ToolCallContent,
  ToolCallContentBlock,
  ToolCallDiff,
  DiffHunk,
  ToolCallTerminal,
  Diff,
  Terminal,
  Content,
  ToolCall,
  ToolResult,

  // Permissions
  PermissionRequestParams,
  PermissionToolCall,
  PermissionOption,
  PermissionOptionKind,
  PermissionResponse,
  PermissionOutcome,
  PermissionRequest,
  PermissionHandlerResponse,
  PermissionHandler,

  // File System
  ReadTextFileParams,
  ReadTextFileResult,
  WriteTextFileParams,
  WriteTextFileResult,
  FileSystemHandler,

  // Terminal
  CreateTerminalParams,
  CreateTerminalResult,
  TerminalOutputParams,
  TerminalOutputResult,
  TerminalExitStatus,
  WaitForTerminalExitParams,
  WaitForTerminalExitResult,
  KillTerminalParams,
  KillTerminalResult,
  ReleaseTerminalParams,
  ReleaseTerminalResult,

  // Stream Events
  StreamEvent,
  MessageStartEvent,
  TextDeltaEvent,
  ThinkingDeltaEvent,
  ToolCallStartEvent,
  ToolCallDeltaEvent,
  ToolCallCompleteEvent,
  PlanEvent,
  ModeChangeEvent,
  CommandsUpdateEvent,
  SessionInfoEvent,
  MessageCompleteEvent,
  ErrorEvent,

  // Client Config
  AcpClientConfig,
} from "./types";

// Client Interface
export type {
  IAcpClient,
  ITerminalHandle,
  AcpClientFactory,
  AcpClientCapabilities,
  SendMessageOptions,
  CreateTerminalOptions,
} from "./client";
