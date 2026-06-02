import { Database, Server, Check, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ConnectionProfile, Tag } from "@/types";

interface DatabaseSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: ConnectionProfile[];
  tags: Tag[];
  selectedId: string | null;
  excludeId?: string | null;
  /** Si es true, oculta los perfiles marcados como readOnly (protected). */
  excludeReadOnly?: boolean;
  onSelect: (id: string) => void;
  title: string;
}

export function DatabaseSelectorModal({
  open,
  onOpenChange,
  profiles,
  tags,
  selectedId,
  excludeId,
  excludeReadOnly,
  onSelect,
  title,
}: DatabaseSelectorModalProps) {
  const getTagForProfile = (tagId: string | null) => {
    if (!tagId) return undefined;
    return tags.find((t) => t.id === tagId);
  };

  const filteredProfiles = profiles.filter((p) => {
    if (excludeId && p.id === excludeId) return false;
    if (excludeReadOnly && p.readOnly) return false;
    return true;
  });

  const hiddenProtectedCount = excludeReadOnly
    ? profiles.filter((p) => p.readOnly && (!excludeId || p.id !== excludeId))
        .length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {hiddenProtectedCount > 0 && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs">
            <ShieldAlert className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-red-700">
              {hiddenProtectedCount} protected database
              {hiddenProtectedCount > 1 ? "s are" : " is"} hidden — they cannot
              be used as a clone destination.
            </p>
          </div>
        )}

        <ScrollArea className="max-h-[60vh]">
          <div className="grid gap-3 p-1">
            {filteredProfiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No databases available
              </div>
            ) : (
              filteredProfiles.map((profile) => {
                const tag = getTagForProfile(profile.tagId);
                const isSelected = profile.id === selectedId;

                return (
                  <button
                    key={profile.id}
                    onClick={() => {
                      onSelect(profile.id);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "w-full p-4 rounded-lg border-2 text-left transition-all hover:shadow-md",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "p-2 rounded-lg",
                            isSelected ? "bg-primary/20" : "bg-muted"
                          )}
                        >
                          <Database
                            className={cn(
                              "h-5 w-5",
                              isSelected ? "text-primary" : "text-muted-foreground"
                            )}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{profile.name}</span>
                            {tag && (
                              <span
                                className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                                style={{ backgroundColor: tag.color }}
                              >
                                {tag.name}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <Server className="h-3 w-3" />
                            <span>
                              {profile.host}:{profile.port}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Database: <span className="font-mono">{profile.database}</span>
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="p-1 rounded-full bg-primary text-primary-foreground">
                          <Check className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
