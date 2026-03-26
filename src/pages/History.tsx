import { useState } from 'react'
import { ArrowLeft, Trash2, Loader2, CheckCircle, XCircle, Clock, ArrowRight, Database, Timer, Layers, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useHistory, clearHistory } from '@/hooks/use-tauri'
import { formatDate, cn } from '@/lib/utils'
import type { CloneHistoryEntry } from '@/types'

function CloneTypeLabel({ type }: { type: CloneHistoryEntry['cloneType'] }) {
  const config = {
    both: { label: 'Full Clone', class: 'bg-primary/10 text-primary' },
    structure: { label: 'Schema Only', class: 'bg-blue-500/10 text-blue-600' },
    data: { label: 'Data Only', class: 'bg-amber-500/10 text-amber-600' },
  }
  const c = config[type]
  return (
    <span className={cn('px-2 py-0.5 rounded-md text-xs font-medium', c.class)}>
      {c.label}
    </span>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export function History() {
  const navigate = useNavigate()
  const { history, loading, refetch } = useHistory()
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<CloneHistoryEntry | null>(null)

  const handleClear = async () => {
    setClearing(true)
    try {
      await clearHistory()
      setShowClearDialog(false)
      refetch()
    } catch (error) {
      console.error('Failed to clear history:', error)
    } finally {
      setClearing(false)
    }
  }

  const stats = {
    total: history.length,
    success: history.filter(h => h.status === 'success').length,
    failed: history.filter(h => h.status === 'error').length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Clone History</h1>
            <p className="text-sm text-muted-foreground">
              View past database clone operations
            </p>
          </div>
        </div>
        {history.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowClearDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
        )}
      </div>

      {/* Stats */}
      {history.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Layers className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <CheckCircle className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.success}</p>
              <p className="text-xs text-muted-foreground">Successful</p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <XCircle className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>
        </div>
      )}

      {/* History List */}
      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-xl">
          <Clock className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No history yet</h3>
          <p className="text-sm text-muted-foreground">
            Clone operations will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((entry) => (
            <button
              key={entry.id}
              className="w-full text-left rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/20 cursor-pointer"
              onClick={() => setSelectedEntry(entry)}
            >
              <div className="flex items-center gap-4">
                {/* Status icon */}
                <div className={cn(
                  'shrink-0 p-2 rounded-lg',
                  entry.status === 'success' ? 'bg-green-500/10' : 'bg-red-500/10'
                )}>
                  {entry.status === 'success' ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{entry.sourceName}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{entry.destinationName}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(entry.startedAt)}
                    </span>
                    {entry.duration != null && (
                      <span className="flex items-center gap-1">
                        <Timer className="h-3 w-3" />
                        {formatDuration(entry.duration)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side */}
                <div className="shrink-0">
                  <CloneTypeLabel type={entry.cloneType} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Entry detail dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Clone Details
              {selectedEntry && (
                <Badge
                  variant={selectedEntry.status === 'success' ? 'success' : 'destructive'}
                  className="ml-2"
                >
                  {selectedEntry.status}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 pt-1">
              <Database className="h-3.5 w-3.5" />
              {selectedEntry?.sourceName}
              <ArrowRight className="h-3.5 w-3.5" />
              {selectedEntry?.destinationName}
            </DialogDescription>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Clone Type</p>
                  <p className="text-sm font-medium capitalize">{selectedEntry.cloneType === 'both' ? 'Full Clone' : selectedEntry.cloneType}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Started</p>
                  <p className="text-sm font-medium">{formatDate(selectedEntry.startedAt)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Duration</p>
                  <p className="text-sm font-medium">
                    {selectedEntry.duration != null ? formatDuration(selectedEntry.duration) : 'N/A'}
                  </p>
                </div>
              </div>

              {selectedEntry.errorMessage && (
                <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-600">Error</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {selectedEntry.errorMessage}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-medium mb-2">Logs</p>
                <ScrollArea className="h-64 w-full rounded-lg border bg-muted/30">
                  <div className="p-4 font-mono text-xs leading-relaxed log-viewer">
                    {selectedEntry.logs.length === 0 ? (
                      <p className="text-muted-foreground">No logs available</p>
                    ) : (
                      selectedEntry.logs.map((log, i) => (
                        <div
                          key={i}
                          className={cn(
                            'py-0.5',
                            log.includes('[ERROR]') && 'log-error',
                            log.includes('[WARNING]') && 'log-warning',
                            log.includes('[SUCCESS]') && 'log-success',
                            log.includes('[INFO]') && 'log-info'
                          )}
                        >
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Clear confirmation dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear History</DialogTitle>
            <DialogDescription>
              Are you sure you want to clear all clone history? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowClearDialog(false)}
              disabled={clearing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClear}
              disabled={clearing}
            >
              {clearing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Clear All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
