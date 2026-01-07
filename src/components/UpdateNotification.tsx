import { Download, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useUpdater } from "@/hooks/use-updater";

export function UpdateNotification() {
  const [dismissed, setDismissed] = useState(false);
  const { available, downloading, progress, version, downloadAndInstall } =
    useUpdater();

  if (!available || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 p-4 bg-card border rounded-lg shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h4 className="font-semibold text-sm">Update Available</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Version {version} is ready to install
          </p>
        </div>
        {!downloading && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 -mt-1 -mr-1"
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {downloading ? (
        <div className="mt-3 space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Downloading... {progress}%
          </p>
        </div>
      ) : (
        <Button
          size="sm"
          className="w-full mt-3"
          onClick={downloadAndInstall}
        >
          <Download className="h-4 w-4 mr-2" />
          Download & Install
        </Button>
      )}
    </div>
  );
}
