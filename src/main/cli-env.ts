import { execFileSync } from 'child_process'
import { dirname } from 'path'

let cachedPath: string | null = null

function appendPathEntries(target: string[], seen: Set<string>, rawPath: string | undefined): void {
  if (!rawPath) return
  for (const entry of rawPath.split(':')) {
    const p = entry.trim()
    if (!p || seen.has(p)) continue
    seen.add(p)
    target.push(p)
  }
}

export function getCliPath(): string {
  if (cachedPath) return cachedPath

  const ordered: string[] = []
  const seen = new Set<string>()

  // Start from current process PATH.
  appendPathEntries(ordered, seen, process.env.PATH)

  // Add common binary locations used on macOS (Homebrew + system).
  appendPathEntries(ordered, seen, '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin')

  // Try interactive login shell first so nvm/asdf/etc. PATH hooks are loaded.
  const pathCommands: Array<{ bin: string; args: string[] }> = [
    { bin: '/bin/zsh', args: ['-ilc', 'printf %s "$PATH"'] },
    { bin: '/bin/zsh', args: ['-lc', 'printf %s "$PATH"'] },
    { bin: '/bin/bash', args: ['-lc', 'printf %s "$PATH"'] },
  ]

  for (const command of pathCommands) {
    try {
      const discovered = execFileSync(command.bin, command.args, { encoding: 'utf-8', timeout: 3000 }).trim()
      appendPathEntries(ordered, seen, discovered)
    } catch {
      // Keep trying fallbacks.
    }
  }

  const binaryProbeCommands: Array<{ bin: string; args: string[] }> = [
    { bin: '/bin/zsh', args: ['-ilc', 'whence -p node codex'] },
    { bin: '/bin/zsh', args: ['-lc', 'whence -p node codex'] },
    { bin: '/bin/bash', args: ['-lc', 'command -v node codex'] },
  ]

  for (const command of binaryProbeCommands) {
    try {
      const discovered = execFileSync(command.bin, command.args, { encoding: 'utf-8', timeout: 3000 }).trim()
      for (const line of discovered.split('\n')) {
        const binaryPath = line.trim()
        if (!binaryPath.startsWith('/')) continue
        appendPathEntries(ordered, seen, dirname(binaryPath))
      }
    } catch {
      // Keep trying fallbacks.
    }
  }

  cachedPath = ordered.join(':')
  return cachedPath
}

export function getCliEnv(extraEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    PATH: getCliPath(),
  }
  delete env.CLAUDECODE
  return env
}
