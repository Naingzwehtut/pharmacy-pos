import { createContext, useCallback, useContext, useEffect, useState } from 'react'

/*
 * Light / dark / system theme. The choice is kept per device.
 * index.html applies it before React starts, so there is no white flash.
 */
const KEY = 'ui_theme'
const ThemeContext = createContext({ mode: 'system', theme: 'light', setMode: () => {} })

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readMode() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readMode)
  const [system, setSystem] = useState(systemTheme)
  const theme = mode === 'system' ? system : mode

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return undefined
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141615' : '#164f31')
  }, [theme])

  const setMode = useCallback((value) => {
    setModeState(value)
    try {
      if (value === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, value)
    } catch {
      /* private mode */
    }
  }, [])

  return <ThemeContext.Provider value={{ mode, theme, setMode }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
