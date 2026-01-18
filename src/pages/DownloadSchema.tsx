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
import {
  useProfiles,
  useTags,
  useSchemaProgress,
  downloadSchema,
} from "@/hooks/use-tauri";
import { DatabaseSelectorModal } from "@/components/DatabaseSelectorModal";
import { cn } from "@/lib/utils";

export function DownloadSchema() {
  const navigate = useNavigate();
  const { profiles, loading: profilesLoading } = useProfiles();
  const { tags } = useTags();
  const { progress, logs, reset } = useSchemaProgress();
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectorModalOpen, setSelectorModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [schemaContent, setSchemaContent] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const handleDownload = async () => {
    if (!selectedProfileId) return;

    reset();
    setSchemaContent(null);
    setSaved(false);
    setDownloading(true);

    try {
      const content = await downloadSchema(selectedProfileId);
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
  };

  const getTagForProfile = (tagId: string | null) => {
    if (!tagId) return undefined;
    return tags.find((t) => t.id === tagId);
  };

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
        onClick={() => !downloading && !schemaContent && setSelectorModalOpen(true)}
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
                    {downloading && <Loader2 className="h-4 w-4 animate-spin" />}
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
        onSelect={setSelectedProfileId}
        title="Select Database"
      />
    </div>
  );
}
