/**
 * CLUI Design Tokens — Dual theme (dark + light)
 * Reworked toward a cooler Codex/Cursor-inspired palette.
 */
import { create } from 'zustand'

// ─── Color palettes ───

const darkColors = {
  // Container (glass surfaces)
  containerBg: '#111111',
  containerBgCollapsed: '#0d0d0d',
  containerBorder: '#2a2a2a',
  containerShadow: '0 18px 48px rgba(0, 0, 0, 0.52), 0 2px 14px rgba(0, 0, 0, 0.34)',
  cardShadow: '0 6px 18px rgba(0, 0, 0, 0.38)',
  cardShadowCollapsed: '0 6px 14px rgba(0, 0, 0, 0.46)',

  // Surface layers
  surfacePrimary: '#171717',
  surfaceSecondary: '#242424',
  surfaceHover: 'rgba(252, 252, 252, 0.045)',
  surfaceActive: 'rgba(252, 252, 252, 0.08)',

  // Input
  inputBg: 'transparent',
  inputBorder: '#2d2d2d',
  inputFocusBorder: 'rgba(1, 105, 204, 0.42)',
  inputPillBg: '#141414',

  // Text
  textPrimary: '#fcfcfc',
  textSecondary: '#d1d1d1',
  textTertiary: '#8d8d8d',
  textMuted: '#3a3a3a',

  // Accent — product blue
  accent: '#0169CC',
  accentLight: 'rgba(1, 105, 204, 0.12)',
  accentSoft: 'rgba(1, 105, 204, 0.18)',

  // Status dots
  statusIdle: '#7c7c7c',
  statusRunning: '#0169CC',
  statusRunningBg: 'rgba(1, 105, 204, 0.14)',
  statusComplete: '#58c592',
  statusCompleteBg: 'rgba(88, 197, 146, 0.12)',
  statusError: '#f07b7b',
  statusErrorBg: 'rgba(240, 123, 123, 0.1)',
  statusDead: '#f07b7b',
  statusPermission: '#ffbe5c',
  statusPermissionGlow: 'rgba(255, 190, 92, 0.28)',

  // Tab
  tabActive: '#1d1d1d',
  tabActiveBorder: 'rgba(1, 105, 204, 0.42)',
  tabInactive: 'transparent',
  tabHover: 'rgba(252, 252, 252, 0.04)',

  // User message bubble
  userBubble: '#1b1b1b',
  userBubbleBorder: '#303030',
  userBubbleText: '#fcfcfc',

  // Tool card
  toolBg: '#171717',
  toolBorder: '#2c2c2c',
  toolRunningBorder: 'rgba(1, 105, 204, 0.26)',
  toolRunningBg: 'rgba(1, 105, 204, 0.06)',

  // Timeline
  timelineLine: '#252525',
  timelineNode: 'rgba(1, 105, 204, 0.16)',
  timelineNodeActive: '#0169CC',

  // Scrollbar
  scrollThumb: 'rgba(252, 252, 252, 0.12)',
  scrollThumbHover: 'rgba(252, 252, 252, 0.2)',

  // Stop button
  stopBg: '#ef4444',
  stopHover: '#dc2626',

  // Send button
  sendBg: '#0169CC',
  sendHover: '#0057aa',
  sendDisabled: 'rgba(1, 105, 204, 0.3)',

  // Popover
  popoverBg: '#151515',
  popoverBorder: '#2d2d2d',
  popoverShadow: '0 16px 40px rgba(0, 0, 0, 0.48), 0 2px 10px rgba(0, 0, 0, 0.28)',

  // Code block
  codeBg: '#101010',

  // Mic button
  micBg: '#1b1b1b',
  micColor: '#d1d1d1',
  micDisabled: '#282828',

  // Placeholder
  placeholder: '#707070',

  // Disabled button color
  btnDisabled: '#2b2b2b',

  // Text on accent backgrounds
  textOnAccent: '#fcfcfc',

  // Button hover (CSS-only stack buttons)
  btnHoverColor: '#fcfcfc',
  btnHoverBg: '#1d1d1d',

  // Accent border variants (replaces hex-alpha concatenation antipattern)
  accentBorder: 'rgba(1, 105, 204, 0.22)',
  accentBorderMedium: 'rgba(1, 105, 204, 0.32)',

  // Permission card (amber)
  permissionBorder: 'rgba(255, 190, 92, 0.3)',
  permissionShadow: '0 8px 24px rgba(255, 190, 92, 0.08)',
  permissionHeaderBg: 'rgba(255, 190, 92, 0.08)',
  permissionHeaderBorder: 'rgba(255, 190, 92, 0.16)',

  // Permission allow (green)
  permissionAllowBg: 'rgba(88, 197, 146, 0.12)',
  permissionAllowHoverBg: 'rgba(88, 197, 146, 0.22)',
  permissionAllowBorder: 'rgba(88, 197, 146, 0.28)',

  // Permission deny (red)
  permissionDenyBg: 'rgba(240, 123, 123, 0.1)',
  permissionDenyHoverBg: 'rgba(240, 123, 123, 0.18)',
  permissionDenyBorder: 'rgba(240, 123, 123, 0.24)',

  // Permission denied card
  permissionDeniedBorder: 'rgba(240, 123, 123, 0.28)',
  permissionDeniedHeaderBorder: 'rgba(240, 123, 123, 0.16)',
} as const

const lightColors = {
  // Container (glass surfaces)
  containerBg: '#fcfcfc',
  containerBgCollapsed: '#f4f4f4',
  containerBorder: '#e7e7e7',
  containerShadow: '0 18px 42px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
  cardShadow: '0 6px 18px rgba(0, 0, 0, 0.06)',
  cardShadowCollapsed: '0 4px 12px rgba(0, 0, 0, 0.06)',

  // Surface layers
  surfacePrimary: '#f6f6f6',
  surfaceSecondary: '#ebebeb',
  surfaceHover: 'rgba(17, 17, 17, 0.04)',
  surfaceActive: 'rgba(17, 17, 17, 0.08)',

  // Input
  inputBg: 'transparent',
  inputBorder: '#e1e1e1',
  inputFocusBorder: 'rgba(1, 105, 204, 0.28)',
  inputPillBg: '#ffffff',

  // Text
  textPrimary: '#111111',
  textSecondary: '#4a4a4a',
  textTertiary: '#7a7a7a',
  textMuted: '#dddddd',

  // Accent — product blue
  accent: '#0169CC',
  accentLight: 'rgba(1, 105, 204, 0.1)',
  accentSoft: 'rgba(1, 105, 204, 0.14)',

  // Status dots
  statusIdle: '#838383',
  statusRunning: '#0169CC',
  statusRunningBg: 'rgba(1, 105, 204, 0.12)',
  statusComplete: '#2f9a6d',
  statusCompleteBg: 'rgba(47, 154, 109, 0.1)',
  statusError: '#d85757',
  statusErrorBg: 'rgba(216, 87, 87, 0.08)',
  statusDead: '#d85757',
  statusPermission: '#ca8a04',
  statusPermissionGlow: 'rgba(202, 138, 4, 0.24)',

  // Tab
  tabActive: '#f4f4f4',
  tabActiveBorder: 'rgba(1, 105, 204, 0.28)',
  tabInactive: 'transparent',
  tabHover: 'rgba(17, 17, 17, 0.04)',

  // User message bubble
  userBubble: '#f4f4f4',
  userBubbleBorder: '#e5e5e5',
  userBubbleText: '#111111',

  // Tool card
  toolBg: '#f6f6f6',
  toolBorder: '#e5e5e5',
  toolRunningBorder: 'rgba(1, 105, 204, 0.18)',
  toolRunningBg: 'rgba(1, 105, 204, 0.05)',

  // Timeline
  timelineLine: '#e8e8e8',
  timelineNode: 'rgba(1, 105, 204, 0.14)',
  timelineNodeActive: '#0169CC',

  // Scrollbar
  scrollThumb: 'rgba(0, 0, 0, 0.1)',
  scrollThumbHover: 'rgba(0, 0, 0, 0.18)',

  // Stop button
  stopBg: '#ef4444',
  stopHover: '#dc2626',

  // Send button
  sendBg: '#0169CC',
  sendHover: '#0057aa',
  sendDisabled: 'rgba(1, 105, 204, 0.24)',

  // Popover
  popoverBg: '#fcfcfc',
  popoverBorder: '#e5e5e5',
  popoverShadow: '0 16px 36px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.04)',

  // Code block
  codeBg: '#f6f6f6',

  // Mic button
  micBg: '#f2f2f2',
  micColor: '#4a4a4a',
  micDisabled: '#e3e3e3',

  // Placeholder
  placeholder: '#9a9a9a',

  // Disabled button color
  btnDisabled: '#dedede',

  // Text on accent backgrounds
  textOnAccent: '#ffffff',

  // Button hover (CSS-only stack buttons)
  btnHoverColor: '#111111',
  btnHoverBg: '#f2f2f2',

  // Accent border variants (replaces hex-alpha concatenation antipattern)
  accentBorder: 'rgba(1, 105, 204, 0.18)',
  accentBorderMedium: 'rgba(1, 105, 204, 0.26)',

  // Permission card (amber)
  permissionBorder: 'rgba(245, 158, 11, 0.3)',
  permissionShadow: '0 2px 12px rgba(245, 158, 11, 0.08)',
  permissionHeaderBg: 'rgba(245, 158, 11, 0.06)',
  permissionHeaderBorder: 'rgba(245, 158, 11, 0.12)',

  // Permission allow (green)
  permissionAllowBg: 'rgba(34, 197, 94, 0.1)',
  permissionAllowHoverBg: 'rgba(34, 197, 94, 0.22)',
  permissionAllowBorder: 'rgba(34, 197, 94, 0.25)',

  // Permission deny (red)
  permissionDenyBg: 'rgba(239, 68, 68, 0.08)',
  permissionDenyHoverBg: 'rgba(239, 68, 68, 0.18)',
  permissionDenyBorder: 'rgba(239, 68, 68, 0.22)',

  // Permission denied card
  permissionDeniedBorder: 'rgba(196, 112, 96, 0.3)',
  permissionDeniedHeaderBorder: 'rgba(196, 112, 96, 0.12)',
} as const

export type ColorPalette = { [K in keyof typeof darkColors]: string }

// ─── Theme store ───

export type ThemeMode = 'system' | 'light' | 'dark'

interface ThemeState {
  isDark: boolean
  themeMode: ThemeMode
  soundEnabled: boolean
  expandedUI: boolean
  /** OS-reported dark mode — used when themeMode is 'system' */
  _systemIsDark: boolean
  setIsDark: (isDark: boolean) => void
  setThemeMode: (mode: ThemeMode) => void
  setSoundEnabled: (enabled: boolean) => void
  setExpandedUI: (expanded: boolean) => void
  /** Called by OS theme change listener — updates system value */
  setSystemTheme: (isDark: boolean) => void
}

/** Convert camelCase token name to --clui-kebab-case CSS custom property */
function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

/** Sync all JS design tokens to CSS custom properties on :root */
function syncTokensToCss(tokens: ColorPalette): void {
  const style = document.documentElement.style
  for (const [key, value] of Object.entries(tokens)) {
    style.setProperty(`--clui-${camelToKebab(key)}`, value)
  }
}

function applyTheme(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.classList.toggle('light', !isDark)
  syncTokensToCss(isDark ? darkColors : lightColors)
}

const SETTINGS_KEY = 'clui-settings'

function loadSettings(): { themeMode: ThemeMode; soundEnabled: boolean; expandedUI: boolean } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        themeMode: ['light', 'dark'].includes(parsed.themeMode) ? parsed.themeMode : 'dark',
        soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
        expandedUI: typeof parsed.expandedUI === 'boolean' ? parsed.expandedUI : false,
      }
    }
  } catch {}
  return { themeMode: 'dark', soundEnabled: true, expandedUI: false }
}

function saveSettings(s: { themeMode: ThemeMode; soundEnabled: boolean; expandedUI: boolean }): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

// Always start in compact UI mode on launch.
const saved = { ...loadSettings(), expandedUI: false }

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: saved.themeMode === 'dark' ? true : saved.themeMode === 'light' ? false : true,
  themeMode: saved.themeMode,
  soundEnabled: saved.soundEnabled,
  expandedUI: saved.expandedUI,
  _systemIsDark: true,
  setIsDark: (isDark) => {
    set({ isDark })
    applyTheme(isDark)
  },
  setThemeMode: (mode) => {
    const resolved = mode === 'system' ? get()._systemIsDark : mode === 'dark'
    set({ themeMode: mode, isDark: resolved })
    applyTheme(resolved)
    saveSettings({ themeMode: mode, soundEnabled: get().soundEnabled, expandedUI: get().expandedUI })
  },
  setSoundEnabled: (enabled) => {
    set({ soundEnabled: enabled })
    saveSettings({ themeMode: get().themeMode, soundEnabled: enabled, expandedUI: get().expandedUI })
  },
  setExpandedUI: (expanded) => {
    set({ expandedUI: expanded })
    saveSettings({ themeMode: get().themeMode, soundEnabled: get().soundEnabled, expandedUI: expanded })
  },
  setSystemTheme: (isDark) => {
    set({ _systemIsDark: isDark })
    // Only apply if following system
    if (get().themeMode === 'system') {
      set({ isDark })
      applyTheme(isDark)
    }
  },
}))

// Initialize CSS vars with saved theme
syncTokensToCss(saved.themeMode === 'light' ? lightColors : darkColors)

/** Reactive hook — returns the active color palette */
export function useColors(): ColorPalette {
  const isDark = useThemeStore((s) => s.isDark)
  return isDark ? darkColors : lightColors
}

/** Non-reactive getter — use outside React components */
export function getColors(isDark: boolean): ColorPalette {
  return isDark ? darkColors : lightColors
}

// ─── Backward compatibility ───
// Legacy static export — components being migrated should use useColors() instead
export const colors = darkColors

// ─── Spacing ───

export const spacing = {
  contentWidth: 460,
  containerRadius: 20,
  containerPadding: 12,
  tabHeight: 32,
  inputMinHeight: 44,
  inputMaxHeight: 160,
  conversationMaxHeight: 380,
  pillRadius: 9999,
  circleSize: 36,
  circleGap: 8,
} as const

// ─── Animation ───

export const motion = {
  spring: { type: 'spring' as const, stiffness: 500, damping: 30 },
  easeOut: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const },
  fadeIn: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
    transition: { duration: 0.15 },
  },
} as const
