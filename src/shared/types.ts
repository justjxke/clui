export interface UsageData {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  service_tier?: string
}

export type TabStatus = 'connecting' | 'idle' | 'running' | 'completed' | 'failed' | 'dead'

export interface ModelOption {
  id: string
  label: string
  description?: string
  isDefault?: boolean
}

export interface HotkeySetting {
  accelerator: string
}

export interface AudioTranscriptionInput {
  wavBytes: Uint8Array
}

export interface PermissionOption {
  optionId: string
  kind?: string
  label: string
}

export interface PermissionRequest {
  requestId: string
  threadId: string
  turnId: string
  itemId: string
  approvalId?: string | null
  kind: 'command' | 'fileChange' | 'permissions'
  toolTitle: string
  toolDescription?: string
  toolInput?: Record<string, unknown>
  command?: string
  cwd?: string
  options: PermissionOption[]
}

export interface Attachment {
  id: string
  type: 'image' | 'file'
  name: string
  path: string
  mimeType?: string
  dataUrl?: string
  size?: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  toolName?: string
  toolInput?: string
  toolStatus?: 'running' | 'completed' | 'error'
  timestamp: number
}

export interface RunResult {
  totalCostUsd: number
  durationMs: number
  numTurns: number
  usage: UsageData
  threadId: string
}

export interface TabState {
  id: string
  threadId: string | null
  status: TabStatus
  activeRequestId: string | null
  activeTurnId: string | null
  hasUnread: boolean
  currentActivity: string
  permissionQueue: PermissionRequest[]
  permissionDenied: { tools: Array<{ toolName: string; toolUseId: string }> } | null
  attachments: Attachment[]
  messages: Message[]
  title: string
  lastResult: RunResult | null
  sessionModel: string | null
  sessionTools: string[]
  sessionMcpServers: Array<{ name: string; status: string }>
  sessionSkills: string[]
  sessionVersion: string | null
  queuedPrompts: string[]
  workingDirectory: string
  hasChosenDirectory: boolean
  additionalDirs: string[]
}

export type AssistantContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string; input?: Record<string, unknown> }

export type NormalizedEvent =
  | {
    type: 'session_init'
    threadId: string
    model: string
    mcpServers: Array<{ name: string; status: string }>
    skills: string[]
    version: string
    cwd: string
    isWarmup?: boolean
  }
  | { type: 'text_chunk'; text: string }
  | { type: 'tool_call'; toolName: string; toolId: string; index: number; toolInput?: string }
  | { type: 'tool_call_update'; toolId: string; partialInput: string }
  | { type: 'tool_call_complete'; toolId: string; status?: 'completed' | 'error' | 'declined'; output?: string }
  | { type: 'task_update'; message: { content: AssistantContentBlock[] } }
  | {
    type: 'task_complete'
    result: string
    costUsd: number
    durationMs: number
    numTurns: number
    usage: UsageData
    threadId: string
    status: 'completed' | 'failed' | 'interrupted'
    permissionDenials?: Array<{ toolName: string; toolUseId: string }>
  }
  | { type: 'error'; message: string; isError: boolean; threadId?: string }
  | { type: 'session_dead'; exitCode: number | null; signal: string | null; stderrTail: string[] }
  | { type: 'rate_limit'; status: string; resetsAt: number; rateLimitType: string }
  | { type: 'usage'; usage: UsageData }
  | { type: 'permission_request'; request: PermissionRequest }

export interface RunOptions {
  prompt: string
  projectPath: string
  threadId?: string
  sessionId?: string
  model?: string
  addDirs?: string[]
  approvalPolicy?: 'ask' | 'auto'
}

export interface TabRegistryEntry {
  tabId: string
  threadId: string | null
  status: TabStatus
  activeRequestId: string | null
  activeTurnId: string | null
  runPid: number | null
  createdAt: number
  lastActivityAt: number
  promptCount: number
}

export interface HealthReport {
  tabs: Array<{
    tabId: string
    status: TabStatus
    activeRequestId: string | null
    threadId: string | null
    alive: boolean
  }>
  queueDepth: number
}

export interface EnrichedError {
  message: string
  stderrTail: string[]
  stdoutTail?: string[]
  exitCode: number | null
  elapsedMs: number
  toolCallCount: number
  sawPermissionRequest?: boolean
  permissionDenials?: Array<{ tool_name: string; tool_use_id: string }>
}

export interface ThreadMeta {
  threadId: string
  preview: string
  name: string | null
  updatedAt: string
  createdAt: string
  cwd: string
  status: string
}

export interface SessionMeta {
  threadId: string
  preview: string
  name: string | null
  updatedAt: string
  createdAt: string
  cwd: string
  status: string
}

export interface SessionLoadMessage {
  role: string
  content: string
  toolName?: string
  timestamp: number
}

export type PluginStatus = 'not_installed' | 'checking' | 'installing' | 'installed' | 'failed' | 'browse_only'

export interface CatalogPlugin {
  id: string
  name: string
  description: string
  version: string
  author: string
  marketplace: string
  repo: string
  sourcePath: string
  installName: string
  category: string
  tags: string[]
  isSkillMd: boolean
  kind: 'skill' | 'plugin' | 'app'
  installable: boolean
  uninstallable: boolean
  openUrl?: string | null
  path?: string | null
}

export const IPC = {
  START: 'clui:start',
  CREATE_TAB: 'clui:create-tab',
  PROMPT: 'clui:prompt',
  CANCEL: 'clui:cancel',
  STOP_TAB: 'clui:stop-tab',
  RETRY: 'clui:retry',
  STATUS: 'clui:status',
  TAB_HEALTH: 'clui:tab-health',
  CLOSE_TAB: 'clui:close-tab',
  SELECT_DIRECTORY: 'clui:select-directory',
  OPEN_EXTERNAL: 'clui:open-external',
  OPEN_IN_TERMINAL: 'clui:open-in-terminal',
  ATTACH_FILES: 'clui:attach-files',
  TAKE_SCREENSHOT: 'clui:take-screenshot',
  TRANSCRIBE_AUDIO: 'clui:transcribe-audio',
  PASTE_IMAGE: 'clui:paste-image',
  GET_DIAGNOSTICS: 'clui:get-diagnostics',
  RESPOND_PERMISSION: 'clui:respond-permission',
  INIT_SESSION: 'clui:init-session',
  RESET_TAB_SESSION: 'clui:reset-tab-session',
  ANIMATE_HEIGHT: 'clui:animate-height',
  LIST_SESSIONS: 'clui:list-sessions',
  LOAD_SESSION: 'clui:load-session',
  RESIZE_HEIGHT: 'clui:resize-height',
  SET_WINDOW_WIDTH: 'clui:set-window-width',
  HIDE_WINDOW: 'clui:hide-window',
  WINDOW_HIDE_REQUESTED: 'clui:window-hide-requested',
  WINDOW_SHOWN: 'clui:window-shown',
  SET_IGNORE_MOUSE_EVENTS: 'clui:set-ignore-mouse-events',
  IS_VISIBLE: 'clui:is-visible',
  SKILL_STATUS: 'clui:skill-status',
  GET_THEME: 'clui:get-theme',
  THEME_CHANGED: 'clui:theme-changed',
  GET_HOTKEY: 'clui:get-hotkey',
  SET_HOTKEY: 'clui:set-hotkey',
  SET_LAUNCH_ON_STARTUP: 'clui:set-launch-on-startup',
  MARKETPLACE_FETCH: 'clui:marketplace-fetch',
  MARKETPLACE_INSTALLED: 'clui:marketplace-installed',
  MARKETPLACE_INSTALL: 'clui:marketplace-install',
  MARKETPLACE_UNINSTALL: 'clui:marketplace-uninstall',
  SET_PERMISSION_MODE: 'clui:set-permission-mode',
  TEXT_CHUNK: 'clui:text-chunk',
  TOOL_CALL: 'clui:tool-call',
  TOOL_CALL_UPDATE: 'clui:tool-call-update',
  TOOL_CALL_COMPLETE: 'clui:tool-call-complete',
  TASK_UPDATE: 'clui:task-update',
  TASK_COMPLETE: 'clui:task-complete',
  SESSION_DEAD: 'clui:session-dead',
  SESSION_INIT: 'clui:session-init',
  ERROR: 'clui:error',
  RATE_LIMIT: 'clui:rate-limit',
  STREAM_EVENT: 'clui:stream-event',
  RUN_COMPLETE: 'clui:run-complete',
  RUN_ERROR: 'clui:run-error',
} as const

// Legacy Claude-only types kept so the retired implementation still typechecks
// while Codex becomes the canonical runtime.
export type ClaudeEvent = any
export type StreamEvent = any
export type InitEvent = any
export type AssistantEvent = any
export type ResultEvent = any
export type RateLimitEvent = any
export type PermissionEvent = any
export type ContentDelta = any
