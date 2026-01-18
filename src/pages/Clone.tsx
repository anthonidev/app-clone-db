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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { CloneOptions, CloneType, SavedOperation } from "@/types";
import { cn } from "@/lib/utils";

type Step = "databases" | "options" | "progress";

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

  // Auto-scroll logs
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

      // Show notification (only once)
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

      // Save operation if pending and clone was successful
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

    // Reset notification flag when progress is reset
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Clone Database</h1>
            <p className="text-muted-foreground">
              Clone a PostgreSQL database from source to destination
            </p>
          </div>
        </div>
        {step !== "progress" && (
          <div className="flex items-center gap-2">
            {pendingOperationName && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                Will save as "{pendingOperationName}"
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
                  "h-4 w-4 mr-2",
                  pendingOperationName && "text-yellow-500 fill-yellow-500"
                )}
              />
              {pendingOperationName ? "Change Name" : "Save Operation"}
            </Button>
          </div>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-4">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = currentStepIndex === i;
          const isCompleted = currentStepIndex > i;

          return (
            <div key={s.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300",
                    isCompleted
                      ? "bg-primary text-primary-foreground"
                      : isActive
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-6 w-6" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-sm mt-2 font-medium transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 w-20 mx-4 transition-colors duration-300",
                    currentStepIndex > i ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      {step === "databases" && (
        <div className="space-y-4">
          {savedOperations.length > 0 && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => setLoadModalOpen(true)}
                className="gap-2"
              >
                <FolderOpen className="h-4 w-4" />
                Load Saved Operation
                <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-muted">
                  {savedOperations.length}
                </span>
              </Button>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Source */}
            <Card
              className={cn(
                "cursor-pointer transition-all hover:shadow-lg",
                sourceProfile ? "border-primary" : "border-dashed"
              )}
              onClick={() => setSourceModalOpen(true)}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Database className="h-5 w-5 text-blue-500" />
                  </div>
                  Source Database
                </CardTitle>
                <CardDescription>
                  Select the database to clone from
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sourceProfile ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">
                        {sourceProfile.name}
                      </span>
                      {sourceProfile.tagId && (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{
                            backgroundColor: getTagForProfile(
                              sourceProfile.tagId
                            )?.color,
                          }}
                        >
                          {getTagForProfile(sourceProfile.tagId)?.name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {sourceProfile.host}:{sourceProfile.port}/
                      {sourceProfile.database}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      User: {sourceProfile.user}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Database className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>Click to select source</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Destination */}
            <Card
              className={cn(
                "cursor-pointer transition-all hover:shadow-lg",
                destinationProfile ? "border-primary" : "border-dashed"
              )}
              onClick={() => setDestModalOpen(true)}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <Database className="h-5 w-5 text-green-500" />
                  </div>
                  Destination Database
                </CardTitle>
                <CardDescription>
                  Select the database to clone to
                </CardDescription>
              </CardHeader>
              <CardContent>
                {destinationProfile ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">
                        {destinationProfile.name}
                      </span>
                      {destinationProfile.tagId && (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{
                            backgroundColor: getTagForProfile(
                              destinationProfile.tagId
                            )?.color,
                          }}
                        >
                          {getTagForProfile(destinationProfile.tagId)?.name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {destinationProfile.host}:{destinationProfile.port}/
                      {destinationProfile.database}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      User: {destinationProfile.user}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Database className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>Click to select destination</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {step === "options" && (
        <Card>
          <CardHeader>
            <CardTitle>Clone Options</CardTitle>
            <CardDescription>
              Configure how the database will be cloned
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary */}
            <div className="p-4 bg-muted/50 rounded-lg border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Database className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-semibold">{sourceProfile?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {sourceProfile?.host}:{sourceProfile?.port}/
                      {sourceProfile?.database}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <Database className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="font-semibold">{destinationProfile?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {destinationProfile?.host}:{destinationProfile?.port}/
                      {destinationProfile?.database}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Clone Type */}
            <div className="space-y-3">
              <Label>Clone Type</Label>
              <Select
                value={cloneType}
                onValueChange={(v) => setCloneType(v as CloneType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">
                    Schema + Data (Full Clone)
                  </SelectItem>
                  <SelectItem value="structure">
                    Schema Only (Structure)
                  </SelectItem>
                  <SelectItem value="data">Data Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Options */}
            <div className="space-y-4">
              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <Checkbox
                  id="clean"
                  checked={cleanDestination}
                  onCheckedChange={(c) => setCleanDestination(c as boolean)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="clean" className="cursor-pointer font-medium">
                    Clean destination before cloning
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Drop all existing tables in the destination database
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <Checkbox
                  id="backup"
                  checked={createBackup}
                  onCheckedChange={(c) => setCreateBackup(c as boolean)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label
                    htmlFor="backup"
                    className="cursor-pointer font-medium"
                  >
                    Create backup before cloning
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Create a backup of the destination database before making
                    changes
                  </p>
                </div>
              </div>
            </div>

            {/* Warning */}
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-yellow-600">Warning</p>
                <p className="text-sm text-muted-foreground">
                  This operation will modify the destination database. Make sure
                  you have selected the correct databases.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "progress" && (
        <Card>
          <CardHeader>
            <CardTitle>Clone Progress</CardTitle>
            <CardDescription>
              {sourceProfile?.name} → {destinationProfile?.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {progress && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize flex items-center gap-2">
                    {cloning && <Loader2 className="h-4 w-4 animate-spin" />}
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

                {progress.isComplete && !progress.isError && (
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <div>
                      <p className="text-green-600 font-semibold">
                        Clone completed successfully!
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Database has been cloned to destination
                      </p>
                    </div>
                  </div>
                )}

                {progress.isError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                    <div>
                      <p className="text-red-600 font-semibold">Clone failed</p>
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
              <div className="h-64 w-full rounded-lg border bg-muted/30 overflow-hidden">
                <div className="h-full overflow-auto p-4 font-mono text-sm">
                  {logs.length === 0 ? (
                    <p className="text-muted-foreground">Waiting for logs...</p>
                  ) : (
                    <>
                      {logs.map((log, i) => (
                        <div
                          key={i}
                          className={cn(
                            "py-0.5 leading-relaxed clone-log-entry",
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

      {/* Navigation buttons */}
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
