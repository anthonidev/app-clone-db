import { useState } from 'react'
import { ArrowLeft, Trash2, Loader2, CheckCircle, XCircle, Clock, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Clone History</h1>
            <p className="text-muted-foreground">
              View past database clone operations
            </p>
          </div>
        </div>
        {history.length > 0 && (
          <Button
            variant="outline"
            onClick={() => setShowClearDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear History
          </Button>
        )}
      </div>

      {history.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64">
            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No history yet</h3>
            <p className="text-muted-foreground">
              Clone operations will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {history.map((entry) => (
            <Card
              key={entry.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedEntry(entry)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {entry.status === 'success' ? (
                      <div className="p-2 bg-green-500/10 rounded-full">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      </div>
                    ) : (
                      <div className="p-2 bg-red-500/10 rounded-full">
                        <XCircle className="h-5 w-5 text-red-600" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{entry.sourceName}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{entry.destinationName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{formatDate(entry.startedAt)}</span>
                        {entry.duration && (
                          <>
                            <span>•</span>
                            <span>{entry.duration}s</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        entry.cloneType === 'both'
                          ? 'default'
                          : entry.cloneType === 'structure'
                          ? 'secondary'
                          : 'outline'
                      }
                    >
                      {entry.cloneType === 'both'
                        ? 'Full'
                        : entry.cloneType === 'structure'
                        ? 'Schema'
                        : 'Data'}
                    </Badge>
                    <Badge
                      variant={entry.status === 'success' ? 'success' : 'destructive'}
                    >
                      {entry.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Entry detail dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Clone Details</DialogTitle>
            <DialogDescription>
              {selectedEntry?.sourceName} → {selectedEntry?.destinationName}
            </DialogDescription>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge
                    variant={selectedEntry.status === 'success' ? 'success' : 'destructive'}
                  >
                    {selectedEntry.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Clone Type</p>
                  <p className="font-medium capitalize">{selectedEntry.cloneType}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Started</p>
                  <p className="font-medium">{formatDate(selectedEntry.startedAt)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="font-medium">
                    {selectedEntry.duration ? `${selectedEntry.duration} seconds` : 'N/A'}
                  </p>
                </div>
              </div>

              {selectedEntry.errorMessage && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm font-medium text-red-600">Error Message</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedEntry.errorMessage}
                  </p>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground mb-2">Logs</p>
                <ScrollArea className="h-64 w-full rounded-md border bg-muted/50">
                  <div className="p-4 log-viewer">
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
