// FCM Web Push. Firebase yalnız bildirim altyapısı için kullanılır; kimlik ve veri Supabase'tedir.
import { env, isFcmConfigured } from "./env";
import { supabase } from "./supabase";

const TOKEN_KEY = "kapinda.fcm.token";
const DEVICE_KEY = "kapinda.device.id";

function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && isFcmConfigured && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

export async function enablePush(app: "customer" | "admin"): Promise<"enabled" | "denied" | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);
  const firebaseApp = getApps()[0] ?? initializeApp(env.firebase as Record<string, string>);
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(firebaseApp), { vapidKey: env.vapidKey, serviceWorkerRegistration: registration });
  if (!token) return "unsupported";
  const { error } = await supabase.rpc("register_device_token", {
    p_token: token,
    p_app: app,
    p_platform: "web",
    p_device_id: deviceId(),
    p_device_name: navigator.userAgent.slice(0, 200),
  });
  if (error) throw error;
  localStorage.setItem(TOKEN_KEY, token);
  return "enabled";
}

export async function revokeCurrentPushToken(): Promise<void> {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  await supabase.rpc("revoke_device_token", { p_token: token });
  localStorage.removeItem(TOKEN_KEY);
}

export function pushEnabledLocally(): boolean {
  return typeof window !== "undefined" && Boolean(localStorage.getItem(TOKEN_KEY)) && Notification?.permission === "granted";
}
