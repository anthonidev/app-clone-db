import { HexColorPicker, HexColorInput } from "react-colorful";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import "./ColorPicker.css";

const DEFAULT_COLORS = [
  { name: "Red", color: "#EF4444" },
  { name: "Orange", color: "#F97316" },
  { name: "Amber", color: "#F59E0B" },
  { name: "Yellow", color: "#EAB308" },
  { name: "Lime", color: "#84CC16" },
  { name: "Green", color: "#22C55E" },
  { name: "Emerald", color: "#10B981" },
  { name: "Teal", color: "#14B8A6" },
  { name: "Cyan", color: "#06B6D4" },
  { name: "Sky", color: "#0EA5E9" },
  { name: "Blue", color: "#3B82F6" },
  { name: "Indigo", color: "#6366F1" },
  { name: "Violet", color: "#8B5CF6" },
  { name: "Purple", color: "#A855F7" },
  { name: "Fuchsia", color: "#D946EF" },
  { name: "Pink", color: "#EC4899" },
  { name: "Rose", color: "#F43F5E" },
  { name: "Gray", color: "#6B7280" },
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
}

export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  const handlePresetClick = (color: string) => {
    onChange(color);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Color Picker */}
      <div className="flex gap-4 items-start">
        <HexColorPicker
          color={value || "#3B82F6"}
          onChange={onChange}
          className="color-picker"
        />
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Hex Color</Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">#</span>
              <HexColorInput
                color={value || "#3B82F6"}
                onChange={onChange}
                prefixed={false}
                className="flex h-9 w-24 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors font-mono uppercase placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Preview</Label>
            <div
              className="w-16 h-16 rounded-lg border-2 border-border shadow-inner"
              style={{ backgroundColor: value || "#3B82F6" }}
            />
          </div>
        </div>
      </div>

      {/* Preset Colors */}
      <div className="space-y-2">
        <Label>Quick Colors</Label>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_COLORS.map(({ name, color }) => (
            <button
              key={color}
              type="button"
              onClick={() => handlePresetClick(color)}
              className={cn(
                "w-7 h-7 rounded-full border-2 transition-all hover:scale-110",
                value?.toUpperCase() === color.toUpperCase()
                  ? "border-foreground ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                  : "border-transparent hover:border-muted-foreground/50"
              )}
              style={{ backgroundColor: color }}
              title={name}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
