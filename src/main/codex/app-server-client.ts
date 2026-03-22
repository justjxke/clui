import { EventEmitter } from 'events'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { createInterface } from 'readline'
import { log as _log } from '../logger'
import { getCliEnv } from '../cli-env'

function log(message: string): void {
  _log('CodexAppServer', message)
}

interface JsonRpcRequest {
  id: number | string
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  id: number | string
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface JsonRpcNotification {
  method: string
  params?: unknown
}

interface JsonRpcServerRequest extends JsonRpcRequest {}

type PendingRequest = {
  resolve: (value: any) => void
  reject: (reason: Error) => void
}

export class CodexAppServerClient extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private pending = new Map<number | string, PendingRequest>()
  private nextId = 1
  private startPromise: Promise<void> | null = null
  private initialized = false
  private stderrTail: string[] = []

  async start(): Promise<void> {
    if (this.initialized && this.proc && !this.proc.killed) return
    if (this.startPromise) return this.startPromise

    this.startPromise = new Promise<void>((resolve, reject) => {
      const proc = spawn('codex', ['app-server', '--listen', 'stdio://'], {
        env: getCliEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      this.proc = proc
      this.initialized = false
      this.stderrTail = []

      const stdoutRl = createInterface({ input: proc.stdout })
      const stderrRl = createInterface({ input: proc.stderr })

      stdoutRl.on('line', (line) => {
        if (!line.trim()) return
        this.handleMessageLine(line)
      })

      stderrRl.on('line', (line) => {
        if (!line.trim()) return
        this.stderrTail.push(line)
        if (this.stderrTail.length > 200) this.stderrTail.shift()
        log(`[stderr] ${line}`)
      })

      proc.once('error', (error) => {
        this.initialized = false
        this.proc = null
        this.failPending(error instanceof Error ? error : new Error(String(error)))
        reject(error)
      })

      proc.once('exit', (code, signal) => {
        const err = new Error(`codex app-server exited (${code ?? 'null'}${signal ? `, ${signal}` : ''})`)
        this.initialized = false
        this.proc = null
        this.startPromise = null
        this.failPending(err)
        this.emit('disconnect', { code, signal, stderrTail: [...this.stderrTail] })
      })

      this.sendRequest('initialize', {
        clientInfo: {
          name: 'clui_codex',
          title: 'CLUI Codex',
          version: '0.1.0',
        },
        capabilities: {
          experimentalApi: true,
        },
      }).then(() => {
        this.notify('initialized', {})
        this.initialized = true
        resolve()
      }).catch((error) => {
        try {
          proc.kill()
        } catch {}
        this.initialized = false
        this.proc = null
        reject(error)
      })
    })

    return this.startPromise.finally(() => {
      this.startPromise = null
    })
  }

  async request<T = any>(method: string, params?: unknown): Promise<T> {
    await this.start()
    return this.sendRequest<T>(method, params)
  }

  private sendRequest<T = any>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++
    const payload: JsonRpcRequest = { id, method }
    if (params !== undefined) payload.params = params
    this.write(payload)
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  async respond(id: number | string, result: unknown): Promise<void> {
    await this.start()
    this.write({ id, result })
  }

  async respondError(id: number | string, code: number, message: string, data?: unknown): Promise<void> {
    await this.start()
    this.write({ id, error: { code, message, data } })
  }

  notify(method: string, params?: unknown): void {
    if (!this.proc || this.proc.killed) return
    const payload: JsonRpcNotification = { method }
    if (params !== undefined) payload.params = params
    this.write(payload)
  }

  getStderrTail(): string[] {
    return [...this.stderrTail]
  }

  private write(payload: unknown): void {
    if (!this.proc || this.proc.killed) {
      throw new Error('codex app-server is not running')
    }
    this.proc.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private handleMessageLine(line: string): void {
    let message: any
    try {
      message = JSON.parse(line)
    } catch (error) {
      log(`Failed to parse app-server line: ${line}`)
      return
    }

    if (message.method && message.id !== undefined) {
      this.emit('request', message as JsonRpcServerRequest)
      return
    }

    if (message.method) {
      this.emit('notification', message as JsonRpcNotification)
      return
    }

    if (message.id !== undefined) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      const response = message as JsonRpcResponse
      if (response.error) {
        pending.reject(new Error(response.error.message))
      } else {
        pending.resolve(response.result)
      }
    }
  }

  private failPending(error: Error): void {
    for (const [, pending] of this.pending) pending.reject(error)
    this.pending.clear()
  }
}
