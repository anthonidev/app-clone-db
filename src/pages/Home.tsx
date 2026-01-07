import { Link } from 'react-router-dom'
import { Plus, Database, AlertCircle, Loader2, Tag as TagIcon, X, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConnectionCard } from '@/components/ConnectionCard'
import { useProfiles, useTags } from '@/hooks/use-tauri'
import { usePgTools } from '@/context/PgToolsContext'
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'

export function Home() {
  const { profiles, loading, error, refetch } = useProfiles()
  const { tags } = useTags()
  const { available: pgToolsAvailable } = usePgTools()
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)

  const filteredProfiles = useMemo(() => {
    if (!selectedTagId) return profiles
    return profiles.filter((profile) => profile.tagId === selectedTagId)
  }, [profiles, selectedTagId])

  const getTagForProfile = (tagId: string | null) => {
    if (!tagId) return undefined
    return tags.find((t) => t.id === tagId)
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

      {/* Tag Filter */}
      {tags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>Filter:</span>
          </div>
          <button
            onClick={() => setSelectedTagId(null)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              selectedTagId === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80"
            )}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => setSelectedTagId(tag.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                selectedTagId === tag.id
                  ? "ring-2 ring-offset-2 ring-offset-background"
                  : "opacity-70 hover:opacity-100"
              )}
              style={{
                backgroundColor: tag.color,
                color: 'white',
                ...(selectedTagId === tag.id && { ringColor: tag.color })
              }}
            >
              {tag.name}
              {selectedTagId === tag.id && (
                <X className="h-3 w-3 ml-1" onClick={(e) => {
                  e.stopPropagation()
                  setSelectedTagId(null)
                }} />
              )}
            </button>
          ))}
        </div>
      )}

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
      ) : filteredProfiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg">
          <TagIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No connections with this tag</h3>
          <p className="text-muted-foreground mb-4">
            Try selecting a different tag or clear the filter
          </p>
          <Button variant="outline" onClick={() => setSelectedTagId(null)}>
            <X className="h-4 w-4 mr-2" />
            Clear Filter
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProfiles.map((profile) => (
            <ConnectionCard
              key={profile.id}
              profile={profile}
              tag={getTagForProfile(profile.tagId)}
              onDelete={refetch}
            />
          ))}
        </div>
      )}
    </div>
  )
}
