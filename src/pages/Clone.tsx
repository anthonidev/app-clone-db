import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Database,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Settings2,
  Play,
  RotateCcw,
  Star,
  FolderOpen,
  Server,
  Shield,
  Trash2,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useProfiles,
  useTags,
  useCloneProgress,
  startClone,
  useSavedOperations,
  createSavedOperation,
  deleteSavedOperation,
} from "@/hooks/use-tauri";
import { DatabaseSelectorModal } from "@/components/DatabaseSelectorModal";
import { SaveOperationModal } from "@/components/SaveOperationModal";
import { LoadOperationModal } from "@/components/LoadOperationModal";
import { useNotification } from "@/hooks/use-notification";
import type { CloneOptions, CloneType, ConnectionProfile, SavedOperation } from "@/types";
import { cn } from "@/lib/utils";

type Step = "databases" | "options" | "progress";

function DatabaseCard({
  label,
  profile,
  tagName,
  tagColor,
  color,
  onClick,
}: {
  label: string;
  profile?: ConnectionProfile;
  tagName?: string;
  tagColor?: string;
  color: "blue" | "green";
  onClick: () => void;
}) {
  const colorMap = {
    blue: { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/30" },
    green: { bg: "bg-green-500/10", text: "text-green-500", border: "border-green-500/30" },
  };
  const c = colorMap[color];

  return (
    <button
      type="button"
      className={cn(
        "w-full text-left rounded-xl border-2 p-5 transition-all hover:shadow-md",
        profile ? `${c.border} bg-card` : "border-dashed border-muted-foreground/25 hover:border-muted-foreground/40"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("p-1.5 rounded-lg", c.bg)}>
          <Database className={cn("h-4 w-4", c.text)} />
        </div>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>

      {profile ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-base">{profile.name}</span>
            {tagName && (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                style={{ backgroundColor: tagColor }}
              >
                {tagName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Server className="h-3 w-3" />
            <span>
              {profile.host}:{profile.port}/{profile.database}
            </span>
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-muted-foreground">
          <Database className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Click to select</p>
        </div>
      )}
    </button>
  );
}

export function Clone() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profiles, loading: profilesLoading } = useProfiles();
  const { tags } = useTags();
  const { progress, logs, reset } = useCloneProgress();
  const { savedOperations, refetch: refetchSavedOperations } =
    useSavedOperations();
  const { notifySuccess, notifyError } = useNotification();
  const logsEndRef = useRef<HTMLDivElement>(null);
  const notifiedRef = useRef(false);

  const [step, setStep] = useState<Step>("databases");
  const [sourceId, setSourceId] = useState(searchParams.get("source") || "");
  const [destinationId, setDestinationId] = useState("");
  const [cleanDestination, setCleanDestination] = useState(true);
  const [createBackup, setCreateBackup] = useState(false);
  const [cloneType, setCloneType] = useState<CloneType>("both");
  const [excludeTables] = useState<string[]>([]);
  const [cloning, setCloning] = useState(false);

  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [destModalOpen, setDestModalOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [pendingOperationName, setPendingOperationName] = useState<
    string | null
  >(null);

  const sourceProfile = profiles.find((p) => p.id === sourceId);
  const destinationProfile = profiles.find((p) => p.id === destinationId);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const handleStartClone = async () => {
    if (!sourceId || !destinationId) return;

    reset();
    setStep("progress");
    setCloning(true);

    const options: CloneOptions = {
      sourceId,
      destinationId,
      cleanDestination,
      createBackup,
      cloneType,
      excludeTables,
    };

    try {
      await startClone(options);
    } catch (error) {
      console.error("Clone failed:", error);
    }
  };

  useEffect(() => {
    if (progress?.isComplete) {
      setCloning(false);

      if (!notifiedRef.current) {
        notifiedRef.current = true;
        if (progress.isError) {
          notifyError("Clone Failed", progress.message);
        } else {
          notifySuccess(
            "Clone Completed",
            `Successfully cloned ${sourceProfile?.name || "source"} to ${destinationProfile?.name || "destination"}`
          );
        }
      }

      if (pendingOperationName && !progress.isError) {
        createSavedOperation(
          pendingOperationName,
          sourceId,
          destinationId,
          cleanDestination,
          createBackup,
          cloneType
        )
          .then(() => {
            refetchSavedOperations();
            setPendingOperationName(null);
          })
          .catch(console.error);
      }
    }

    if (!progress) {
      notifiedRef.current = false;
    }
  }, [
    progress?.isComplete,
    progress?.isError,
    progress?.message,
    pendingOperationName,
    sourceId,
    destinationId,
    cleanDestination,
    createBackup,
    cloneType,
    sourceProfile?.name,
    destinationProfile?.name,
    refetchSavedOperations,
    notifySuccess,
    notifyError,
  ]);

  const handleReset = () => {
    reset();
    setStep("databases");
    setSourceId("");
    setDestinationId("");
    setCloning(false);
    setPendingOperationName(null);
  };

  const handleSaveOperation = (name: string) => {
    setPendingOperationName(name);
  };

  const handleLoadOperation = (operation: SavedOperation) => {
    setSourceId(operation.sourceId);
    setDestinationId(operation.destinationId);
    setCleanDestination(operation.cleanDestination);
    setCreateBackup(operation.createBackup);
    setCloneType(operation.cloneType);
  };

  const handleDeleteOperation = async (id: string) => {
    try {
      await deleteSavedOperation(id);
      refetchSavedOperations();
    } catch (error) {
      console.error("Failed to delete operation:", error);
    }
  };

  const canSaveOperation =
    sourceId && destinationId && sourceId !== destinationId;

  const steps = [
    { id: "databases", label: "Databases", icon: Database },
    { id: "options", label: "Options", icon: Settings2 },
    { id: "progress", label: "Progress", icon: Play },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  const canProceed = () => {
    switch (step) {
      case "databases":
        return (
          Boolean(sourceId) &&
          Boolean(destinationId) &&
          sourceId !== destinationId
        );
      case "options":
        return true;
      default:
        return false;
    }
  };

  const nextStep = () => {
    if (step === "databases") {
      setStep("options");
    } else if (step === "options") {
      handleStartClone();
    }
  };

  const prevStep = () => {
    if (step === "options") {
      setStep("databases");
    }
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Clone Database</h1>
            <p className="text-sm text-muted-foreground">
              Clone a PostgreSQL database from source to destination
            </p>
          </div>
        </div>
        {step !== "progress" && (
          <div className="flex items-center gap-2">
            {pendingOperationName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                Save as "{pendingOperationName}"
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveModalOpen(true)}
              disabled={!canSaveOperation}
              title={
                canSaveOperation
                  ? "Save this operation"
                  : "Select source and destination first"
              }
            >
              <Star
                className={cn(
                  "h-3.5 w-3.5 mr-1.5",
                  pendingOperationName && "text-yellow-500 fill-yellow-500"
                )}
              />
              {pendingOperationName ? "Change Name" : "Save"}
            </Button>
          </div>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = currentStepIndex === i;
          const isCompleted = currentStepIndex > i;

          return (
            <div key={s.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
                    isCompleted
                      ? "bg-primary text-primary-foreground"
                      : isActive
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs mt-1.5 font-medium transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 w-16 mx-3 mb-5 transition-colors duration-300",
                    currentStepIndex > i ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step: Databases */}
      {step === "databases" && (
        <div className="space-y-4">
          {savedOperations.length > 0 && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLoadModalOpen(true)}
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Load Saved Operation
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-muted font-medium">
                  {savedOperations.length}
                </span>
              </Button>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <DatabaseCard
              label="Source"
              profile={sourceProfile}
              tagName={sourceProfile?.tagId ? getTagForProfile(sourceProfile.tagId)?.name : undefined}
              tagColor={sourceProfile?.tagId ? getTagForProfile(sourceProfile.tagId)?.color : undefined}
              color="blue"
              onClick={() => setSourceModalOpen(true)}
            />

            {/* Arrow between cards */}
            <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              {/* Intentionally empty - arrow is visual clutter on this layout */}
            </div>

            <DatabaseCard
              label="Destination"
              profile={destinationProfile}
              tagName={destinationProfile?.tagId ? getTagForProfile(destinationProfile.tagId)?.name : undefined}
              tagColor={destinationProfile?.tagId ? getTagForProfile(destinationProfile.tagId)?.color : undefined}
              color="green"
              onClick={() => setDestModalOpen(true)}
            />
          </div>

          {sourceId && destinationId && sourceId === destinationId && (
            <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <p className="text-red-600">Source and destination cannot be the same database</p>
            </div>
          )}
        </div>
      )}

      {/* Step: Options */}
      {step === "options" && (
        <div className="rounded-xl border bg-card p-5 space-y-5">
          {/* Summary bar */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="p-1.5 bg-blue-500/10 rounded-md">
                <Database className="h-3.5 w-3.5 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{sourceProfile?.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {sourceProfile?.host}:{sourceProfile?.port}/{sourceProfile?.database}
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="p-1.5 bg-green-500/10 rounded-md">
                <Database className="h-3.5 w-3.5 text-green-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{destinationProfile?.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {destinationProfile?.host}:{destinationProfile?.port}/{destinationProfile?.database}
                </p>
              </div>
            </div>
          </div>

          {/* Clone Type */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              Clone Type
            </Label>
            <Select
              value={cloneType}
              onValueChange={(v) => setCloneType(v as CloneType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Schema + Data (Full Clone)</SelectItem>
                <SelectItem value="structure">Schema Only (Structure)</SelectItem>
                <SelectItem value="data">Data Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <Label>Options</Label>
            <div className="space-y-2">
              <label
                htmlFor="clean"
                className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  id="clean"
                  checked={cleanDestination}
                  onCheckedChange={(c) => setCleanDestination(c as boolean)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">Clean destination</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 ml-5">
                    Drop all existing tables before cloning
                  </p>
                </div>
              </label>

              <label
                htmlFor="backup"
                className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  id="backup"
                  checked={createBackup}
                  onCheckedChange={(c) => setCreateBackup(c as boolean)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">Create backup</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 ml-5">
                    Backup destination database before making changes
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
            <p className="text-xs text-yellow-600">
              This will modify the destination database. Make sure you have selected the correct databases.
            </p>
          </div>
        </div>
      )}

      {/* Step: Progress */}
      {step === "progress" && (
        <div className="rounded-xl border bg-card p-5 space-y-5">
          {/* Summary bar */}
          <div className="flex items-center justify-center gap-3 text-sm">
            <span className="font-medium">{sourceProfile?.name}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{destinationProfile?.name}</span>
          </div>

          {progress && (
            <div className="space-y-4">
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize flex items-center gap-2">
                    {cloning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
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

              {/* Success */}
              {progress.isComplete && !progress.isError && (
                <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm text-green-600 font-semibold">
                      Clone completed successfully!
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Database has been cloned to destination
                    </p>
                  </div>
                </div>
              )}

              {/* Error */}
              {progress.isError && (
                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                  <div>
                    <p className="text-sm text-red-600 font-semibold">Clone failed</p>
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
            <div className="h-56 w-full rounded-lg border bg-muted/30 overflow-hidden">
              <div className="h-full overflow-auto p-3 font-mono text-xs leading-relaxed">
                {logs.length === 0 ? (
                  <p className="text-muted-foreground">Waiting for logs...</p>
                ) : (
                  <>
                    {logs.map((log, i) => (
                      <div
                        key={i}
                        className={cn(
                          "py-0.5 clone-log-entry",
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

      {/* Navigation */}
      <div className="flex justify-between">
        {step === "progress" ? (
          <>
            <Button variant="outline" onClick={handleReset} disabled={cloning}>
              <RotateCcw className="h-4 w-4 mr-2" />
              New Clone
            </Button>
            <Button onClick={() => navigate("/")} disabled={cloning}>
              {cloning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cloning...
                </>
              ) : (
                "Done"
              )}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={step === "databases" ? () => navigate("/") : prevStep}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {step === "databases" ? "Cancel" : "Back"}
            </Button>
            <Button onClick={nextStep} disabled={!canProceed()}>
              {step === "options" ? (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start Clone
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </>
        )}
      </div>

      {/* Modals */}
      <DatabaseSelectorModal
        open={sourceModalOpen}
        onOpenChange={setSourceModalOpen}
        profiles={profiles}
        tags={tags}
        selectedId={sourceId}
        onSelect={setSourceId}
        title="Select Source Database"
      />

      <DatabaseSelectorModal
        open={destModalOpen}
        onOpenChange={setDestModalOpen}
        profiles={profiles}
        tags={tags}
        selectedId={destinationId}
        excludeId={sourceId}
        onSelect={setDestinationId}
        title="Select Destination Database"
      />

      <SaveOperationModal
        open={saveModalOpen}
        onOpenChange={setSaveModalOpen}
        onSave={handleSaveOperation}
      />

      <LoadOperationModal
        open={loadModalOpen}
        onOpenChange={setLoadModalOpen}
        savedOperations={savedOperations}
        profiles={profiles}
        onLoad={handleLoadOperation}
        onDelete={handleDeleteOperation}
      />
    </div>
  );
}
