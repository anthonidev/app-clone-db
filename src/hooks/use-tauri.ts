import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { useEffect, useState, useCallback } from 'react'
import type {
  ConnectionProfile,
  DatabaseInfo,
  CloneOptions,
  CloneProgress,
  CloneHistoryEntry
} from '@/types'

// Profile hooks
export function useProfiles() {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProfiles = useCallback(async () => {
    try {
      setLoading(true)
      const result = await invoke<ConnectionProfile[]>('get_profiles')
      setProfiles(result)
      setError(null)
    } catch (e) {
      setError(e as string)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  return { profiles, loading, error, refetch: fetchProfiles }
}

export async function createProfile(
  name: string,
  host: string,
  port: number,
  database: string,
  user: string,
  password: string,
  ssl: boolean
): Promise<ConnectionProfile> {
  return invoke<ConnectionProfile>('create_profile', {
    name,
    host,
    port,
    database,
    user,
    password,
    ssl
  })
}

export async function updateProfile(
  id: string,
  name: string,
  host: string,
  port: number,
  database: string,
  user: string,
  password: string,
  ssl: boolean
): Promise<ConnectionProfile> {
  return invoke<ConnectionProfile>('update_profile', {
    id,
    name,
    host,
    port,
    database,
    user,
    password,
    ssl
  })
}

export async function deleteProfile(id: string): Promise<void> {
  return invoke<void>('delete_profile', { id })
}

// Connection hooks
export async function testConnection(
  host: string,
  port: number,
  database: string,
  user: string,
  password: string,
  ssl: boolean
): Promise<DatabaseInfo> {
  return invoke<DatabaseInfo>('test_connection', {
    host,
    port,
    database,
    user,
    password,
    ssl
  })
}

export async function testConnectionById(id: string): Promise<DatabaseInfo> {
  return invoke<DatabaseInfo>('test_connection_by_id', { id })
}

export async function checkPgTools(): Promise<boolean> {
  return invoke<boolean>('check_pg_tools')
}

// Clone hooks
export async function startClone(options: CloneOptions): Promise<string> {
  return invoke<string>('start_clone', { options })
}

export function useCloneProgress() {
  const [progress, setProgress] = useState<CloneProgress | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    let unlistenProgress: UnlistenFn | undefined
    let unlistenLog: UnlistenFn | undefined

    const setup = async () => {
      unlistenProgress = await listen<CloneProgress>('clone-progress', (event) => {
        setProgress(event.payload)
      })

      unlistenLog = await listen<string>('clone-log', (event) => {
        setLogs((prev) => [...prev, event.payload])
      })
    }

    setup()

    return () => {
      unlistenProgress?.()
      unlistenLog?.()
    }
  }, [])

  const reset = useCallback(() => {
    setProgress(null)
    setLogs([])
  }, [])

  return { progress, logs, reset }
}

// History hooks
export function useHistory() {
  const [history, setHistory] = useState<CloneHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      const result = await invoke<CloneHistoryEntry[]>('get_history')
      setHistory(result)
      setError(null)
    } catch (e) {
      setError(e as string)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return { history, loading, error, refetch: fetchHistory }
}

export async function getHistoryEntry(id: string): Promise<CloneHistoryEntry | null> {
  return invoke<CloneHistoryEntry | null>('get_history_entry', { id })
}

export async function clearHistory(): Promise<void> {
  return invoke<void>('clear_history')
}
