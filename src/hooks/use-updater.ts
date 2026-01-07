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
}

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({
    available: false,
    checking: false,
    downloading: false,
    progress: 0,
    version: null,
    error: null,
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

    setState((s) => ({ ...s, downloading: true, progress: 0 }));

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Progress") {
          const { contentLength, chunkLength } = event.data as {
            contentLength: number;
            chunkLength: number;
          };
          setState((s) => ({
            ...s,
            progress: Math.round((chunkLength / contentLength) * 100),
          }));
        }
      });

      // Restart app
      await relaunch();
    } catch (error) {
      setState((s) => ({
        ...s,
        downloading: false,
        error: error as string,
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
