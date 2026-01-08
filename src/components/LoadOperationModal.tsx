import { Star, Trash2, ArrowRight, Calendar } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SavedOperation, ConnectionProfile } from "@/types";

interface LoadOperationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedOperations: SavedOperation[];
  profiles: ConnectionProfile[];
  onLoad: (operation: SavedOperation) => void;
  onDelete: (id: string) => void;
}

export function LoadOperationModal({
  open,
  onOpenChange,
  savedOperations,
  profiles,
  onLoad,
  onDelete,
}: LoadOperationModalProps) {
  const getProfileName = (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    return profile?.name || "Unknown";
  };

  const getCloneTypeLabel = (type: string) => {
    switch (type) {
      case "structure":
        return "Structure only";
      case "data":
        return "Data only";
      case "both":
        return "Structure + Data";
      default:
        return type;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Saved Operations
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="grid gap-3 p-1">
            {savedOperations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No saved operations yet
              </div>
            ) : (
              savedOperations.map((operation) => {
                const sourceExists = profiles.some(
                  (p) => p.id === operation.sourceId
                );
                const destExists = profiles.some(
                  (p) => p.id === operation.destinationId
                );
                const isValid = sourceExists && destExists;

                return (
                  <div
                    key={operation.id}
                    className={cn(
                      "p-4 rounded-lg border-2 transition-all",
                      isValid
                        ? "border-border hover:border-primary/50 hover:shadow-md"
                        : "border-destructive/30 bg-destructive/5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          <span className="font-semibold truncate">
                            {operation.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-sm mb-2">
                          <span
                            className={cn(
                              "font-mono",
                              !sourceExists && "text-destructive line-through"
                            )}
                          >
                            {getProfileName(operation.sourceId)}
                          </span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span
                            className={cn(
                              "font-mono",
                              !destExists && "text-destructive line-through"
                            )}
                          >
                            {getProfileName(operation.destinationId)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>{getCloneTypeLabel(operation.cloneType)}</span>
                          {operation.cleanDestination && (
                            <span className="text-yellow-600">Clean destination</span>
                          )}
                          {operation.createBackup && (
                            <span className="text-blue-600">Create backup</span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(operation.createdAt)}
                          </span>
                        </div>

                        {!isValid && (
                          <p className="text-xs text-destructive mt-2">
                            One or more profiles have been deleted
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onDelete(operation.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            onLoad(operation);
                            onOpenChange(false);
                          }}
                          disabled={!isValid}
                        >
                          Load
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
