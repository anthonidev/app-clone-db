export interface Tag {
  id: string
  name: string
  color: string // Formato hex: #RRGGBB
}

export interface ConnectionProfile {
  id: string
  name: string
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
  tagId: string | null
  createdAt: string
  updatedAt: string
}

export interface DatabaseInfo {
  tables: TableInfo[]
  totalSize: number
  version: string
}

export interface TableInfo {
  name: string
  schema: string
  rowCount: number
  size: number
}

export interface CloneOptions {
  sourceId: string
  destinationId: string
  cleanDestination: boolean
  createBackup: boolean
  cloneType: 'structure' | 'data' | 'both'
  excludeTables: string[]
}

export interface CloneProgress {
  stage: string
  progress: number
  message: string
  isComplete: boolean
  isError: boolean
}

export interface CloneHistoryEntry {
  id: string
  sourceId: string
  sourceName: string
  destinationId: string
  destinationName: string
  cloneType: 'structure' | 'data' | 'both'
  status: 'success' | 'error' | 'cancelled'
  startedAt: string
  completedAt: string | null
  duration: number | null
  errorMessage: string | null
  logs: string[]
}

export type CloneStage =
  | 'preparing'
  | 'backup'
  | 'cleaning'
  | 'dumping'
  | 'restoring'
  | 'verifying'
  | 'completed'
  | 'error'

export type CloneType = 'structure' | 'data' | 'both'

export interface SavedOperation {
  id: string
  name: string
  sourceId: string
  destinationId: string
  cleanDestination: boolean
  createBackup: boolean
  cloneType: CloneType
  createdAt: string
}
