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
} from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  // Advanced options state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [dbStructure, setDbStructure] = useState<DatabaseStructure | null>(null);
  const [loadingStructure, setLoadingStructure] = useState(false);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Show notification when download completes
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
    // Reset notification flag when progress is reset
    if (!progress) {
      notifiedRef.current = false;
    }
  }, [progress, selectedProfile?.name, notifySuccess, notifyError]);

  // Load database structure when profile is selected and advanced options are shown
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
          {
            name: "SQL Files",
            extensions: ["sql"],
          },
          {
            name: "All Files",
            extensions: ["*"],
          },
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

  // Group tables by schema
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Download Schema</h1>
          <p className="text-muted-foreground">
            Export database schema as SQL file
          </p>
        </div>
      </div>

      {/* Database Selection */}
      <Card
        className={cn(
          "cursor-pointer transition-all hover:shadow-lg",
          selectedProfile ? "border-primary" : "border-dashed",
          (downloading || schemaContent) && "pointer-events-none opacity-60"
        )}
        onClick={() =>
          !downloading && !schemaContent && setSelectorModalOpen(true)
        }
      >
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Database className="h-5 w-5 text-blue-500" />
            </div>
            Select Database
          </CardTitle>
          <CardDescription>
            Choose the database to download schema from
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedProfile ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">
                  {selectedProfile.name}
                </span>
                {selectedProfile.tagId && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{
                      backgroundColor: getTagForProfile(selectedProfile.tagId)
                        ?.color,
                    }}
                  >
                    {getTagForProfile(selectedProfile.tagId)?.name}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {selectedProfile.host}:{selectedProfile.port}/
                {selectedProfile.database}
              </p>
              <p className="text-xs text-muted-foreground">
                User: {selectedProfile.user}
              </p>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Database className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Click to select database</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Advanced Options Toggle */}
      {selectedProfile && !downloading && !schemaContent && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <CardTitle className="text-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-muted-foreground" />
                Advanced Options
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-normal text-muted-foreground">
                  {showAdvanced ? "Hide" : "Show"}
                </span>
                {showAdvanced ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </div>
            </CardTitle>
          </CardHeader>

          {showAdvanced && (
            <CardContent className="space-y-6">
              {loadingStructure ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">
                    Loading database structure...
                  </span>
                </div>
              ) : (
                <>
                  {/* Schema Selection */}
                  {dbStructure && dbStructure.schemas.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          <Layers className="h-4 w-4" />
                          Schemas
                          <span className="text-xs text-muted-foreground">
                            (empty = all)
                          </span>
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={toggleAllSchemas}
                        >
                          {options.schemas.length === dbStructure.schemas.length
                            ? "Deselect All"
                            : "Select All"}
                        </Button>
                      </div>
                      <ScrollArea className="h-32 rounded-md border p-3">
                        <div className="space-y-2">
                          {dbStructure.schemas.map((schema) => (
                            <div
                              key={schema.name}
                              className="flex items-center space-x-2"
                            >
                              <Checkbox
                                id={`schema-${schema.name}`}
                                checked={options.schemas.includes(schema.name)}
                                onCheckedChange={() => toggleSchema(schema.name)}
                              />
                              <label
                                htmlFor={`schema-${schema.name}`}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                              >
                                {schema.name}
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({schema.tableCount} tables)
                                </span>
                              </label>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Table Selection */}
                  {dbStructure && dbStructure.tables.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          <Table className="h-4 w-4" />
                          Tables
                          <span className="text-xs text-muted-foreground">
                            (empty = all)
                          </span>
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={toggleAllTables}
                        >
                          {options.tables.length === dbStructure.tables.length
                            ? "Deselect All"
                            : "Select All"}
                        </Button>
                      </div>
                      <ScrollArea className="h-48 rounded-md border p-3">
                        <div className="space-y-4">
                          {tablesBySchema &&
                            Object.entries(tablesBySchema).map(
                              ([schemaName, tables]) => (
                                <div key={schemaName}>
                                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase">
                                    {schemaName}
                                  </p>
                                  <div className="space-y-2 ml-2">
                                    {tables.map((table) => {
                                      const fullName = `${table.schema}.${table.name}`;
                                      return (
                                        <div
                                          key={fullName}
                                          className="flex items-center space-x-2"
                                        >
                                          <Checkbox
                                            id={`table-${fullName}`}
                                            checked={options.tables.includes(
                                              fullName
                                            )}
                                            onCheckedChange={() =>
                                              toggleTable(fullName)
                                            }
                                          />
                                          <label
                                            htmlFor={`table-${fullName}`}
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                          >
                                            {table.name}
                                            <span className="text-xs text-muted-foreground ml-2">
                                              ({table.rowCount} rows,{" "}
                                              {formatBytes(table.size)})
                                            </span>
                                          </label>
                                        </div>
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
                  <div className="space-y-3">
                    <Label>Include in Export</Label>
                    <div className="grid grid-cols-2 gap-4">
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
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <Label
                            htmlFor={key}
                            className="text-sm font-medium cursor-pointer"
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
            </CardContent>
          )}
        </Card>
      )}

      {/* Progress Section */}
      {(downloading || progress) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              Download Progress
            </CardTitle>
            <CardDescription>
              Extracting schema from {selectedProfile?.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {progress && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize flex items-center gap-2">
                    {downloading && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {progress.stage}
                  </span>
                  <span className="text-sm font-mono text-muted-foreground">
                    {progress.progress}%
                  </span>
                </div>
                <Progress
                  value={progress.progress}
                  className="h-3 transition-all duration-500"
                />
                <p className="text-sm text-muted-foreground">
                  {progress.message}
                </p>

                {isComplete && (
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <div className="flex-1">
                      <p className="text-green-600 font-semibold">
                        Schema extracted successfully!
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {schemaContent
                          ? `${(schemaContent.length / 1024).toFixed(2)} KB ready to save`
                          : "Ready to save"}
                      </p>
                    </div>
                    {!saved ? (
                      <Button onClick={handleSaveFile} className="gap-2">
                        <Download className="h-4 w-4" />
                        Save File
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-medium">Saved!</span>
                      </div>
                    )}
                  </div>
                )}

                {hasError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                    <div>
                      <p className="text-red-600 font-semibold">
                        Download failed
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {progress.message}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Logs */}
            <div className="space-y-2">
              <Label>Logs</Label>
              <div className="h-48 w-full rounded-lg border bg-muted/30 overflow-hidden">
                <div className="h-full overflow-auto p-4 font-mono text-sm">
                  {logs.length === 0 ? (
                    <p className="text-muted-foreground">Waiting for logs...</p>
                  ) : (
                    <>
                      {logs.map((log, i) => (
                        <div
                          key={i}
                          className={cn(
                            "py-0.5 leading-relaxed",
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
          </CardContent>
        </Card>
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
