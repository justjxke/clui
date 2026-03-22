import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Microphone, ArrowUp, SpinnerGap, X, Check } from '@phosphor-icons/react'
import { useSessionStore, AVAILABLE_MODELS } from '../stores/sessionStore'
import { AttachmentChips } from './AttachmentChips'
import { SlashCommandMenu, getFilteredCommandsWithExtras, type SlashCommand } from './SlashCommandMenu'
import { useColors } from '../theme'

const INPUT_MIN_HEIGHT = 20
const INPUT_MAX_HEIGHT = 140
const MULTILINE_ENTER_HEIGHT = 52
const MULTILINE_EXIT_HEIGHT = 50
const INLINE_CONTROLS_RESERVED_WIDTH = 104
const VOICE_WAVE_BAR_COUNT = 40
const VOICE_ERROR_TIMEOUT_MS = 5000

type VoiceState = 'idle' | 'recording' | 'transcribing'

/**
 * InputBar renders inside a glass-surface rounded-full pill provided by App.tsx.
 * It provides: textarea + mic/send buttons. Attachment chips render above when present.
 */
export function InputBar() {
  const [input, setInput] = useState('')
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceWaveform, setVoiceWaveform] = useState<number[]>(() => Array.from({ length: VOICE_WAVE_BAR_COUNT }, () => 0.08))
  const [slashFilter, setSlashFilter] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [isMultiLine, setIsMultiLine] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLTextAreaElement | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const audioSinkRef = useRef<GainNode | null>(null)
  const pcmChunksRef = useRef<Float32Array[]>([])
  const inputSampleRateRef = useRef(16000)
  const waveformRef = useRef<number[]>(Array.from({ length: VOICE_WAVE_BAR_COUNT }, () => 0.08))
  const voiceErrorTimerRef = useRef<number | null>(null)

  const sendMessage = useSessionStore((s) => s.sendMessage)
  const clearTab = useSessionStore((s) => s.clearTab)
  const addSystemMessage = useSessionStore((s) => s.addSystemMessage)
  const addAttachments = useSessionStore((s) => s.addAttachments)
  const removeAttachment = useSessionStore((s) => s.removeAttachment)

  const setPreferredModel = useSessionStore((s) => s.setPreferredModel)
  const staticInfo = useSessionStore((s) => s.staticInfo)
  const preferredModel = useSessionStore((s) => s.preferredModel)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const tab = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const colors = useColors()
  const isBusy = tab?.status === 'running' || tab?.status === 'connecting'
  const isConnecting = tab?.status === 'connecting'
  const hasContent = input.trim().length > 0 || (tab?.attachments?.length ?? 0) > 0
  const canSend = !!tab && !isConnecting && hasContent
  const attachments = tab?.attachments || []
  const showSlashMenu = slashFilter !== null && !isConnecting
  const skillCommands: SlashCommand[] = (tab?.sessionSkills || []).map((skill) => ({
    command: `/${skill}`,
    description: `Run skill: ${skill}`,
    icon: <span className="text-[11px]">✦</span>,
  }))

  useEffect(() => {
    textareaRef.current?.focus()
  }, [activeTabId])

  const requestHide = useCallback(() => {
    window.dispatchEvent(new CustomEvent('clui:request-hide'))
  }, [])

  // Focus textarea when window is shown (shortcut toggle, screenshot return)
  useEffect(() => {
    const unsub = window.clui.onWindowShown(() => {
      textareaRef.current?.focus()
    })
    return unsub
  }, [])

  const measureInlineHeight = useCallback((value: string): number => {
    if (typeof document === 'undefined') return 0
    if (!measureRef.current) {
      const m = document.createElement('textarea')
      m.setAttribute('aria-hidden', 'true')
      m.tabIndex = -1
      m.style.position = 'absolute'
      m.style.top = '-99999px'
      m.style.left = '0'
      m.style.height = '0'
      m.style.minHeight = '0'
      m.style.overflow = 'hidden'
      m.style.visibility = 'hidden'
      m.style.pointerEvents = 'none'
      m.style.zIndex = '-1'
      m.style.resize = 'none'
      m.style.border = '0'
      m.style.outline = '0'
      m.style.boxSizing = 'border-box'
      document.body.appendChild(m)
      measureRef.current = m
    }

    const m = measureRef.current
    const hostWidth = wrapperRef.current?.clientWidth ?? 0
    const inlineWidth = Math.max(120, hostWidth - INLINE_CONTROLS_RESERVED_WIDTH)
    m.style.width = `${inlineWidth}px`
    m.style.fontSize = '14px'
    m.style.lineHeight = '20px'
    m.style.paddingTop = '15px'
    m.style.paddingBottom = '15px'
    m.style.paddingLeft = '0'
    m.style.paddingRight = '0'

    const computed = textareaRef.current ? window.getComputedStyle(textareaRef.current) : null
    if (computed) {
      m.style.fontFamily = computed.fontFamily
      m.style.letterSpacing = computed.letterSpacing
      m.style.fontWeight = computed.fontWeight
    }

    m.value = value || ' '
    return m.scrollHeight
  }, [])

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = `${INPUT_MIN_HEIGHT}px`
    const naturalHeight = el.scrollHeight
    const clampedHeight = Math.min(naturalHeight, INPUT_MAX_HEIGHT)
    el.style.height = `${clampedHeight}px`
    el.style.overflowY = naturalHeight > INPUT_MAX_HEIGHT ? 'auto' : 'hidden'
    if (naturalHeight <= INPUT_MAX_HEIGHT) {
      el.scrollTop = 0
    }
    // Decide multiline mode against fixed inline-width measurement to avoid
    // expand/collapse bounce when layout switches between modes.
    const inlineHeight = measureInlineHeight(input)
    setIsMultiLine((prev) => {
      if (!prev) return inlineHeight > MULTILINE_ENTER_HEIGHT
      return inlineHeight > MULTILINE_EXIT_HEIGHT
    })
  }, [input, measureInlineHeight])

  useLayoutEffect(() => { autoResize() }, [input, isMultiLine, autoResize])

  useEffect(() => {
    return () => {
      if (voiceErrorTimerRef.current !== null) {
        window.clearTimeout(voiceErrorTimerRef.current)
        voiceErrorTimerRef.current = null
      }
      void teardownRecordingGraph()
      if (measureRef.current) {
        measureRef.current.remove()
        measureRef.current = null
      }
    }
  }, [])

  // ─── Slash command detection ───
  const updateSlashFilter = useCallback((value: string) => {
    const match = value.match(/^(\/[a-zA-Z-]*)$/)
    if (match) {
      setSlashFilter(match[1])
      setSlashIndex(0)
    } else {
      setSlashFilter(null)
    }
  }, [])

  // ─── Handle slash commands ───
  const executeCommand = useCallback((cmd: SlashCommand) => {
    switch (cmd.command) {
      case '/clear':
        clearTab()
        addSystemMessage('Conversation cleared.')
        break
      case '/cost': {
        if (tab?.lastResult) {
          const r = tab.lastResult
          const parts = [`$${r.totalCostUsd.toFixed(4)}`, `${(r.durationMs / 1000).toFixed(1)}s`, `${r.numTurns} turn${r.numTurns !== 1 ? 's' : ''}`]
          if (r.usage.input_tokens) {
            parts.push(`${r.usage.input_tokens.toLocaleString()} in / ${(r.usage.output_tokens || 0).toLocaleString()} out`)
          }
          addSystemMessage(parts.join(' · '))
        } else {
          addSystemMessage('No cost data yet — send a message first.')
        }
        break
      }
      case '/model': {
        const model = tab?.sessionModel || null
        const version = tab?.sessionVersion || staticInfo?.version || null
        const current = preferredModel || model || 'default'
        const lines = AVAILABLE_MODELS.map((m) => {
          const active = m.id === current || (!preferredModel && m.id === model)
          return `  ${active ? '\u25CF' : '\u25CB'} ${m.label} (${m.id})`
        })
        const header = version ? `Codex ${version}` : 'Codex'
        addSystemMessage(`${header}\n\n${lines.join('\n')}\n\nSwitch model: type /model <name>\n  e.g. /model sonnet`)
        break
      }
      case '/mcp': {
        if (tab?.sessionMcpServers && tab.sessionMcpServers.length > 0) {
          const lines = tab.sessionMcpServers.map((s) => {
            const icon = s.status === 'connected' ? '\u2713' : s.status === 'failed' ? '\u2717' : '\u25CB'
            return `  ${icon} ${s.name} — ${s.status}`
          })
          addSystemMessage(`MCP Servers (${tab.sessionMcpServers.length}):\n${lines.join('\n')}`)
        } else if (tab?.threadId) {
          addSystemMessage('No MCP servers connected in this session.')
        } else {
          addSystemMessage('No MCP data yet — send a message to start a session.')
        }
        break
      }
      case '/skills': {
        if (tab?.sessionSkills && tab.sessionSkills.length > 0) {
          const lines = tab.sessionSkills.map((s) => `/${s}`)
          addSystemMessage(`Available skills (${tab.sessionSkills.length}):\n${lines.join('\n')}`)
        } else if (tab?.threadId) {
          addSystemMessage('No skills available in this session.')
        } else {
          addSystemMessage('No session metadata yet — send a message first.')
        }
        break
      }
      case '/help': {
        const lines = [
          '/clear — Clear conversation history',
          '/cost — Show token usage and cost',
          '/model — Show model info & switch models',
          '/mcp — Show MCP server status',
          '/skills — Show available skills',
          '/help — Show this list',
        ]
        addSystemMessage(lines.join('\n'))
        break
      }
    }
  }, [tab, clearTab, addSystemMessage, staticInfo, preferredModel])

  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    const isSkillCommand = !!tab?.sessionSkills?.includes(cmd.command.replace(/^\//, ''))
    if (isSkillCommand) {
      setInput(`${cmd.command} `)
      setSlashFilter(null)
      requestAnimationFrame(() => textareaRef.current?.focus())
      return
    }
    setInput('')
    setSlashFilter(null)
    executeCommand(cmd)
  }, [executeCommand, tab?.sessionSkills])

  // ─── Send ───
  const handleSend = useCallback(() => {
    if (showSlashMenu) {
      const filtered = getFilteredCommandsWithExtras(slashFilter!, skillCommands)
      if (filtered.length > 0) {
        handleSlashSelect(filtered[slashIndex])
        return
      }
    }
    const prompt = input.trim()
    const modelMatch = prompt.match(/^\/model\s+(\S+)/i)
    if (modelMatch) {
      const query = modelMatch[1].toLowerCase()
      const match = AVAILABLE_MODELS.find((m: { id: string; label: string }) =>
        m.id.toLowerCase().includes(query) || m.label.toLowerCase().includes(query)
      )
      if (match) {
        setPreferredModel(match.id)
        setInput('')
        setSlashFilter(null)
        addSystemMessage(`Model switched to ${match.label} (${match.id})`)
      } else {
        setInput('')
        setSlashFilter(null)
        addSystemMessage(`Unknown model "${modelMatch[1]}". Available: opus, sonnet, haiku`)
      }
      return
    }
    if (!prompt && attachments.length === 0) return
    if (isConnecting) return
    setInput('')
    setSlashFilter(null)
    if (textareaRef.current) {
      textareaRef.current.style.height = `${INPUT_MIN_HEIGHT}px`
    }
    sendMessage(prompt || 'See attached files')
    // Refocus after React re-renders from the state update
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [input, isBusy, sendMessage, attachments.length, showSlashMenu, slashFilter, slashIndex, handleSlashSelect])

  // ─── Keyboard ───
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu) {
      const filtered = getFilteredCommandsWithExtras(slashFilter!, skillCommands)
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex((i) => (i + 1) % filtered.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex((i) => (i - 1 + filtered.length) % filtered.length); return }
      if (e.key === 'Tab') { e.preventDefault(); if (filtered.length > 0) handleSlashSelect(filtered[slashIndex]); return }
      if (e.key === 'Escape') { e.preventDefault(); setSlashFilter(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.key === 'Escape' && !showSlashMenu) { requestHide() }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)
    updateSlashFilter(value)
  }

  // ─── Paste image ───
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) return
        const reader = new FileReader()
        reader.onload = async () => {
          const dataUrl = reader.result as string
          const attachment = await window.clui.pasteImage(dataUrl)
          if (attachment) addAttachments([attachment])
        }
        reader.readAsDataURL(blob)
        return
      }
    }
  }, [addAttachments])

  // ─── Voice ───
  const cancelledRef = useRef(false)

  const clearVoiceErrorTimer = useCallback(() => {
    if (voiceErrorTimerRef.current !== null) {
      window.clearTimeout(voiceErrorTimerRef.current)
      voiceErrorTimerRef.current = null
    }
  }, [])

  const showVoiceError = useCallback((message: string) => {
    setVoiceError(message)
    clearVoiceErrorTimer()
    voiceErrorTimerRef.current = window.setTimeout(() => {
      setVoiceError(null)
      voiceErrorTimerRef.current = null
    }, VOICE_ERROR_TIMEOUT_MS)
  }, [clearVoiceErrorTimer])

  const teardownRecordingGraph = useCallback(async () => {
    audioProcessorRef.current?.disconnect()
    audioSourceRef.current?.disconnect()
    audioSinkRef.current?.disconnect()
    audioStreamRef.current?.getTracks().forEach((track) => track.stop())

    audioProcessorRef.current = null
    audioSourceRef.current = null
    audioSinkRef.current = null
    audioStreamRef.current = null

    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close()
      } catch {}
      audioContextRef.current = null
    }

    waveformRef.current = Array.from({ length: VOICE_WAVE_BAR_COUNT }, () => 0.08)
    setVoiceWaveform(waveformRef.current)
  }, [])

  const finalizeRecording = useCallback(async (cancelled: boolean) => {
    const sampleRate = inputSampleRateRef.current
    const mergedSamples = mergeFloat32Chunks(pcmChunksRef.current)
    pcmChunksRef.current = []
    await teardownRecordingGraph()

    if (cancelled) {
      cancelledRef.current = false
      setVoiceState('idle')
      return
    }

    if (mergedSamples.length === 0) {
      setVoiceState('idle')
      return
    }

    setVoiceState('transcribing')
    try {
      const wavBytes = audioSamplesToWavBytes(mergedSamples, sampleRate)
      const result = await window.clui.transcribeAudio({ wavBytes })
      if (result.error) showVoiceError(result.error)
      else if (result.transcript) setInput((prev) => (prev ? `${prev} ${result.transcript}` : result.transcript))
    } catch (err: any) {
      showVoiceError(`Voice failed: ${err.message}`)
    } finally {
      setVoiceState('idle')
    }
  }, [showVoiceError, teardownRecordingGraph])

  const stopRecording = useCallback(() => {
    cancelledRef.current = false
    void finalizeRecording(false)
  }, [finalizeRecording])

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true
    void finalizeRecording(true)
  }, [finalizeRecording])

  const startRecording = useCallback(async () => {
    clearVoiceErrorTimer()
    setVoiceError(null)
    waveformRef.current = Array.from({ length: VOICE_WAVE_BAR_COUNT }, () => 0.08)
    setVoiceWaveform(waveformRef.current)
    pcmChunksRef.current = []
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      showVoiceError('Microphone permission denied.')
      return
    }

    try {
      const audioContext = new AudioContext({ sampleRate: 16000 })
      await audioContext.resume()

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(1024, Math.max(1, source.channelCount || 1), 1)
      const sink = audioContext.createGain()
      sink.gain.value = 0

      processor.onaudioprocess = (event) => {
        const mono = mixInputBufferToMono(event.inputBuffer)
        if (mono.length > 0) pcmChunksRef.current.push(mono)
        const nextWaveform = pushWaveformLevel(waveformRef.current, getWaveformLevel(mono))
        waveformRef.current = nextWaveform
        setVoiceWaveform(nextWaveform)
      }

      source.connect(processor)
      processor.connect(sink)
      sink.connect(audioContext.destination)

      audioStreamRef.current = stream
      audioContextRef.current = audioContext
      audioSourceRef.current = source
      audioProcessorRef.current = processor
      audioSinkRef.current = sink
      inputSampleRateRef.current = audioContext.sampleRate
    } catch (err: any) {
      stream.getTracks().forEach((track) => track.stop())
      showVoiceError(`Recording failed: ${err.message}`)
      setVoiceState('idle')
      return
    }

    setVoiceState('recording')
  }, [clearVoiceErrorTimer, showVoiceError])

  const handleVoiceToggle = useCallback(() => {
    if (voiceState === 'recording') stopRecording()
    else if (voiceState === 'idle') void startRecording()
  }, [voiceState, startRecording, stopRecording])

  const hasAttachments = attachments.length > 0

  return (
    <div ref={wrapperRef} data-clui-ui className="flex flex-col w-full relative">
      {/* Slash command menu */}
      <AnimatePresence>
        {showSlashMenu && (
          <SlashCommandMenu
            filter={slashFilter!}
            selectedIndex={slashIndex}
            onSelect={handleSlashSelect}
            anchorRect={wrapperRef.current?.getBoundingClientRect() ?? null}
            extraCommands={skillCommands}
          />
        )}
      </AnimatePresence>

      {/* Attachment chips — renders inside the pill, above textarea */}
      {hasAttachments && (
        <div style={{ paddingTop: 6, marginLeft: -6 }}>
          <AttachmentChips attachments={attachments} onRemove={removeAttachment} />
        </div>
      )}

      {/* Single-line: inline controls. Multi-line: controls in bottom row */}
      <div className="w-full" style={{ minHeight: 50 }}>
        {voiceState === 'recording' ? (
          <div className="flex items-center w-full" style={{ minHeight: 50 }}>
            <div className="flex-1 flex items-center overflow-hidden" style={{ minHeight: 20 }}>
              <VoiceWaveform bars={voiceWaveform} colors={colors} />
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-2">
              <VoiceButtons
                voiceState={voiceState}
                isConnecting={isConnecting}
                colors={colors}
                onToggle={handleVoiceToggle}
                onCancel={cancelRecording}
                onStop={stopRecording}
              />
            </div>
          </div>
        ) : isMultiLine ? (
          <div className="w-full">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isConnecting
                  ? 'Initializing...'
                  : voiceState === 'transcribing'
                      ? 'Transcribing...'
                      : isBusy
                        ? 'Type to queue a message...'
                        : 'Ask anything...'
              }
              rows={1}
              className="w-full bg-transparent resize-none"
              style={{
                fontSize: 14,
                lineHeight: '20px',
                color: colors.textPrimary,
                minHeight: 20,
                maxHeight: INPUT_MAX_HEIGHT,
                paddingTop: 11,
                paddingBottom: 2,
              }}
            />

            <div className="flex items-center justify-end gap-1" style={{ marginTop: 0, paddingBottom: 4 }}>
              <VoiceButtons
                voiceState={voiceState}
                isConnecting={isConnecting}
                colors={colors}
                onToggle={handleVoiceToggle}
                onCancel={cancelRecording}
                onStop={stopRecording}
              />
              <AnimatePresence>
                {canSend && voiceState !== 'recording' && (
                  <motion.div key="send" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.1 }}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleSend}
                      className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                      style={{ background: colors.sendBg, color: colors.textOnAccent }}
                      title={isBusy ? 'Queue message' : 'Send (Enter)'}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = colors.sendHover
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = colors.sendBg
                      }}
                    >
                      <ArrowUp size={16} weight="bold" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="flex items-center w-full" style={{ minHeight: 50 }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isConnecting
                  ? 'Initializing...'
                  : voiceState === 'transcribing'
                      ? 'Transcribing...'
                      : isBusy
                        ? 'Type to queue a message...'
                        : 'Ask anything...'
              }
              rows={1}
              className="flex-1 bg-transparent resize-none"
              style={{
                fontSize: 14,
                lineHeight: '20px',
                color: colors.textPrimary,
                minHeight: 20,
                maxHeight: INPUT_MAX_HEIGHT,
                paddingTop: 15,
                paddingBottom: 15,
              }}
            />

            <div className="flex items-center gap-1 shrink-0 ml-2">
              <VoiceButtons
                voiceState={voiceState}
                isConnecting={isConnecting}
                colors={colors}
                onToggle={handleVoiceToggle}
                onCancel={cancelRecording}
                onStop={stopRecording}
              />
              <AnimatePresence>
                {canSend && voiceState !== 'recording' && (
                  <motion.div key="send" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.1 }}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleSend}
                      className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                      style={{ background: colors.sendBg, color: colors.textOnAccent }}
                      title={isBusy ? 'Queue message' : 'Send (Enter)'}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = colors.sendHover
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = colors.sendBg
                      }}
                    >
                      <ArrowUp size={16} weight="bold" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* Voice error */}
      {voiceError && (
        <div className="px-1 pb-2 text-[11px]" style={{ color: colors.statusError }}>
          {voiceError}
        </div>
      )}
    </div>
  )
}

// ─── Voice Buttons (extracted to avoid duplication) ───

function VoiceButtons({ voiceState, isConnecting, colors, onToggle, onCancel, onStop }: {
  voiceState: VoiceState
  isConnecting: boolean
  colors: ReturnType<typeof useColors>
  onToggle: () => void
  onCancel: () => void
  onStop: () => void
}) {
  return (
    <AnimatePresence mode="wait">
      {voiceState === 'recording' ? (
        <motion.div
          key="voice-controls"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.12 }}
          className="flex items-center gap-1"
        >
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCancel}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ background: colors.surfaceHover, color: colors.textTertiary }}
            title="Cancel recording"
          >
            <X size={15} weight="bold" />
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onStop}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ background: colors.accent, color: colors.textOnAccent }}
            title="Confirm recording"
          >
            <Check size={15} weight="bold" />
          </button>
        </motion.div>
      ) : voiceState === 'transcribing' ? (
        <motion.div key="transcribing" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.1 }}>
          <button
            disabled
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: colors.micBg, color: colors.micColor }}
          >
            <SpinnerGap size={16} className="animate-spin" />
          </button>
        </motion.div>
      ) : (
        <motion.div key="mic" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.1 }}>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggle}
            disabled={isConnecting}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{
              background: colors.micBg,
              color: isConnecting ? colors.micDisabled : colors.micColor,
            }}
            title="Voice input"
          >
            <Microphone size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function VoiceWaveform({ bars, colors }: {
  bars: number[]
  colors: ReturnType<typeof useColors>
}) {
  return (
    <motion.div
      key="voice-waveform"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.16 }}
      className="flex items-center gap-[3px] w-full h-9 px-2"
      style={{ minWidth: 0 }}
    >
      {bars.map((bar, index) => {
        const height = Math.max(3, Math.round(4 + bar * 22))
        const alpha = 0.22 + Math.min(0.78, bar * 1.2)
        return (
          <motion.span
            key={`${index}-${height}`}
            animate={{ height, opacity: alpha }}
            transition={{ duration: 0.11, ease: [0.22, 1, 0.36, 1] }}
            className="block rounded-full flex-1"
            style={{
              minWidth: 2,
              background: colors.textPrimary,
              transformOrigin: 'center',
            }}
          />
        )
      })}
    </motion.div>
  )
}

// ─── Audio conversion: live PCM capture → WAV bytes ───

function audioSamplesToWavBytes(samples: Float32Array, sampleRate: number): Uint8Array {
  const mono = samples
  const inputRms = rmsLevel(mono)
  if (inputRms < 0.003) {
    throw new Error('No voice detected. Check microphone permission and speak closer to the mic.')
  }
  const resampled = resampleLinear(mono, sampleRate, 16000)
  const normalized = normalizePcm(resampled)
  const wavBuffer = encodeWav(normalized, 16000)
  return new Uint8Array(wavBuffer)
}

function mergeFloat32Chunks(chunks: Float32Array[]): Float32Array {
  let totalLength = 0
  for (const chunk of chunks) totalLength += chunk.length
  const merged = new Float32Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}

function mixInputBufferToMono(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer
  if (numberOfChannels <= 1) return new Float32Array(buffer.getChannelData(0))

  const mono = new Float32Array(length)
  for (let channelIndex = 0; channelIndex < numberOfChannels; channelIndex++) {
    const channel = buffer.getChannelData(channelIndex)
    for (let sampleIndex = 0; sampleIndex < length; sampleIndex++) {
      mono[sampleIndex] += channel[sampleIndex]
    }
  }
  const inv = 1 / numberOfChannels
  for (let sampleIndex = 0; sampleIndex < length; sampleIndex++) mono[sampleIndex] *= inv
  return mono
}

function getWaveformLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0.08

  let peak = 0
  let sumSq = 0
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i]
    const abs = Math.abs(value)
    if (abs > peak) peak = abs
    sumSq += value * value
  }

  const rms = Math.sqrt(sumSq / samples.length)
  const weighted = Math.max(rms * 5.5, peak * 2.4)
  return Math.max(0.08, Math.min(1, weighted))
}

function pushWaveformLevel(previous: number[], nextLevel: number): number[] {
  const decayedPrevious = previous.map((value, index) => {
    const decay = index > previous.length - 6 ? 0.92 : 0.86
    return Math.max(0.08, value * decay)
  })

  return [...decayedPrevious.slice(1), nextLevel]
}

function resampleLinear(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate) return input
  const ratio = inRate / outRate
  const outLength = Math.max(1, Math.floor(input.length / ratio))
  const output = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const t = pos - i0
    output[i] = input[i0] * (1 - t) + input[i1] * t
  }
  return output
}

function normalizePcm(samples: Float32Array): Float32Array {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i])
    if (a > peak) peak = a
  }
  if (peak < 1e-4 || peak > 0.95) return samples

  const gain = Math.min(0.95 / peak, 8)
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain
  return out
}

function rmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sumSq = 0
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i]
  return Math.sqrt(sumSq / samples.length)
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = samples.length
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, numSamples * 2, true)
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    offset += 2
  }
  return buffer
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}
