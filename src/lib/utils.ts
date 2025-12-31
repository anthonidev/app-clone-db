import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseConnectionUrl(url: string): {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
} | null {
  try {
    const regex = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)(\?.*)?$/
    const match = url.match(regex)

    if (!match) return null

    const [, user, password, host, port, database] = match
    const ssl = url.includes('sslmode=require')

    return {
      host,
      port: parseInt(port, 10),
      database,
      user,
      password,
      ssl
    }
  } catch {
    return null
  }
}

export function buildConnectionUrl(connection: {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
}): string {
  const { host, port, database, user, password, ssl } = connection
  const sslParam = ssl ? '?sslmode=require' : ''
  return `postgresql://${user}:${password}@${host}:${port}/${database}${sslParam}`
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatDate(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
