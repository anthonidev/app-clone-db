import { useState, useEffect, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

interface UpdateState {
  available: boolean;
  checking: boolean;
  downloading: boolean;
  progress: number;
  version: string | null;
  error: string | null;
  downloadedBytes: number;
  totalBytes: number;
}

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({
    available: false,
    checking: false,
    downloading: false,
    progress: 0,
    version: null,
    error: null,
    downloadedBytes: 0,
    totalBytes: 0,
  });
  const [update, setUpdate] = useState<Update | null>(null);

  const checkForUpdates = useCallback(async () => {
    setState((s) => ({ ...s, checking: true, error: null }));

    try {
      const result = await check();
      if (result) {
        setUpdate(result);
        setState((s) => ({
          ...s,
          available: true,
          version: result.version,
          checking: false,
        }));
      } else {
        setState((s) => ({ ...s, available: false, checking: false }));
      }
    } catch (error) {
      setState((s) => ({
        ...s,
        checking: false,
        error: error as string,
      }));
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!update) return;

    let downloaded = 0;

    setState((s) => ({ ...s, downloading: true, progress: 0, downloadedBytes: 0, totalBytes: 0 }));

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          const contentLength = (event.data as { contentLength?: number }).contentLength ?? 0;
          setState((s) => ({
            ...s,
            totalBytes: contentLength,
          }));
        } else if (event.event === "Progress") {
          const chunkLength = (event.data as { chunkLength: number }).chunkLength;
          downloaded += chunkLength;
          setState((s) => ({
            ...s,
            downloadedBytes: downloaded,
            progress: s.totalBytes > 0 ? Math.round((downloaded / s.totalBytes) * 100) : 0,
          }));
        } else if (event.event === "Finished") {
          setState((s) => ({
            ...s,
            progress: 100,
          }));
        }
      });

      // Restart app
      await relaunch();
    } catch (error) {
      setState((s) => ({
        ...s,
        downloading: false,
        error: String(error),
      }));
    }
  }, [update]);

  // Check on mount
  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  return {
    ...state,
    checkForUpdates,
    downloadAndInstall,
  };
}
