import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ColorPicker } from "@/components/ColorPicker";
import { Tag } from "@/types";

interface TagModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTagCreated: (tag: Tag) => void;
}

export function TagModal({ open, onOpenChange, onTagCreated }: TagModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Tag name is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tag = await invoke<Tag>("create_tag", {
        name: name.trim(),
        color: color.toUpperCase(),
      });
      onTagCreated(tag);
      onOpenChange(false);
      // Reset form
      setName("");
      setColor("#3B82F6");
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset form when closing
      setName("");
      setColor("#3B82F6");
      setError(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TagIcon className="h-5 w-5" />
            Create New Tag
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="tag-name">Tag Name</Label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production, Development, Testing"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Tag Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={loading || !name.trim()}>
              {loading ? (
                "Creating..."
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" />
                  Create Tag
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
