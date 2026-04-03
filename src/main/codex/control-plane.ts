import { EventEmitter } from 'events'
import { log as _log } from '../logger'
import { app } from 'electron'
import { CodexAppServerClient } from './app-server-client'
import { CodexEventNormalizer } from './normalizer'
import type {
  CatalogPlugin,
  EnrichedError,
  HealthReport,
  ModelOption,
  NormalizedEvent,
  RunOptions,
  SessionLoadMessage,
  SessionMeta,
  TabRegistryEntry,
  TabStatus,
} from '../../shared/types'

function log(message: string): void {
  _log('CodexControlPlane', message)
}

type CodexThreadStatus =
  | string
  | {
    type?: string
    activeFlags?: unknown[]
  }
  | null
  | undefined

function getThreadStatusType(status: CodexThreadStatus): string {
  if (!status) return 'notLoaded'
  if (typeof status === 'string') return status
  return status.type || 'notLoaded'
}

function formatThreadStatus(status: CodexThreadStatus): string {
  const type = getThreadStatusType(status)
  if (type !== 'active') return type

  const activeFlags = Array.isArray(status?.activeFlags)
    ? status.activeFlags.filter((flag): flag is string => typeof flag === 'string')
    : []

  return activeFlags.length > 0 ? `active:${activeFlags.join(',')}` : 'active'
}

function formatModelLabel(model: { id?: string; displayName?: string }): string {
  const rawLabel = typeof model.id === 'string' && model.id.length > 0
    ? model.id
    : model.displayName || ''

  return rawLabel.toLowerCase()
}

type PendingApproval = {
  method: string
  params: any
}

export class ControlPlane extends EventEmitter {
  private tabs = new Map<string, TabRegistryEntry>()
  private client = new CodexAppServerClient()
  private normalizer = new CodexEventNormalizer()
  private permissionMode: 'ask' | 'auto' = 'ask'
  private latestModels: ModelOption[] = []
  private latestSkills: string[] = []
  private latestMcpServers: Array<{ name: string; status: string }> = []
  private pendingApprovals = new Map<string, PendingApproval>()
  private loadedThreads = new Set<string>()

  constructor() {
    super()

    this.client.on('notification', (message: any) => {
      this.handleNotification(message.method, message.params)
    })

    this.client.on('request', (message: any) => {
      this.handleServerRequest(message.id, message.method, message.params)
    })

    this.client.on('disconnect', (info: { code: number | null; signal: string | null; stderrTail: string[] }) => {
      for (const tab of this.tabs.values()) {
        this.emit('event', tab.tabId, {
          type: 'session_dead',
          exitCode: info.code,
          signal: info.signal,
          stderrTail: info.stderrTail,
        } satisfies NormalizedEvent)
        this.setTabStatus(tab.tabId, 'dead')
      }
    })
  }

  createTab(): string {
    const tabId = crypto.randomUUID()
    const now = Date.now()
    this.tabs.set(tabId, {
      tabId,
      threadId: null,
      status: 'idle',
      activeRequestId: null,
      activeTurnId: null,
      runPid: null,
      createdAt: now,
      lastActivityAt: now,
      promptCount: 0,
    })
    return tabId
  }

  initSession(_tabId: string): void {}

  resetTabSession(tabId: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    tab.threadId = null
    tab.activeTurnId = null
  }

  async getStartupInfo(): Promise<{
    version: string
    auth: { email?: string; subscriptionType?: string; authMethod?: string }
    mcpServers: string[]
    models: ModelOption[]
    skills: string[]
    projectPath: string
    homePath: string
    permissionMode: 'ask' | 'auto'
    launchOnStartup: boolean
  }> {
    await this.client.start()

    const [modelsResponse, skillsResponse, mcpStatusResponse] = await Promise.allSettled([
      this.client.request<any>('model/list', { includeHidden: false }),
      this.client.request<any>('skills/list', { cwds: [process.cwd()] }),
      this.client.request<any>('mcpServerStatus/list', { limit: 100 }),
    ])

    this.latestModels = modelsResponse.status === 'fulfilled'
      ? (modelsResponse.value.data || []).map((model: any) => ({
          id: model.id,
          label: formatModelLabel(model),
          description: model.description || undefined,
          isDefault: !!model.isDefault,
        }))
      : []

    this.latestSkills = skillsResponse.status === 'fulfilled'
      ? (skillsResponse.value.data || []).flatMap((entry: any) => (entry.skills || []).map((skill: any) => skill.name))
      : []

    this.latestMcpServers = mcpStatusResponse.status === 'fulfilled'
      ? (mcpStatusResponse.value.data || []).map((server: any) => ({
          name: server.name,
          status: server.authStatus || (server.connected ? 'connected' : 'configured'),
        }))
      : []

    return {
      version: app.getVersion(),
      auth: {},
      mcpServers: this.latestMcpServers.map((server) => `${server.name} (${server.status})`),
      models: this.latestModels,
      skills: this.latestSkills,
      projectPath: process.cwd(),
      homePath: require('os').homedir(),
      permissionMode: this.permissionMode,
      launchOnStartup: app.getLoginItemSettings().openAtLogin,
    }
  }

  setPermissionMode(mode: 'ask' | 'auto'): void {
    this.permissionMode = mode
  }

  async submitPrompt(tabId: string, requestId: string, options: RunOptions): Promise<void> {
    const tab = this.tabs.get(tabId)
    if (!tab) throw new Error(`Unknown tab ${tabId}`)

    tab.activeRequestId = requestId
    tab.promptCount += 1
    tab.lastActivityAt = Date.now()
    this.setTabStatus(tabId, 'connecting')

    await this.client.start()

    const ensured = await this.ensureThread(tab, options)
    tab.threadId = ensured.thread.id
    this.loadedThreads.add(tab.threadId)
    this.emit('event', tabId, this.normalizer.createSessionInitEvent(ensured.thread, {
      model: ensured.model,
      cwd: ensured.cwd,
      skills: this.latestSkills,
      version: app.getVersion(),
      mcpServers: this.latestMcpServers,
    }))

    const turn = await this.client.request<any>('turn/start', {
      threadId: tab.threadId,
      input: [{
        type: 'text',
        text: options.prompt,
        text_elements: [],
      }],
      cwd: options.projectPath,
      model: options.model || undefined,
      approvalPolicy: this.permissionMode === 'auto' ? 'never' : 'untrusted',
      sandboxPolicy: this.permissionMode === 'auto'
        ? { type: 'dangerFullAccess' }
        : {
            type: 'workspaceWrite',
            writableRoots: [options.projectPath, ...(options.addDirs || [])],
            networkAccess: true,
            readOnlyAccess: { type: 'fullAccess' },
            excludeTmpdirEnvVar: false,
            excludeSlashTmp: false,
          },
    })

    tab.activeTurnId = turn.turn.id
    this.setTabStatus(tabId, 'running')
  }

  async retry(tabId: string, requestId: string, options: RunOptions): Promise<void> {
    return this.submitPrompt(tabId, requestId, options)
  }

  async cancel(requestId: string): Promise<boolean> {
    const tab = [...this.tabs.values()].find((entry) => entry.activeRequestId === requestId)
    if (!tab?.threadId || !tab.activeTurnId) return false
    await this.client.request('turn/interrupt', { threadId: tab.threadId, turnId: tab.activeTurnId })
    return true
  }

  async cancelTab(tabId: string): Promise<boolean> {
    const tab = this.tabs.get(tabId)
    if (!tab?.threadId || !tab.activeTurnId) return false
    await this.client.request('turn/interrupt', { threadId: tab.threadId, turnId: tab.activeTurnId })
    return true
  }

  closeTab(tabId: string): void {
    const tab = this.tabs.get(tabId)
    this.tabs.delete(tabId)
    if (tab?.threadId && this.loadedThreads.has(tab.threadId)) {
      this.client.request('thread/unsubscribe', { threadId: tab.threadId }).catch(() => {})
      this.loadedThreads.delete(tab.threadId)
    }
  }

  getHealth(): HealthReport {
    return {
      tabs: [...this.tabs.values()].map((tab) => ({
        tabId: tab.tabId,
        status: tab.status,
        activeRequestId: tab.activeRequestId,
        threadId: tab.threadId,
        alive: tab.status !== 'dead',
      })),
      queueDepth: 0,
    }
  }

  async respondToPermission(_tabId: string, questionId: string, optionId: string): Promise<boolean> {
    const pending = this.pendingApprovals.get(questionId)
    if (!pending) return false

    if (pending.method === 'item/permissions/requestApproval') {
      const permissions = optionId === 'decline' ? {} : pending.params.permissions
      await this.client.respond(questionId, {
        permissions,
        scope: optionId === 'acceptForSession' ? 'session' : 'turn',
      })
    } else {
      await this.client.respond(questionId, { decision: optionId })
    }
    this.pendingApprovals.delete(questionId)
    return true
  }

  async listSessions(projectPath?: string): Promise<SessionMeta[]> {
    await this.client.start()
    const response = await this.client.request<any>('thread/list', {
      cwd: projectPath || process.cwd(),
      limit: 50,
      sortKey: 'updated_at',
    })
    return (response.data || []).map((thread: any) => ({
      threadId: thread.id,
      preview: thread.preview || '',
      name: thread.name || null,
      updatedAt: new Date((thread.updatedAt || thread.createdAt) * 1000).toISOString(),
      createdAt: new Date(thread.createdAt * 1000).toISOString(),
      cwd: thread.cwd || projectPath || process.cwd(),
      status: formatThreadStatus(thread.status),
    }))
  }

  async loadSession(threadId: string): Promise<SessionLoadMessage[]> {
    await this.client.start()
    const response = await this.client.request<any>('thread/read', {
      threadId,
      includeTurns: true,
    })
    return this.normalizer.historyFromThread(response.thread)
  }

  async fetchMarketplace(forceRefresh = false, cwd = process.cwd()): Promise<{ plugins: CatalogPlugin[]; error: string | null }> {
    await this.client.start()
    const [skillsResult, pluginsResult, appsResult] = await Promise.allSettled([
      this.client.request<any>('skills/list', { cwds: [cwd], forceReload: forceRefresh }),
      this.client.request<any>('plugin/list', {}),
      this.client.request<any>('app/list', { forceRefetch: forceRefresh }),
    ])

    const plugins = this.normalizer.catalogFromMarketplace({
      skills: skillsResult.status === 'fulfilled'
        ? (skillsResult.value.data || []).flatMap((entry: any) => entry.skills || [])
        : [],
      plugins: pluginsResult.status === 'fulfilled'
        ? pluginsResult.value.marketplaces || []
        : [],
      apps: appsResult.status === 'fulfilled'
        ? appsResult.value.data || []
        : [],
    })

    const error = [skillsResult, pluginsResult, appsResult]
      .find((result) => result.status === 'rejected')
    return {
      plugins,
      error: error && error.status === 'rejected' ? error.reason?.message || String(error.reason) : null,
    }
  }

  async listInstalledPlugins(): Promise<string[]> {
    const catalog = await this.fetchMarketplace(false, process.cwd())
    return catalog.plugins.filter((plugin) => !plugin.installable).map((plugin) => plugin.installName)
  }

  private async ensureThread(tab: TabRegistryEntry, options: RunOptions): Promise<any> {
    if (tab.threadId) {
      return this.client.request('thread/resume', {
        threadId: tab.threadId,
        cwd: options.projectPath,
        model: options.model || undefined,
      })
    }

    return this.client.request('thread/start', {
      cwd: options.projectPath,
      model: options.model || undefined,
      approvalPolicy: this.permissionMode === 'auto' ? 'never' : 'untrusted',
      sandbox: 'workspace-write',
      persistExtendedHistory: true,
    })
  }

  private handleNotification(method: string, params: any): void {
    if (method === 'thread/status/changed') {
      const tabId = this.findTabIdByThreadId(params.threadId)
      if (!tabId) return
      const nextStatus = this.mapThreadStatus(params.status)
      this.setTabStatus(tabId, nextStatus)
      return
    }

    if (method === 'turn/started') {
      const tabId = this.findTabIdByThreadId(params.turn?.threadId || params.threadId)
      if (!tabId) return
      const tab = this.tabs.get(tabId)
      if (!tab) return
      tab.activeTurnId = params.turn.id
      this.setTabStatus(tabId, 'running')
      return
    }

    const tabId = this.findTabIdByThreadId(params?.threadId)
    if (!tabId) return
    const events = this.normalizer.normalizeNotification(method, params)
    for (const event of events) {
      this.emit('event', tabId, event)
      if (event.type === 'task_complete') {
        const tab = this.tabs.get(tabId)
        if (tab) {
          tab.activeRequestId = null
          tab.activeTurnId = null
        }
        this.setTabStatus(tabId, event.status === 'failed' ? 'failed' : 'completed')
      }
    }
  }

  private handleServerRequest(id: number | string, method: string, params: any): void {
    const event = this.normalizer.normalizeServerRequest(method, id, params)
    if (!event) {
      this.client.respondError(id, -32601, `Unsupported server request: ${method}`).catch(() => {})
      return
    }

    this.pendingApprovals.set(String(id), { method, params })
    const tabId = this.findTabIdByThreadId(params.threadId)
    if (!tabId) {
      this.client.respondError(id, -32000, 'No active tab for approval request').catch(() => {})
      return
    }
    this.emit('event', tabId, event)
  }

  private findTabIdByThreadId(threadId?: string | null): string | null {
    if (!threadId) return null
    for (const [tabId, tab] of this.tabs) {
      if (tab.threadId === threadId) return tabId
    }
    return null
  }

  private setTabStatus(tabId: string, status: TabStatus): void {
    const tab = this.tabs.get(tabId)
    if (!tab || tab.status === status) return
    const previous = tab.status
    tab.status = status
    tab.lastActivityAt = Date.now()
    this.emit('tab-status-change', tabId, status, previous)
  }

  private mapThreadStatus(status: CodexThreadStatus): TabStatus {
    switch (getThreadStatusType(status)) {
      case 'active':
      case 'inProgress':
      case 'running':
        return 'running'
      case 'failed':
      case 'systemError':
        return 'failed'
      case 'completed':
        return 'completed'
      case 'notLoaded':
      case 'idle':
      default:
        return 'idle'
    }
  }

  getEnrichedError(message: string): EnrichedError {
    return {
      message,
      stderrTail: this.client.getStderrTail(),
      exitCode: null,
      elapsedMs: 0,
      toolCallCount: 0,
    }
  }

  shutdown(): void {}
}
