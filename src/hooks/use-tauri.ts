import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { useEffect, useState, useCallback } from 'react'
import type {
  ConnectionProfile,
  DatabaseInfo,
  DatabaseStructure,
  CloneOptions,
  CloneProgress,
  CloneHistoryEntry,
  Tag,
  SavedOperation,
  CloneType,
  SchemaProgress,
  SchemaExportOptions
} from '@/types'

// Profile hooks
export function useProfiles() {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  const fetchProfiles = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      const result = await invoke<ConnectionProfile[]>('get_profiles')
      setProfiles(result)
      setError(null)
    } catch (e) {
      setError(e as string)
    } finally {
      if (isInitial) {
        setLoading(false)
        setInitialized(true)
      }
    }
  }, [])

  useEffect(() => {
    if (!initialized) {
      fetchProfiles(true)
    }
  }, [fetchProfiles, initialized])

  const refetch = useCallback(() => fetchProfiles(false), [fetchProfiles])

  return { profiles, loading, error, refetch }
}

export async function createProfile(
  name: string,
  host: string,
  port: number,
  database: string,
  user: string,
  password: string,
  ssl: boolean,
  tagId: string | null = null,
  readOnly = false
): Promise<ConnectionProfile> {
  return invoke<ConnectionProfile>('create_profile', {
    name,
    host,
    port,
    database,
    user,
    password,
    ssl,
    tagId,
    readOnly
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
  ssl: boolean,
  tagId: string | null = null,
  readOnly = false
): Promise<ConnectionProfile> {
  return invoke<ConnectionProfile>('update_profile', {
    id,
    name,
    host,
    port,
    database,
    user,
    password,
    ssl,
    tagId,
    readOnly
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
    // Guard contra el double-mount de StrictMode en React 19:
    // si el effect se desmonta antes de que terminen los `await listen(...)`,
    // marcamos `cancelled` y al resolver desuscribimos inmediatamente.
    // Sin esto, terminamos con 2 listeners activos y cada evento se procesa dos veces.
    let cancelled = false
    const unlisteners: UnlistenFn[] = []

    const setup = async () => {
      const off1 = await listen<CloneProgress>('clone-progress', (event) => {
        setProgress(event.payload)
      })
      if (cancelled) {
        off1()
        return
      }
      unlisteners.push(off1)

      const off2 = await listen<string>('clone-log', (event) => {
        setLogs((prev) => [...prev, event.payload])
      })
      if (cancelled) {
        off2()
        return
      }
      unlisteners.push(off2)
    }

    setup()

    return () => {
      cancelled = true
      for (const off of unlisteners) off()
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
  const [initialized, setInitialized] = useState(false)

  const fetchHistory = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      const result = await invoke<CloneHistoryEntry[]>('get_history')
      setHistory(result)
      setError(null)
    } catch (e) {
      setError(e as string)
    } finally {
      if (isInitial) {
        setLoading(false)
        setInitialized(true)
      }
    }
  }, [])

  useEffect(() => {
    if (!initialized) {
      fetchHistory(true)
    }
  }, [fetchHistory, initialized])

  const refetch = useCallback(() => fetchHistory(false), [fetchHistory])

  return { history, loading, error, refetch }
}

export async function getHistoryEntry(id: string): Promise<CloneHistoryEntry | null> {
  return invoke<CloneHistoryEntry | null>('get_history_entry', { id })
}

export async function clearHistory(): Promise<void> {
  return invoke<void>('clear_history')
}

// Tag hooks
export function useTags() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  const fetchTags = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      const result = await invoke<Tag[]>('get_tags')
      setTags(result)
      setError(null)
    } catch (e) {
      setError(e as string)
    } finally {
      if (isInitial) {
        setLoading(false)
        setInitialized(true)
      }
    }
  }, [])

  useEffect(() => {
    if (!initialized) {
      fetchTags(true)
    }
  }, [fetchTags, initialized])

  const refetch = useCallback(() => fetchTags(false), [fetchTags])

  return { tags, loading, error, refetch }
}

export async function createTag(name: string, color: string): Promise<Tag> {
  return invoke<Tag>('create_tag', { name, color })
}

export async function updateTag(id: string, name: string, color: string): Promise<Tag> {
  return invoke<Tag>('update_tag', { id, name, color })
}

export async function deleteTag(id: string): Promise<void> {
  return invoke<void>('delete_tag', { id })
}

// Saved Operations hooks
export function useSavedOperations() {
  const [savedOperations, setSavedOperations] = useState<SavedOperation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  const fetchSavedOperations = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      const result = await invoke<SavedOperation[]>('get_saved_operations')
      setSavedOperations(result)
      setError(null)
    } catch (e) {
      setError(e as string)
    } finally {
      if (isInitial) {
        setLoading(false)
        setInitialized(true)
      }
    }
  }, [])

  useEffect(() => {
    if (!initialized) {
      fetchSavedOperations(true)
    }
  }, [fetchSavedOperations, initialized])

  const refetch = useCallback(() => fetchSavedOperations(false), [fetchSavedOperations])

  return { savedOperations, loading, error, refetch }
}

export async function createSavedOperation(
  name: string,
  sourceId: string,
  destinationId: string,
  cleanDestination: boolean,
  createBackup: boolean,
  cloneType: CloneType
): Promise<SavedOperation> {
  return invoke<SavedOperation>('create_saved_operation', {
    name,
    sourceId,
    destinationId,
    cleanDestination,
    createBackup,
    cloneType
  })
}

export async function deleteSavedOperation(id: string): Promise<void> {
  return invoke<void>('delete_saved_operation', { id })
}

// Schema download hooks
export async function downloadSchema(options: SchemaExportOptions): Promise<string> {
  return invoke<string>('download_schema', { options })
}

export async function getDatabaseStructure(profileId: string): Promise<DatabaseStructure> {
  return invoke<DatabaseStructure>('get_database_structure', { profileId })
}

export function useSchemaProgress() {
  const [progress, setProgress] = useState<SchemaProgress | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    let unlistenProgress: UnlistenFn | undefined
    let unlistenLog: UnlistenFn | undefined

    const setup = async () => {
      unlistenProgress = await listen<SchemaProgress>('schema-progress', (event) => {
        setProgress(event.payload)
      })

      unlistenLog = await listen<string>('schema-log', (event) => {
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

// Export / Import config

export interface ImportPreview {
  newProfiles: string[]
  replacedProfiles: string[]
  newTags: string[]
  replacedTags: string[]
  totalProfiles: number
  totalTags: number
}

export async function exportConfig(): Promise<string> {
  return invoke<string>('export_config')
}

export async function previewImportConfig(json: string): Promise<ImportPreview> {
  return invoke<ImportPreview>('preview_import_config', { json })
}

export async function importConfig(json: string): Promise<ImportPreview> {
  return invoke<ImportPreview>('import_config', { json })
}
