import { useState, useEffect } from "react";
import { ArrowLeft, Monitor, Moon, Sun, Palette, RefreshCw, Download, CheckCircle, XCircle, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useTheme, Theme } from "@/hooks/use-theme";
import { useColorTheme } from "@/hooks/use-color-theme";
import { useUpdater } from "@/hooks/use-updater";
import { cn } from "@/lib/utils";
import { getVersion } from "@tauri-apps/api/app";

const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
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

  // Determinar si estamos en modo oscuro
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Manage your application preferences
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize the look and feel of the application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme Mode Selector */}
          <div className="space-y-2">
            <Label>Theme Mode</Label>
            <p className="text-sm text-muted-foreground">
              Select your preferred color scheme
            </p>
            <div className="grid grid-cols-3 gap-4 pt-2">
              {themes.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all hover:bg-accent",
                    theme === value
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-6 w-6",
                      theme === value ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span
                    className={cn(
                      "text-sm font-medium",
                      theme === value ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Color Theme Selector */}
          <div className="space-y-2 pt-4 border-t">
            <Label className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Accent Color
            </Label>
            <p className="text-sm text-muted-foreground">
              Choose your preferred accent color
            </p>
            <div className="flex flex-wrap gap-4 pt-3">
              {colorThemes.map(({ value, label, color, darkColor }) => (
                <button
                  key={value}
                  onClick={() => setColorTheme(value)}
                  className={cn(
                    "flex flex-col items-center gap-2 group transition-transform hover:scale-110",
                    colorTheme === value && "scale-110"
                  )}
                  title={label}
                >
                  <div
                    className={cn(
                      "h-12 w-12 rounded-full transition-all border-4",
                      colorTheme === value
                        ? "border-foreground shadow-lg"
                        : "border-transparent hover:border-muted-foreground/30"
                    )}
                    style={{
                      backgroundColor: isDark ? darkColor : color,
                    }}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium transition-colors",
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
        </CardContent>
      </Card>

      {/* About & Updates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            About & Updates
          </CardTitle>
          <CardDescription>
            Application version and update information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Current Version</Label>
              <p className="text-2xl font-bold text-primary">{currentVersion || "..."}</p>
            </div>
            {available && (
              <div className="text-right">
                <Label>New Version Available</Label>
                <p className="text-2xl font-bold text-green-600">{newVersion}</p>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md flex items-start gap-2">
              <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-600">Update check failed</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          )}

          {available && !downloading && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-600">Update available!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Version {newVersion} is ready to install
                </p>
              </div>
            </div>
          )}

          {downloading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Downloading update...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {!available && !checking && !error && (
            <div className="p-3 bg-muted rounded-md flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">You're on the latest version</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={checkForUpdates}
              disabled={checking || downloading}
            >
              {checking ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Check for Updates
            </Button>
            {available && !downloading && (
              <Button onClick={downloadAndInstall}>
                <Download className="h-4 w-4 mr-2" />
                Download & Install
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
