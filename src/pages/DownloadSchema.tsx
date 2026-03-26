import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Database,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Download,
  FileCode,
  RotateCcw,
  Settings2,
  ChevronDown,
  ChevronUp,
  Table,
  Layers,
  Server,
} from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useProfiles,
  useTags,
  useSchemaProgress,
  downloadSchema,
  getDatabaseStructure,
} from "@/hooks/use-tauri";
import { DatabaseSelectorModal } from "@/components/DatabaseSelectorModal";
import { useNotification } from "@/hooks/use-notification";
import { cn, formatBytes } from "@/lib/utils";
import type { SchemaExportOptions, DatabaseStructure, TableInfo } from "@/types";

const DEFAULT_OPTIONS: Omit<SchemaExportOptions, "profileId"> = {
  schemas: [],
  tables: [],
  includeComments: true,
  includeIndexes: true,
  includeConstraints: true,
  includeTriggers: true,
  includeSequences: true,
  includeTypes: true,
  includeFunctions: true,
  includeViews: true,
};

export function DownloadSchema() {
  const navigate = useNavigate();
  const { profiles, loading: profilesLoading } = useProfiles();
  const { tags } = useTags();
  const { progress, logs, reset } = useSchemaProgress();
  const { notifySuccess, notifyError } = useNotification();
  const logsEndRef = useRef<HTMLDivElement>(null);
  const notifiedRef = useRef(false);

  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectorModalOpen, setSelectorModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [schemaContent, setSchemaContent] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [dbStructure, setDbStructure] = useState<DatabaseStructure | null>(null);
  const [loadingStructure, setLoadingStructure] = useState(false);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  useEffect(() => {
    if (progress?.isComplete && !notifiedRef.current) {
      notifiedRef.current = true;
      if (progress.isError) {
        notifyError("Schema Download Failed", progress.message);
      } else {
        notifySuccess(
          "Schema Downloaded",
          `Schema from ${selectedProfile?.name || "database"} is ready to save`
        );
      }
    }
    if (!progress) {
      notifiedRef.current = false;
    }
  }, [progress, selectedProfile?.name, notifySuccess, notifyError]);

  useEffect(() => {
    if (selectedProfileId && showAdvanced && !dbStructure) {
      loadDatabaseStructure();
    }
  }, [selectedProfileId, showAdvanced]);

  const loadDatabaseStructure = async () => {
    if (!selectedProfileId) return;
    setLoadingStructure(true);
    try {
      const structure = await getDatabaseStructure(selectedProfileId);
      setDbStructure(structure);
    } catch (error) {
      console.error("Failed to load database structure:", error);
    } finally {
      setLoadingStructure(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedProfileId) return;

    reset();
    setSchemaContent(null);
    setSaved(false);
    setDownloading(true);

    const exportOptions: SchemaExportOptions = {
      profileId: selectedProfileId,
      ...options,
    };

    try {
      const content = await downloadSchema(exportOptions);
      setSchemaContent(content);
    } catch (error) {
      console.error("Schema download failed:", error);
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveFile = async () => {
    if (!schemaContent || !selectedProfile) return;

    try {
      const defaultFileName = `${selectedProfile.database}_schema.sql`;
      const filePath = await save({
        defaultPath: defaultFileName,
        filters: [
          { name: "SQL Files", extensions: ["sql"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      if (filePath) {
        await writeTextFile(filePath, schemaContent);
        setSaved(true);
      }
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  };

  const handleReset = () => {
    reset();
    setSelectedProfileId("");
    setSchemaContent(null);
    setSaved(false);
    setDownloading(false);
    setDbStructure(null);
    setOptions(DEFAULT_OPTIONS);
    setShowAdvanced(false);
  };

  const handleProfileSelect = (id: string) => {
    setSelectedProfileId(id);
    setDbStructure(null);
    setOptions(DEFAULT_OPTIONS);
  };

  const toggleSchema = (schemaName: string) => {
    setOptions((prev) => {
      const schemas = prev.schemas.includes(schemaName)
        ? prev.schemas.filter((s) => s !== schemaName)
        : [...prev.schemas, schemaName];
      return { ...prev, schemas };
    });
  };

  const toggleTable = (tableName: string) => {
    setOptions((prev) => {
      const tables = prev.tables.includes(tableName)
        ? prev.tables.filter((t) => t !== tableName)
        : [...prev.tables, tableName];
      return { ...prev, tables };
    });
  };

  const toggleAllSchemas = () => {
    if (!dbStructure) return;
    setOptions((prev) => {
      const allSelected = prev.schemas.length === dbStructure.schemas.length;
      return {
        ...prev,
        schemas: allSelected ? [] : dbStructure.schemas.map((s) => s.name),
      };
    });
  };

  const toggleAllTables = () => {
    if (!dbStructure) return;
    setOptions((prev) => {
      const allSelected = prev.tables.length === dbStructure.tables.length;
      return {
        ...prev,
        tables: allSelected
          ? []
          : dbStructure.tables.map((t) => `${t.schema}.${t.name}`),
      };
    });
  };

  const getTagForProfile = (tagId: string | null) => {
    if (!tagId) return undefined;
    return tags.find((t) => t.id === tagId);
  };

  const tablesBySchema = dbStructure?.tables.reduce<Record<string, TableInfo[]>>(
    (acc, table) => {
      if (!acc[table.schema]) {
        acc[table.schema] = [];
      }
      acc[table.schema].push(table);
      return acc;
    },
    {}
  );

  if (profilesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isComplete = progress?.isComplete && !progress?.isError;
  const hasError = progress?.isError;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Download Schema</h1>
          <p className="text-sm text-muted-foreground">
            Export database schema as SQL file
          </p>
        </div>
      </div>

      {/* Database Selection */}
      <button
        type="button"
        className={cn(
          "w-full text-left rounded-xl border-2 p-5 transition-all hover:shadow-md",
          selectedProfile
            ? "border-blue-500/30 bg-card"
            : "border-dashed border-muted-foreground/25 hover:border-muted-foreground/40",
          (downloading || schemaContent) && "pointer-events-none opacity-60"
        )}
        onClick={() =>
          !downloading && !schemaContent && setSelectorModalOpen(true)
        }
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 bg-blue-500/10 rounded-lg">
            <Database className="h-4 w-4 text-blue-500" />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Database
          </span>
        </div>

        {selectedProfile ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-base">
                {selectedProfile.name}
              </span>
              {selectedProfile.tagId && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                  style={{
                    backgroundColor: getTagForProfile(selectedProfile.tagId)?.color,
                  }}
                >
                  {getTagForProfile(selectedProfile.tagId)?.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Server className="h-3 w-3" />
              <span>
                {selectedProfile.host}:{selectedProfile.port}/{selectedProfile.database}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <Database className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Click to select database</p>
          </div>
        )}
      </button>

      {/* Advanced Options */}
      {selectedProfile && !downloading && !schemaContent && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Settings2 className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold">Advanced Options</h3>
                <p className="text-xs text-muted-foreground">
                  Filter schemas, tables and export settings
                </p>
              </div>
            </div>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showAdvanced && (
            <div className="px-5 pb-5 space-y-5 border-t pt-5">
              {loadingStructure ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    Loading database structure...
                  </span>
                </div>
              ) : (
                <>
                  {/* Schema Selection */}
                  {dbStructure && dbStructure.schemas.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-1.5 text-sm">
                          <Layers className="h-3.5 w-3.5" />
                          Schemas
                          <span className="text-xs text-muted-foreground font-normal">
                            (empty = all)
                          </span>
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={toggleAllSchemas}
                        >
                          {options.schemas.length === dbStructure.schemas.length
                            ? "Deselect All"
                            : "Select All"}
                        </Button>
                      </div>
                      <ScrollArea className="h-32 rounded-lg border p-3">
                        <div className="space-y-2">
                          {dbStructure.schemas.map((schema) => (
                            <label
                              key={schema.name}
                              htmlFor={`schema-${schema.name}`}
                              className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded p-1 -m-1 transition-colors"
                            >
                              <Checkbox
                                id={`schema-${schema.name}`}
                                checked={options.schemas.includes(schema.name)}
                                onCheckedChange={() => toggleSchema(schema.name)}
                              />
                              <span className="text-sm">
                                {schema.name}
                                <span className="text-xs text-muted-foreground ml-1.5">
                                  ({schema.tableCount} tables)
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Table Selection */}
                  {dbStructure && dbStructure.tables.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-1.5 text-sm">
                          <Table className="h-3.5 w-3.5" />
                          Tables
                          <span className="text-xs text-muted-foreground font-normal">
                            (empty = all)
                          </span>
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={toggleAllTables}
                        >
                          {options.tables.length === dbStructure.tables.length
                            ? "Deselect All"
                            : "Select All"}
                        </Button>
                      </div>
                      <ScrollArea className="h-48 rounded-lg border p-3">
                        <div className="space-y-4">
                          {tablesBySchema &&
                            Object.entries(tablesBySchema).map(
                              ([schemaName, tables]) => (
                                <div key={schemaName}>
                                  <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                                    {schemaName}
                                  </p>
                                  <div className="space-y-1 ml-1">
                                    {tables.map((table) => {
                                      const fullName = `${table.schema}.${table.name}`;
                                      return (
                                        <label
                                          key={fullName}
                                          htmlFor={`table-${fullName}`}
                                          className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded p-1 -m-1 transition-colors"
                                        >
                                          <Checkbox
                                            id={`table-${fullName}`}
                                            checked={options.tables.includes(fullName)}
                                            onCheckedChange={() => toggleTable(fullName)}
                                          />
                                          <span className="text-sm">
                                            {table.name}
                                            <span className="text-xs text-muted-foreground ml-1.5">
                                              ({table.rowCount} rows, {formatBytes(table.size)})
                                            </span>
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )
                            )}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Include Options */}
                  <div className="space-y-2">
                    <Label className="text-sm">Include in Export</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: "includeComments", label: "Comments" },
                        { key: "includeIndexes", label: "Indexes" },
                        { key: "includeConstraints", label: "Constraints" },
                        { key: "includeTriggers", label: "Triggers" },
                        { key: "includeSequences", label: "Sequences" },
                        { key: "includeTypes", label: "Custom Types" },
                        { key: "includeFunctions", label: "Functions" },
                        { key: "includeViews", label: "Views" },
                      ].map(({ key, label }) => (
                        <div
                          key={key}
                          className="flex items-center justify-between p-2.5 rounded-lg border"
                        >
                          <Label
                            htmlFor={key}
                            className="text-xs font-medium cursor-pointer"
                          >
                            {label}
                          </Label>
                          <Switch
                            id={key}
                            checked={
                              options[key as keyof typeof options] as boolean
                            }
                            onCheckedChange={(checked) =>
                              setOptions((prev) => ({ ...prev, [key]: checked }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Progress Section */}
      {(downloading || progress) && (
        <div className="rounded-xl border bg-card p-5 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileCode className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Download Progress</h3>
              <p className="text-xs text-muted-foreground">
                Extracting schema from {selectedProfile?.name}
              </p>
            </div>
          </div>

          {progress && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize flex items-center gap-2">
                    {downloading && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {progress.stage}
                  </span>
                  <span className="font-mono text-muted-foreground text-xs">
                    {progress.progress}%
                  </span>
                </div>
                <Progress
                  value={progress.progress}
                  className="h-2.5 transition-all duration-500"
                />
                <p className="text-xs text-muted-foreground">
                  {progress.message}
                </p>
              </div>

              {isComplete && (
                <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-green-600 font-semibold">
                      Schema extracted successfully!
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {schemaContent
                        ? `${(schemaContent.length / 1024).toFixed(2)} KB ready to save`
                        : "Ready to save"}
                    </p>
                  </div>
                  {!saved ? (
                    <Button size="sm" onClick={handleSaveFile} className="shrink-0">
                      <Download className="h-4 w-4 mr-1.5" />
                      Save File
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5 text-green-600 shrink-0">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm font-medium">Saved!</span>
                    </div>
                  )}
                </div>
              )}

              {hasError && (
                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                  <div>
                    <p className="text-sm text-red-600 font-semibold">
                      Download failed
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {progress.message}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Logs */}
          <div className="space-y-2">
            <Label className="text-xs">Logs</Label>
            <div className="h-48 w-full rounded-lg border bg-muted/30 overflow-hidden">
              <div className="h-full overflow-auto p-3 font-mono text-xs leading-relaxed">
                {logs.length === 0 ? (
                  <p className="text-muted-foreground">Waiting for logs...</p>
                ) : (
                  <>
                    {logs.map((log, i) => (
                      <div
                        key={i}
                        className={cn(
                          "py-0.5",
                          log.includes("[ERROR]") && "text-red-500",
                          log.includes("[WARNING]") && "text-yellow-500",
                          log.includes("[SUCCESS]") && "text-green-500",
                          log.includes("[INFO]") && "text-muted-foreground"
                        )}
                      >
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between">
        {schemaContent ? (
          <>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Download Another
            </Button>
            <Button onClick={() => navigate("/")}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleDownload}
              disabled={!selectedProfileId || downloading}
            >
              {downloading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Download Schema
                </>
              )}
            </Button>
          </>
        )}
      </div>

      {/* Database Selector Modal */}
      <DatabaseSelectorModal
        open={selectorModalOpen}
        onOpenChange={setSelectorModalOpen}
        profiles={profiles}
        tags={tags}
        selectedId={selectedProfileId}
        onSelect={handleProfileSelect}
        title="Select Database"
      />
    </div>
  );
}
