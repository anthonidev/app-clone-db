import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Database, Edit, Trash2, Loader2, CheckCircle, XCircle, Server, Copy, Lock, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { testConnectionById, deleteProfile } from '@/hooks/use-tauri'
import type { ConnectionProfile, DatabaseInfo, Tag } from '@/types'
import { formatBytes } from '@/lib/utils'

interface ConnectionCardProps {
  profile: ConnectionProfile
  tag?: Tag
  onDelete: () => void
}

export function ConnectionCard({ profile, tag, onDelete }: ConnectionCardProps) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<DatabaseInfo | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setTestError(null)

    try {
      const result = await testConnectionById(profile.id)
      setTestResult(result)
    } catch (error) {
      setTestError(error as string)
    } finally {
      setTesting(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteProfile(profile.id)
      setShowDeleteDialog(false)
      onDelete()
    } catch (error) {
      console.error('Failed to delete profile:', error)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="group relative rounded-xl border bg-card text-card-foreground overflow-hidden transition-all hover:shadow-lg hover:border-primary/20">
        {/* Tag accent bar with label */}
        {tag && (
          <div className="flex items-center gap-2 px-3 py-1 bg-muted/60">
            <div
              className="shrink-0 w-2 h-2 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
            <span className="text-[10px] font-medium text-muted-foreground truncate">
              {tag.name}
            </span>
          </div>
        )}

        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 p-2 bg-primary/10 rounded-lg">
                <Database className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate">{profile.name}</h3>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {profile.database}
                </p>
              </div>
            </div>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Link to={`/connection/${profile.id}/edit`}>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Connection info */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <div className="flex items-center gap-1.5">
              <Server className="h-3 w-3" />
              <span>{profile.host}:{profile.port}</span>
            </div>
            {profile.ssl && (
              <div className="flex items-center gap-1 text-green-600">
                <Lock className="h-3 w-3" />
                <span>SSL</span>
              </div>
            )}
            {profile.readOnly && (
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 font-medium"
                title="Protected — cannot be used as clone destination"
              >
                <ShieldAlert className="h-3 w-3" />
                <span>Protected</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : testResult ? (
                <CheckCircle className="h-3.5 w-3.5 mr-1.5 text-green-500" />
              ) : testError ? (
                <XCircle className="h-3.5 w-3.5 mr-1.5 text-red-500" />
              ) : null}
              Test
            </Button>
            <Link to={`/clone?source=${profile.id}`} className="flex-1">
              <Button size="sm" className="w-full h-8 text-xs">
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Clone
              </Button>
            </Link>
          </div>

          {/* Test result */}
          {testResult && (
            <div className="p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg text-xs space-y-0.5">
              <p className="text-green-600 font-medium">Connected</p>
              <p className="text-muted-foreground">
                {testResult.tables.length} tables &middot; {formatBytes(testResult.totalSize)}
              </p>
            </div>
          )}

          {testError && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs">
              <p className="text-red-600 font-medium">Connection failed</p>
              <p className="text-muted-foreground mt-0.5 line-clamp-2">{testError}</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Connection</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{profile.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
