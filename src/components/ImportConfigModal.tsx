import { Upload, AlertTriangle, Database, Tag as TagIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ImportPreview } from "@/hooks/use-tauri";

interface ImportConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: ImportPreview | null;
  onConfirm: () => void;
  loading?: boolean;
}

function NameList({ names, color }: { names: string[]; color: string }) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <span
          key={name}
          className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}
        >
          {name}
        </span>
      ))}
    </div>
  );
}

export function ImportConfigModal({
  open,
  onOpenChange,
  preview,
  onConfirm,
  loading,
}: ImportConfigModalProps) {
  if (!preview) return null;

  const hasReplacements =
    preview.replacedProfiles.length > 0 || preview.replacedTags.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import configuration
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 mb-1">
                <Database className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Profiles
                </span>
              </div>
              <p className="text-2xl font-bold">{preview.totalProfiles}</p>
              <p className="text-xs text-muted-foreground">
                {preview.newProfiles.length} new ·{" "}
                {preview.replacedProfiles.length} replace
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 mb-1">
                <TagIcon className="h-4 w-4 text-purple-500" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Tags
                </span>
              </div>
              <p className="text-2xl font-bold">{preview.totalTags}</p>
              <p className="text-xs text-muted-foreground">
                {preview.newTags.length} new · {preview.replacedTags.length}{" "}
                replace
              </p>
            </div>
          </div>

          {preview.newProfiles.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-green-600">
                New profiles ({preview.newProfiles.length})
              </p>
              <NameList
                names={preview.newProfiles}
                color="bg-green-500/10 text-green-700"
              />
            </div>
          )}

          {preview.replacedProfiles.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-yellow-700">
                Will replace these profiles ({preview.replacedProfiles.length})
              </p>
              <NameList
                names={preview.replacedProfiles}
                color="bg-yellow-500/10 text-yellow-700"
              />
            </div>
          )}

          {preview.newTags.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-green-600">
                New tags ({preview.newTags.length})
              </p>
              <NameList
                names={preview.newTags}
                color="bg-green-500/10 text-green-700"
              />
            </div>
          )}

          {preview.replacedTags.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-yellow-700">
                Will replace these tags ({preview.replacedTags.length})
              </p>
              <NameList
                names={preview.replacedTags}
                color="bg-yellow-500/10 text-yellow-700"
              />
            </div>
          )}

          {hasReplacements && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-700">
                Duplicates were matched by name. The imported version will
                replace the existing one; the current version will be deleted.
                Other local entries are preserved.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
