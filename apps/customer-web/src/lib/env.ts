// Yalnız herkese açık (VITE_) değişkenler. service_role anahtarı istemciye ASLA verilmez.
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  siteUrl: ((import.meta.env.VITE_SITE_URL as string | undefined) ?? "https://kapinda.site").replace(/\/$/, ""),
  mapsKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined,
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  },
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined,
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
