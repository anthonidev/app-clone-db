import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  Database,
  Server,
  User,
  Lock,
  Link2,
  ShieldCheck,
  ShieldAlert,
  Tag as TagIcon,
  Plug,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createProfile,
  updateProfile,
  testConnection,
  useTags,
} from "@/hooks/use-tauri";
import { parseConnectionUrl } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { TagSelect } from "@/components/TagSelect";
import { TagModal } from "@/components/TagModal";
import { EditTagModal } from "@/components/EditTagModal";
import type { ConnectionProfile, DatabaseInfo, Tag } from "@/types";

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 pb-4 border-b">
      <div className="p-2 bg-primary/10 rounded-lg">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function ConnectionForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);
  const { tags, refetch: refetchTags } = useTags();

  const [inputMode, setInputMode] = useState<"url" | "manual">("url");
  const [connectionUrl, setConnectionUrl] = useState("");

  const [name, setName] = useState("");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState(5432);
  const [database, setDatabase] = useState("");
  const [user, setUser] = useState("postgres");
  const [password, setPassword] = useState("");
  const [ssl, setSsl] = useState(false);
  const [tagId, setTagId] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<DatabaseInfo | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [editTagModalOpen, setEditTagModalOpen] = useState(false);
  const [tagToEdit, setTagToEdit] = useState<Tag | null>(null);

  useEffect(() => {
    if (id) {
      invoke<ConnectionProfile | null>("get_profile", { id }).then(
        (profile) => {
          if (profile) {
            setName(profile.name);
            setHost(profile.host);
            setPort(profile.port);
            setDatabase(profile.database);
            setUser(profile.user);
            setPassword(profile.password);
            setSsl(profile.ssl);
            setTagId(profile.tagId);
            setReadOnly(profile.readOnly ?? false);
          }
          setLoading(false);
        }
      );
    }
  }, [id]);

  const handleTagCreated = (tag: Tag) => {
    refetchTags();
    setTagId(tag.id);
  };

  const handleEditTag = (tag: Tag) => {
    setTagToEdit(tag);
    setEditTagModalOpen(true);
  };

  const handleTagUpdated = () => {
    refetchTags();
  };

  const handleTagDeleted = (deletedTagId: string) => {
    refetchTags();
    if (tagId === deletedTagId) {
      setTagId(null);
    }
  };

  const handleUrlChange = (url: string) => {
    setConnectionUrl(url);
    const parsed = parseConnectionUrl(url);
    if (parsed) {
      setHost(parsed.host);
      setPort(parsed.port);
      setDatabase(parsed.database);
      setUser(parsed.user);
      setPassword(parsed.password);
      setSsl(parsed.ssl);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const result = await testConnection(
        host,
        port,
        database,
        user,
        password,
        ssl
      );
      setTestResult(result);
    } catch (error) {
      setTestError(error as string);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (isEditing && id) {
        await updateProfile(
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
        );
      } else {
        await createProfile(
          name,
          host,
          port,
          database,
          user,
          password,
          ssl,
          tagId,
          readOnly
        );
      }
      navigate("/");
    } catch (error) {
      console.error("Failed to save profile:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {isEditing ? "Edit Connection" : "New Connection"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEditing
              ? "Update your database connection settings"
              : "Create a new database connection profile"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Profile Section */}
        <div className="rounded-xl border bg-card p-5 space-y-5">
          <SectionHeader
            icon={Database}
            title="Profile"
            description="Name and organize your connection"
          />

          <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <TagIcon className="h-3.5 w-3.5" />
                Tag
              </Label>
              <TagSelect
                tags={tags}
                value={tagId}
                onChange={setTagId}
                onCreateNew={() => setTagModalOpen(true)}
                onEdit={handleEditTag}
              />
            </div>
          </div>
        </div>

        {/* Connection Section */}
        <div className="rounded-xl border bg-card p-5 space-y-5">
          <SectionHeader
            icon={Server}
            title="Connection"
            description="PostgreSQL server details"
          />

          <Tabs
            value={inputMode}
            onValueChange={(v) => setInputMode(v as "url" | "manual")}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="url">
                <Link2 className="h-3.5 w-3.5 mr-1.5" />
                Connection URL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="url" className="mt-4">
              <div className="space-y-2">
                <Label htmlFor="url">Connection URL</Label>
                <Input
                  id="url"
                  placeholder="postgresql://user:password@host:5432/database"
                  value={connectionUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Paste your full PostgreSQL connection URL
                </p>
              </div>
            </TabsContent>

            <TabsContent value="manual" className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="host">Host</Label>
                  <div className="relative">
                    <Server className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="host"
                      placeholder="localhost"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      required
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    placeholder="5432"
                    value={port}
                    onChange={(e) =>
                      setPort(parseInt(e.target.value) || 5432)
                    }
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="database">Database</Label>
                <div className="relative">
                  <Database className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="database"
                    placeholder="mydb"
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    required
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="user">User</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="user"
                      placeholder="postgres"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      required
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="ssl">SSL Connection</Label>
                    <p className="text-xs text-muted-foreground">
                      Enable SSL/TLS encryption
                    </p>
                  </div>
                </div>
                <Switch id="ssl" checked={ssl} onCheckedChange={setSsl} />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Protection Section */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <SectionHeader
            icon={ShieldAlert}
            title="Protection"
            description="Prevent accidental destructive operations on this database"
          />

          <label
            htmlFor="read-only"
            className={`flex items-start justify-between gap-4 rounded-lg border p-4 cursor-pointer transition-colors ${
              readOnly
                ? "border-red-500/40 bg-red-500/5"
                : "hover:bg-muted/30"
            }`}
          >
            <div className="flex items-start gap-3">
              <ShieldAlert
                className={`h-5 w-5 mt-0.5 shrink-0 ${
                  readOnly ? "text-red-600" : "text-muted-foreground"
                }`}
              />
              <div>
                <p className="text-sm font-medium">
                  Protected (read-only destination)
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, this connection cannot be selected as a clone
                  destination. Useful for production databases.
                </p>
              </div>
            </div>
            <Switch
              id="read-only"
              checked={readOnly}
              onCheckedChange={setReadOnly}
            />
          </label>
        </div>

        {/* Test Result */}
        {testResult && (
          <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="font-medium text-green-600 text-sm">Connected</p>
              <p className="text-sm text-muted-foreground">
                {testResult.tables.length} tables &middot; PostgreSQL{" "}
                {testResult.version.split(" ")[1]}
              </p>
            </div>
          </div>
        )}

        {testError && (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <XCircle className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <p className="font-medium text-red-600 text-sm">Connection failed</p>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {testError}
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={testing || !host || !database || !user}
          >
            {testing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plug className="h-4 w-4 mr-2" />
            )}
            Test Connection
          </Button>
          <Button
            type="submit"
            disabled={saving || !name || !host || !database || !user}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {isEditing ? "Update" : "Save"} Connection
          </Button>
        </div>
      </form>

      <TagModal
        open={tagModalOpen}
        onOpenChange={setTagModalOpen}
        onTagCreated={handleTagCreated}
      />

      <EditTagModal
        open={editTagModalOpen}
        onOpenChange={setEditTagModalOpen}
        tag={tagToEdit}
        onTagUpdated={handleTagUpdated}
        onTagDeleted={handleTagDeleted}
      />
    </div>
  );
}
