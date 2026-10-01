// Yalnız herkese açık (VITE_) değişkenler. service_role anahtarı istemciye ASLA verilmez.
// Tanımsız GitHub secret'ı boş dize olarak gelir; boş değer "tanımsız" sayılır.
const read = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined);

export const env = {
  supabaseUrl: read(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: read(import.meta.env.VITE_SUPABASE_ANON_KEY),
  siteUrl: (read(import.meta.env.VITE_SITE_URL) ?? "https://kapinda.site").replace(/\/$/, ""),
  mapsKey: read(import.meta.env.VITE_GOOGLE_MAPS_API_KEY),
  firebase: {
    apiKey: read(import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: read(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: read(import.meta.env.VITE_FIREBASE_PROJECT_ID),
    messagingSenderId: read(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: read(import.meta.env.VITE_FIREBASE_APP_ID),
  },
  vapidKey: read(import.meta.env.VITE_FIREBASE_VAPID_KEY),
};

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isFcmConfigured = Boolean(env.firebase.apiKey && env.firebase.projectId && env.firebase.appId && env.firebase.messagingSenderId && env.vapidKey);

export const BRAND = {
  name: "Kapında",
  supportEmail: "destek@kapinda.site",
  supportPhone: "+90 531 870 1189",
  supportPhoneHref: "tel:+905318701189",
  instagram: "kapinda_hopa",
  instagramUrl: "https://instagram.com/kapinda_hopa",
  city: "Hopa",
  province: "Artvin",
  postalCode: "08600",
  hoursLabel: "Her gün 09:00–23:00",
  center: { lat: 41.4086, lng: 41.4283 },
} as const;
