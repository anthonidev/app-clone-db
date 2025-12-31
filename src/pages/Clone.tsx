import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Database,
  Loader2,
  CheckCircle2,
  AlertTriangle,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProfiles, useCloneProgress, startClone } from "@/hooks/use-tauri";
import type { CloneOptions, CloneType } from "@/types";
import { cn } from "@/lib/utils";

type Step = "source" | "destination" | "options" | "progress";

export function Clone() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profiles, loading: profilesLoading } = useProfiles();
  const { progress, logs, reset } = useCloneProgress();

  const [step, setStep] = useState<Step>("source");
  const [sourceId, setSourceId] = useState(searchParams.get("source") || "");
  const [destinationId, setDestinationId] = useState("");
  const [cleanDestination, setCleanDestination] = useState(true);
  const [createBackup, setCreateBackup] = useState(true);
  const [cloneType, setCloneType] = useState<CloneType>("both");
  const [excludeTables] = useState<string[]>([]);
  const [cloning, setCloning] = useState(false);

  const sourceProfile = profiles.find((p) => p.id === sourceId);
  const destinationProfile = profiles.find((p) => p.id === destinationId);

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
    }
  }, [progress?.isComplete]);

  const steps = [
    { id: "source", label: "Source", description: "Select source database" },
    {
      id: "destination",
      label: "Destination",
      description: "Select destination",
    },
    { id: "options", label: "Options", description: "Configure clone options" },
    { id: "progress", label: "Progress", description: "Clone in progress" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  const canProceed = () => {
    switch (step) {
      case "source":
        return Boolean(sourceId);
      case "destination":
        return Boolean(destinationId) && destinationId !== sourceId;
      case "options":
        return true;
      default:
        return false;
    }
  };

  const nextStep = () => {
    const next = steps[currentStepIndex + 1];
    if (next) {
      if (next.id === "progress") {
        handleStartClone();
      } else {
        setStep(next.id as Step);
      }
    }
  };

  const prevStep = () => {
    const prev = steps[currentStepIndex - 1];
    if (prev && step !== "progress") {
      setStep(prev.id as Step);
    }
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

      {/* Step indicator */}
      <div className="flex items-center justify-between">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium",
                  currentStepIndex > i
                    ? "bg-primary text-primary-foreground"
                    : currentStepIndex === i
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {currentStepIndex > i ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  i + 1
                )}
              </div>
              <span className="text-xs mt-1 text-muted-foreground">
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-16 mx-2",
                  currentStepIndex > i ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle>{steps[currentStepIndex].label}</CardTitle>
          <CardDescription>
            {steps[currentStepIndex].description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "source" && (
            <div className="space-y-4">
              <Label>Select Source Database</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a database..." />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        {profile.name} ({profile.host}:{profile.port}/
                        {profile.database})
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sourceProfile && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-medium">{sourceProfile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {sourceProfile.host}:{sourceProfile.port}/
                    {sourceProfile.database}
                  </p>
                </div>
              )}
            </div>
          )}

          {step === "destination" && (
            <div className="space-y-4">
              <Label>Select Destination Database</Label>
              <Select value={destinationId} onValueChange={setDestinationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a database..." />
                </SelectTrigger>
                <SelectContent>
                  {profiles
                    .filter((p) => p.id !== sourceId)
                    .map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4" />
                          {profile.name} ({profile.host}:{profile.port}/
                          {profile.database})
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {destinationId === sourceId && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <p className="text-sm text-yellow-600">
                    Source and destination cannot be the same
                  </p>
                </div>
              )}
              {destinationProfile && destinationId !== sourceId && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-medium">{destinationProfile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {destinationProfile.host}:{destinationProfile.port}/
                    {destinationProfile.database}
                  </p>
                </div>
              )}
            </div>
          )}

          {step === "options" && (
            <div className="space-y-6">
              <div className="space-y-4">
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

              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="clean"
                    checked={cleanDestination}
                    onCheckedChange={(c) => setCleanDestination(c as boolean)}
                  />
                  <div>
                    <Label htmlFor="clean" className="cursor-pointer">
                      Clean destination before cloning
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Drop all existing tables in the destination database
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="backup"
                    checked={createBackup}
                    onCheckedChange={(c) => setCreateBackup(c as boolean)}
                  />
                  <div>
                    <Label htmlFor="backup" className="cursor-pointer">
                      Create backup before cloning
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Create a backup of the destination database before making
                      changes
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg space-y-2">
                <p className="font-medium">Clone Summary</p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{sourceProfile?.name}</span> →{" "}
                  <span className="font-medium">
                    {destinationProfile?.name}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Type:{" "}
                  {cloneType === "both"
                    ? "Full Clone"
                    : cloneType === "structure"
                    ? "Schema Only"
                    : "Data Only"}
                </p>
              </div>
            </div>
          )}

          {step === "progress" && (
            <div className="space-y-6">
              {progress && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">
                      {progress.stage}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {progress.progress}%
                    </span>
                  </div>
                  <Progress value={progress.progress} />
                  <p className="text-sm text-muted-foreground">
                    {progress.message}
                  </p>

                  {progress.isComplete && !progress.isError && (
                    <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <p className="text-green-600 font-medium">
                        Clone completed successfully!
                      </p>
                    </div>
                  )}

                  {progress.isError && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                      <p className="text-red-600 font-medium">
                        {progress.message}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Logs</Label>
                <ScrollArea className="h-64 w-full rounded-md border bg-muted/50">
                  <div className="p-4 log-viewer">
                    {logs.length === 0 ? (
                      <p className="text-muted-foreground">
                        Waiting for logs...
                      </p>
                    ) : (
                      logs.map((log, i) => (
                        <div
                          key={i}
                          className={cn(
                            "py-0.5",
                            log.includes("[ERROR]") && "log-error",
                            log.includes("[WARNING]") && "log-warning",
                            log.includes("[SUCCESS]") && "log-success",
                            log.includes("[INFO]") && "log-info"
                          )}
                        >
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={currentStepIndex === 0 || step === "progress"}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {step === "progress" ? (
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
        ) : (
          <Button onClick={nextStep} disabled={!canProceed()}>
            {step === "options" ? "Start Clone" : "Next"}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
