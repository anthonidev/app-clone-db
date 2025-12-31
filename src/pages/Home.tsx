import { Link } from 'react-router-dom'
import { Plus, Database, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConnectionCard } from '@/components/ConnectionCard'
import { useProfiles, checkPgTools } from '@/hooks/use-tauri'
import { useEffect, useState } from 'react'

export function Home() {
  const { profiles, loading, error, refetch } = useProfiles()
  const [pgToolsAvailable, setPgToolsAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    checkPgTools().then(setPgToolsAvailable).catch(() => setPgToolsAvailable(false))
  }, [])

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
        <div>
          <h1 className="text-2xl font-bold">Connections</h1>
          <p className="text-muted-foreground">
            Manage your PostgreSQL database connections
          </p>
        </div>
        <Link to="/connection/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Connection
          </Button>
        </Link>
      </div>

      {pgToolsAvailable === false && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-600">PostgreSQL tools not found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Please install PostgreSQL client tools (psql, pg_dump) to use this application.
              They are required for testing connections and cloning databases.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg">
          <Database className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No connections yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first database connection to get started
          </p>
          <Link to="/connection/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Connection
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <ConnectionCard
              key={profile.id}
              profile={profile}
              onDelete={refetch}
            />
          ))}
        </div>
      )}
    </div>
  )
}
