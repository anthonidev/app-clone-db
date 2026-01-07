import { useState } from "react";
import { Check, ChevronsUpDown, Plus, X, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tag } from "@/types";

interface TagSelectProps {
  tags: Tag[];
  value: string | null;
  onChange: (tagId: string | null) => void;
  onCreateNew: () => void;
  onEdit: (tag: Tag) => void;
}

export function TagSelect({ tags, value, onChange, onCreateNew, onEdit }: TagSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedTag = tags.find((tag) => tag.id === value);

  const handleEditClick = (e: React.MouseEvent, tag: Tag) => {
    e.stopPropagation();
    setOpen(false);
    onEdit(tag);
  };

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="flex-1 justify-between"
          >
            {selectedTag ? (
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full border"
                  style={{ backgroundColor: selectedTag.color }}
                />
                <span>{selectedTag.name}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">Select tag...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search tags..." />
            <CommandList>
              <CommandEmpty>No tags found.</CommandEmpty>
              <CommandGroup>
                {tags.map((tag) => (
                  <CommandItem
                    key={tag.id}
                    value={tag.name}
                    onSelect={() => {
                      onChange(tag.id === value ? null : tag.id);
                      setOpen(false);
                    }}
                    className="flex items-center"
                  >
                    <div
                      className="w-4 h-4 rounded-full border mr-2"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1">{tag.name}</span>
                    <button
                      onClick={(e) => handleEditClick(e, tag)}
                      className="p-1 hover:bg-muted rounded opacity-50 hover:opacity-100 transition-opacity"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <Check
                      className={cn(
                        "h-4 w-4 ml-1",
                        value === tag.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    onCreateNew();
                  }}
                  className="text-primary"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create new tag
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedTag && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange(null)}
          className="shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
