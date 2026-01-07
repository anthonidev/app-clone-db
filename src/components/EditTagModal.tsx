import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Pencil, Trash2 } from "lucide-react";
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

interface EditTagModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: Tag | null;
  onTagUpdated: () => void;
  onTagDeleted: (tagId: string) => void;
}

export function EditTagModal({
  open,
  onOpenChange,
  tag,
  onTagUpdated,
  onTagDeleted,
}: EditTagModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tag) {
      setName(tag.name);
      setColor(tag.color);
    }
  }, [tag]);

  const handleUpdate = async () => {
    if (!tag || !name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await invoke("update_tag", {
        id: tag.id,
        name: name.trim(),
        color: color.toUpperCase(),
      });
      onTagUpdated();
      onOpenChange(false);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!tag) return;

    setDeleting(true);
    setError(null);

    try {
      await invoke("delete_tag", { id: tag.id });
      onTagDeleted(tag.id);
      onOpenChange(false);
    } catch (err) {
      setError(err as string);
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setError(null);
    }
    onOpenChange(open);
  };

  if (!tag) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Tag
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="edit-tag-name">Tag Name</Label>
            <Input
              id="edit-tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tag name"
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

          <div className="flex justify-between pt-2">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading || deleting}
            >
              {deleting ? (
                "Deleting..."
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </>
              )}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={loading || deleting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={loading || deleting || !name.trim()}
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
