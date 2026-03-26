import { useState, useEffect } from "react";
import { ArrowLeft, Monitor, Moon, Sun, Palette, RefreshCw, Download, CheckCircle, XCircle, Info, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useTheme, Theme } from "@/hooks/use-theme";
import { useColorTheme } from "@/hooks/use-color-theme";
import { useUpdater } from "@/hooks/use-updater";
import { cn } from "@/lib/utils";
import { getVersion } from "@tauri-apps/api/app";

const themes: { value: Theme; label: string; icon: typeof Sun; description: string }[] = [
  { value: "light", label: "Light", icon: Sun, description: "Bright and clear" },
  { value: "dark", label: "Dark", icon: Moon, description: "Easy on the eyes" },
  { value: "system", label: "System", icon: Monitor, description: "Match your OS" },
];

export function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { colorTheme, setColorTheme, colorThemes } = useColorTheme();
  const { available, checking, downloading, progress, version: newVersion, error, checkForUpdates, downloadAndInstall } = useUpdater();
  const [currentVersion, setCurrentVersion] = useState<string>("");

  useEffect(() => {
    getVersion().then(setCurrentVersion);
  }, []);

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your application preferences
          </p>
        </div>
      </div>

      {/* Appearance */}
      <div className="rounded-xl border bg-card p-5 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Appearance</h3>
            <p className="text-xs text-muted-foreground">Customize the look and feel</p>
          </div>
        </div>

        {/* Theme Mode */}
        <div className="space-y-3">
          <Label>Theme Mode</Label>
          <div className="grid grid-cols-3 gap-3">
            {themes.map(({ value, label, icon: Icon, description }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover:bg-accent",
                  theme === value
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-transparent bg-muted/50 hover:border-border"
                )}
              >
                <div className={cn(
                  "p-2.5 rounded-lg transition-colors",
                  theme === value ? "bg-primary/15" : "bg-background"
                )}>
                  <Icon
                    className={cn(
                      "h-5 w-5",
                      theme === value ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                </div>
                <div className="text-center">
                  <span
                    className={cn(
                      "text-sm font-medium block",
                      theme === value ? "text-primary" : "text-foreground"
                    )}
                  >
                    {label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {description}
                  </span>
                </div>
                {theme === value && (
                  <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Color Theme */}
        <div className="space-y-3 pt-4 border-t">
          <Label className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Accent Color
          </Label>
          <div className="grid grid-cols-5 sm:grid-cols-7 gap-3">
            {colorThemes.map(({ value, label, color, darkColor }) => (
              <button
                key={value}
                onClick={() => setColorTheme(value)}
                className="flex flex-col items-center gap-1.5 group"
                title={label}
              >
                <div
                  className={cn(
                    "h-10 w-10 rounded-full transition-all border-[3px]",
                    colorTheme === value
                      ? "border-foreground shadow-lg scale-110"
                      : "border-transparent hover:border-muted-foreground/30 hover:scale-105"
                  )}
                  style={{
                    backgroundColor: isDark ? darkColor : color,
                  }}
                >
                  {colorTheme === value && (
                    <div className="h-full w-full flex items-center justify-center">
                      <CheckCircle className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium transition-colors",
                    colorTheme === value
                      ? "text-foreground"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* About & Updates */}
      <div className="rounded-xl border bg-card p-5 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Info className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">About & Updates</h3>
            <p className="text-xs text-muted-foreground">Version and update information</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Current Version</p>
            <p className="text-2xl font-bold text-primary">{currentVersion || "..."}</p>
          </div>
          {available && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">New Version</p>
              <p className="text-2xl font-bold text-green-600">{newVersion}</p>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <XCircle className="h-4 w-4 text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-600">Update check failed</p>
              <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {available && !downloading && (
          <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-600">Update available!</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Version {newVersion} is ready to install
              </p>
            </div>
          </div>
        )}

        {downloading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Downloading update...</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {!available && !checking && !error && (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">You're on the latest version</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={checkForUpdates}
            disabled={checking || downloading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", checking && "animate-spin")} />
            Check for Updates
          </Button>
          {available && !downloading && (
            <Button size="sm" onClick={downloadAndInstall}>
              <Download className="h-4 w-4 mr-2" />
              Download & Install
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
