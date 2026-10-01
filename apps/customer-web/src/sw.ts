/// <reference lib="webworker" />
// Service worker: uygulama kabuğu önbelleği, çevrimdışı sayfa ve FCM arka plan bildirimleri.
// API (Supabase) istekleri ÖNBELLEĞE ALINMAZ; çevrimdışı sipariş kuyruğu YOKTUR.
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from "workbox-precaching";
import { registerRoute, setCatchHandler, NavigationRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(new NetworkFirst({ cacheName: "kapinda-pages", networkTimeoutSeconds: 4 }), { denylist: [/^\/admin/, /^\/auth\//] }));

setCatchHandler(async ({ request }) => {
  if (request.destination === "document") return (await matchPrecache("/offline.html")) ?? Response.error();
  return Response.error();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId) {
  const messaging = getMessaging(initializeApp(firebaseConfig));
  onBackgroundMessage(messaging, (payload) => {
    // notification alanı olan mesajları tarayıcı zaten gösterir; yalnız data mesajları burada gösterilir
    if (payload.notification) return;
    const title = payload.data?.title ?? "Kapında";
    void self.registration.showNotification(title, {
      body: payload.data?.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: payload.data,
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const orderId = (event.notification.data as Record<string, string> | undefined)?.order_id;
  const url = orderId ? `/siparislerim/${orderId}` : "/";
  event.waitUntil(self.clients.openWindow(url));
});
