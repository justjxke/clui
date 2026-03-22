import type { CatalogPlugin, NormalizedEvent, PermissionOption, PermissionRequest, SessionLoadMessage } from '../../shared/types'

const DEFAULT_COMMAND_OPTIONS: PermissionOption[] = [
  { optionId: 'accept', label: 'Allow once', kind: 'accept' },
  { optionId: 'acceptForSession', label: 'Allow for session', kind: 'acceptForSession' },
  { optionId: 'decline', label: 'Decline', kind: 'decline' },
]

const DEFAULT_FILE_OPTIONS: PermissionOption[] = [
  { optionId: 'accept', label: 'Allow once', kind: 'accept' },
  { optionId: 'acceptForSession', label: 'Allow for session', kind: 'acceptForSession' },
  { optionId: 'decline', label: 'Decline', kind: 'decline' },
]

const DEFAULT_PERMISSIONS_OPTIONS: PermissionOption[] = [
  { optionId: 'accept', label: 'Grant for turn', kind: 'accept' },
  { optionId: 'acceptForSession', label: 'Grant for session', kind: 'acceptForSession' },
  { optionId: 'decline', label: 'Decline', kind: 'decline' },
]

function stringifyJson(value: unknown): string | undefined {
  if (value == null) return undefined
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getToolNameFromItem(item: any): string {
  switch (item?.type) {
    case 'commandExecution':
      return 'Shell command'
    case 'fileChange':
      return 'File change'
    case 'mcpToolCall':
      return item.tool ? `MCP: ${item.tool}` : 'MCP tool'
    case 'dynamicToolCall':
      return item.tool || 'Tool call'
    case 'webSearch':
      return 'Web search'
    default:
      return item?.type || 'Tool'
  }
}

function getToolInputFromItem(item: any): string | undefined {
  switch (item?.type) {
    case 'commandExecution':
      return item.command || undefined
    case 'fileChange':
      return item.changes?.map((change: any) => change.path || change.filePath || 'file').join('\n') || undefined
    case 'mcpToolCall':
    case 'dynamicToolCall':
      return stringifyJson(item.arguments)
    case 'webSearch':
      return item.query || undefined
    default:
      return undefined
  }
}

function availableDecisionsToOptions(values: any[] | null | undefined, fallback: PermissionOption[]): PermissionOption[] {
  if (!values || values.length === 0) return fallback
  return values.map((value) => {
    if (typeof value === 'string') {
      if (value === 'accept') return { optionId: value, label: 'Allow once', kind: value }
      if (value === 'acceptForSession') return { optionId: value, label: 'Allow for session', kind: value }
      if (value === 'decline') return { optionId: value, label: 'Decline', kind: value }
      if (value === 'cancel') return { optionId: value, label: 'Cancel', kind: value }
      return { optionId: value, label: value, kind: value }
    }
    return { optionId: JSON.stringify(value), label: 'Allow', kind: 'accept' }
  })
}

export class CodexEventNormalizer {
  private assistantTextByTurn = new Map<string, string>()

  createSessionInitEvent(thread: any, metadata: { model: string; cwd: string; skills: string[]; version: string; mcpServers?: Array<{ name: string; status: string }> }): NormalizedEvent {
    return {
      type: 'session_init',
      threadId: thread.id,
      model: metadata.model,
      mcpServers: metadata.mcpServers || [],
      skills: metadata.skills,
      version: metadata.version,
      cwd: metadata.cwd,
    }
  }

  normalizeNotification(method: string, params: any): NormalizedEvent[] {
    switch (method) {
      case 'item/started':
        return this.normalizeItemStarted(params)
      case 'item/completed':
        return this.normalizeItemCompleted(params)
      case 'item/agentMessage/delta':
        return this.normalizeAgentMessageDelta(params)
      case 'item/commandExecution/outputDelta':
        return this.normalizeCommandOutputDelta(params)
      case 'turn/completed':
        return this.normalizeTurnCompleted(params)
      default:
        return []
    }
  }

  normalizeServerRequest(method: string, id: number | string, params: any): NormalizedEvent | null {
    if (method === 'item/commandExecution/requestApproval') {
      const request: PermissionRequest = {
        requestId: String(id),
        threadId: params.threadId,
        turnId: params.turnId,
        itemId: params.itemId,
        approvalId: params.approvalId ?? null,
        kind: 'command',
        toolTitle: 'Shell command',
        toolDescription: params.reason || undefined,
        command: params.command || undefined,
        cwd: params.cwd || undefined,
        toolInput: params.command ? { command: params.command, cwd: params.cwd } : undefined,
        options: availableDecisionsToOptions(params.availableDecisions, DEFAULT_COMMAND_OPTIONS),
      }
      return { type: 'permission_request', request }
    }

    if (method === 'item/fileChange/requestApproval') {
      const request: PermissionRequest = {
        requestId: String(id),
        threadId: params.threadId,
        turnId: params.turnId,
        itemId: params.itemId,
        kind: 'fileChange',
        toolTitle: 'File change',
        toolDescription: params.reason || undefined,
        toolInput: params.grantRoot ? { grantRoot: params.grantRoot } : undefined,
        options: DEFAULT_FILE_OPTIONS,
      }
      return { type: 'permission_request', request }
    }

    if (method === 'item/permissions/requestApproval') {
      const request: PermissionRequest = {
        requestId: String(id),
        threadId: params.threadId,
        turnId: params.turnId,
        itemId: params.itemId,
        kind: 'permissions',
        toolTitle: 'Permission grant',
        toolDescription: params.reason || undefined,
        toolInput: params.permissions || undefined,
        options: DEFAULT_PERMISSIONS_OPTIONS,
      }
      return { type: 'permission_request', request }
    }

    return null
  }

  historyFromThread(thread: any): SessionLoadMessage[] {
    const messages: SessionLoadMessage[] = []
    for (const turn of thread.turns || []) {
      for (const item of turn.items || []) {
        const timestamp = Math.round((thread.updatedAt || thread.createdAt || Date.now() / 1000) * 1000)
        if (item.type === 'userMessage') {
          const content = (item.content || [])
            .map((entry: any) => {
              if (entry.type === 'text') return entry.text
              if (entry.type === 'localImage') return `[Image: ${entry.path}]`
              if (entry.type === 'image') return `[Image: ${entry.url}]`
              if (entry.type === 'skill') return `[Skill: ${entry.name}]`
              if (entry.type === 'mention') return `[Mention: ${entry.name}]`
              return ''
            })
            .filter(Boolean)
            .join('\n')
          if (content) messages.push({ role: 'user', content, timestamp })
          continue
        }

        if (item.type === 'agentMessage' && item.text) {
          messages.push({ role: 'assistant', content: item.text, timestamp })
          continue
        }

        if (['commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'webSearch'].includes(item.type)) {
          messages.push({
            role: 'tool',
            content: '',
            toolName: getToolNameFromItem(item),
            timestamp,
          })
        }
      }
    }
    return messages
  }

  catalogFromMarketplace(payload: {
    skills?: any[]
    plugins?: any[]
    apps?: any[]
  }): CatalogPlugin[] {
    const catalog: CatalogPlugin[] = []

    for (const skill of payload.skills || []) {
      catalog.push({
        id: `skill:${skill.path || skill.name}`,
        name: skill.name,
        description: skill.description || skill.shortDescription || 'No description provided.',
        version: 'local',
        author: 'Codex',
        marketplace: 'Skills',
        repo: '',
        sourcePath: skill.path || '',
        installName: skill.name,
        category: skill.interface?.category || 'Skills',
        tags: skill.interface?.tags || [],
        isSkillMd: true,
        kind: 'skill',
        installable: false,
        uninstallable: false,
        openUrl: null,
        path: skill.path || null,
      })
    }

    for (const marketplace of payload.plugins || []) {
      for (const plugin of marketplace.plugins || []) {
        catalog.push({
          id: `plugin:${marketplace.name}:${plugin.id}`,
          name: plugin.name,
          description: plugin.interface?.description || plugin.interface?.shortDescription || 'No description provided.',
          version: plugin.source?.version || 'latest',
          author: marketplace.name,
          marketplace: marketplace.name,
          repo: '',
          sourcePath: marketplace.path || '',
          installName: plugin.name,
          category: plugin.interface?.category || 'Plugins',
          tags: plugin.interface?.tags || [],
          isSkillMd: false,
          kind: 'plugin',
          installable: false,
          uninstallable: false,
          openUrl: null,
          path: marketplace.path || null,
        })
      }
    }

    for (const app of payload.apps || []) {
      catalog.push({
        id: `app:${app.id}`,
        name: app.name,
        description: app.description || 'No description provided.',
        version: app.distributionChannel || 'app',
        author: app.pluginDisplayNames?.join(', ') || 'Codex',
        marketplace: 'Apps',
        repo: '',
        sourcePath: '',
        installName: app.id,
        category: 'Apps',
        tags: Object.values(app.labels || {}),
        isSkillMd: false,
        kind: 'app',
        installable: false,
        uninstallable: false,
        openUrl: app.installUrl || null,
        path: null,
      })
    }

    return catalog
  }

  private normalizeItemStarted(params: any): NormalizedEvent[] {
    const item = params.item
    if (!item) return []

    if (['commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'webSearch'].includes(item.type)) {
      return [{
        type: 'tool_call',
        toolName: getToolNameFromItem(item),
        toolId: item.id,
        index: 0,
        toolInput: getToolInputFromItem(item),
      }]
    }

    return []
  }

  private normalizeItemCompleted(params: any): NormalizedEvent[] {
    const item = params.item
    if (!item) return []

    if (item.type === 'agentMessage' && item.text) {
      const key = `${params.threadId}:${params.turnId}`
      if (!this.assistantTextByTurn.get(key)) {
        this.assistantTextByTurn.set(key, item.text)
        return [{ type: 'task_update', message: { content: [{ type: 'text', text: item.text }] } }]
      }
    }

    if (['commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'webSearch'].includes(item.type)) {
      return [{
        type: 'tool_call_complete',
        toolId: item.id,
        status: item.status === 'failed' ? 'error' : item.status === 'declined' ? 'declined' : 'completed',
        output: item.aggregatedOutput || undefined,
      }]
    }

    return []
  }

  private normalizeAgentMessageDelta(params: any): NormalizedEvent[] {
    const key = `${params.threadId}:${params.turnId}`
    const existing = this.assistantTextByTurn.get(key) || ''
    this.assistantTextByTurn.set(key, existing + (params.delta || ''))
    return params.delta ? [{ type: 'text_chunk', text: params.delta }] : []
  }

  private normalizeCommandOutputDelta(params: any): NormalizedEvent[] {
    return params.delta
      ? [{ type: 'tool_call_update', toolId: params.itemId, partialInput: params.delta }]
      : []
  }

  private normalizeTurnCompleted(params: any): NormalizedEvent[] {
    const turn = params.turn
    const key = `${params.threadId}:${turn.id}`
    const result = this.assistantTextByTurn.get(key) || ''
    this.assistantTextByTurn.delete(key)
    return [{
      type: 'task_complete',
      result,
      costUsd: 0,
      durationMs: 0,
      numTurns: 1,
      usage: {},
      threadId: params.threadId,
      status: turn.status === 'interrupted' ? 'interrupted' : turn.status === 'failed' ? 'failed' : 'completed',
    }]
  }
}
