import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface PgToolsContextValue {
  available: boolean | null
  checking: boolean
  recheck: () => Promise<void>
}

const PgToolsContext = createContext<PgToolsContextValue | null>(null)

export function PgToolsProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(true)

  const checkTools = async () => {
    setChecking(true)
    try {
      const result = await invoke<boolean>('check_pg_tools')
      setAvailable(result)
    } catch {
      setAvailable(false)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    checkTools()
  }, [])

  return (
    <PgToolsContext.Provider value={{ available, checking, recheck: checkTools }}>
      {children}
    </PgToolsContext.Provider>
  )
}

export function usePgTools() {
  const context = useContext(PgToolsContext)
  if (!context) {
    throw new Error('usePgTools must be used within PgToolsProvider')
  }
  return context
}
