import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { toast } from "@/hooks/use-toast";

type NotificationType = "success" | "error" | "info";

interface NotifyOptions {
  title: string;
  description?: string;
  type?: NotificationType;
}

// Check and request notification permission
async function ensureNotificationPermission(): Promise<boolean> {
  try {
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === "granted";
    }
    return permissionGranted;
  } catch {
    return false;
  }
}

// Check if app window is focused
function isWindowFocused(): boolean {
  return document.hasFocus();
}

// Get toast variant based on notification type
function getToastVariant(
  type: NotificationType
): "default" | "destructive" | "success" {
  switch (type) {
    case "success":
      return "success";
    case "error":
      return "destructive";
    default:
      return "default";
  }
}

/**
 * Show a notification (toast + system notification if app is in background)
 */
export async function notify(options: NotifyOptions): Promise<void> {
  const { title, description, type = "info" } = options;

  // Always show toast
  toast({
    title,
    description,
    variant: getToastVariant(type),
  });

  // Show system notification if window is not focused
  if (!isWindowFocused()) {
    const hasPermission = await ensureNotificationPermission();
    if (hasPermission) {
      try {
        sendNotification({
          title,
          body: description,
          sound: "default",
        });
      } catch (error) {
        console.error("Failed to send system notification:", error);
      }
    }
  }
}

/**
 * Hook to use notifications in components
 */
export function useNotification() {
  const notifySuccess = (title: string, description?: string) =>
    notify({ title, description, type: "success" });

  const notifyError = (title: string, description?: string) =>
    notify({ title, description, type: "error" });

  const notifyInfo = (title: string, description?: string) =>
    notify({ title, description, type: "info" });

  return {
    notify,
    notifySuccess,
    notifyError,
    notifyInfo,
  };
}
