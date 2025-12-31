import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Database, Edit, Trash2, Loader2, CheckCircle, XCircle, Server } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { testConnectionById, deleteProfile } from '@/hooks/use-tauri'
import type { ConnectionProfile, DatabaseInfo } from '@/types'
import { formatBytes } from '@/lib/utils'

interface ConnectionCardProps {
  profile: ConnectionProfile
  onDelete: () => void
}

export function ConnectionCard({ profile, onDelete }: ConnectionCardProps) {
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
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">{profile.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {profile.database}
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              <Link to={`/connection/${profile.id}/edit`}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Edit className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Server className="h-4 w-4" />
            <span>{profile.host}:{profile.port}</span>
            {profile.ssl && (
              <Badge variant="secondary" className="text-xs">SSL</Badge>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : testResult ? (
                <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
              ) : testError ? (
                <XCircle className="h-4 w-4 mr-2 text-red-500" />
              ) : null}
              Test
            </Button>
            <Link to={`/clone?source=${profile.id}`} className="flex-1">
              <Button size="sm" className="w-full">
                Clone
              </Button>
            </Link>
          </div>

          {testResult && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md text-sm space-y-1">
              <p className="text-green-600 font-medium">Connection successful!</p>
              <p className="text-muted-foreground">
                {testResult.tables.length} tables, {formatBytes(testResult.totalSize)}
              </p>
            </div>
          )}

          {testError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-sm">
              <p className="text-red-600 font-medium">Connection failed</p>
              <p className="text-muted-foreground text-xs mt-1">{testError}</p>
            </div>
          )}
        </CardContent>
      </Card>

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
