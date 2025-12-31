import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createProfile, updateProfile, testConnection } from '@/hooks/use-tauri'
import { parseConnectionUrl } from '@/lib/utils'
import { invoke } from '@tauri-apps/api/core'
import type { ConnectionProfile, DatabaseInfo } from '@/types'

export function ConnectionForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditing = Boolean(id)

  const [inputMode, setInputMode] = useState<'url' | 'manual'>('manual')
  const [connectionUrl, setConnectionUrl] = useState('')

  const [name, setName] = useState('')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState(5432)
  const [database, setDatabase] = useState('')
  const [user, setUser] = useState('postgres')
  const [password, setPassword] = useState('')
  const [ssl, setSsl] = useState(false)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<DatabaseInfo | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEditing)

  useEffect(() => {
    if (id) {
      invoke<ConnectionProfile | null>('get_profile', { id }).then((profile) => {
        if (profile) {
          setName(profile.name)
          setHost(profile.host)
          setPort(profile.port)
          setDatabase(profile.database)
          setUser(profile.user)
          setPassword(profile.password)
          setSsl(profile.ssl)
        }
        setLoading(false)
      })
    }
  }, [id])

  const handleUrlChange = (url: string) => {
    setConnectionUrl(url)
    const parsed = parseConnectionUrl(url)
    if (parsed) {
      setHost(parsed.host)
      setPort(parsed.port)
      setDatabase(parsed.database)
      setUser(parsed.user)
      setPassword(parsed.password)
      setSsl(parsed.ssl)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setTestError(null)

    try {
      const result = await testConnection(host, port, database, user, password, ssl)
      setTestResult(result)
    } catch (error) {
      setTestError(error as string)
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      if (isEditing && id) {
        await updateProfile(id, name, host, port, database, user, password, ssl)
      } else {
        await createProfile(name, host, port, database, user, password, ssl)
      }
      navigate('/')
    } catch (error) {
      console.error('Failed to save profile:', error)
    } finally {
      setSaving(false)
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {isEditing ? 'Edit Connection' : 'New Connection'}
          </h1>
          <p className="text-muted-foreground">
            {isEditing
              ? 'Update your database connection settings'
              : 'Create a new database connection profile'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Connection Details</CardTitle>
            <CardDescription>
              Enter the connection details for your PostgreSQL database
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Connection Name</Label>
              <Input
                id="name"
                placeholder="My Database"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'url' | 'manual')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="manual">Manual</TabsTrigger>
                <TabsTrigger value="url">Connection URL</TabsTrigger>
              </TabsList>

              <TabsContent value="url" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="url">Connection URL</Label>
                  <Input
                    id="url"
                    placeholder="postgresql://user:password@host:5432/database"
                    value={connectionUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste your full PostgreSQL connection URL
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="manual" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="host">Host</Label>
                    <Input
                      id="host"
                      placeholder="localhost"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="port">Port</Label>
                    <Input
                      id="port"
                      type="number"
                      placeholder="5432"
                      value={port}
                      onChange={(e) => setPort(parseInt(e.target.value) || 5432)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="database">Database</Label>
                  <Input
                    id="database"
                    placeholder="mydb"
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="user">User</Label>
                    <Input
                      id="user"
                      placeholder="postgres"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="********"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="ssl">SSL Connection</Label>
                    <p className="text-xs text-muted-foreground">
                      Enable SSL/TLS encryption
                    </p>
                  </div>
                  <Switch
                    id="ssl"
                    checked={ssl}
                    onCheckedChange={setSsl}
                  />
                </div>
              </TabsContent>
            </Tabs>

            {testResult && (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-medium text-green-600">Connection successful!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Found {testResult.tables.length} tables. PostgreSQL {testResult.version.split(' ')[1]}
                  </p>
                </div>
              </div>
            )}

            {testError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-600">Connection failed</p>
                  <p className="text-sm text-muted-foreground mt-1">{testError}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={testing || !host || !database || !user}
              >
                {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Test Connection
              </Button>
              <Button type="submit" disabled={saving || !name || !host || !database || !user}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEditing ? 'Update' : 'Save'} Connection
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
