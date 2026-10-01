import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider, type HelmetServerState } from "react-helmet-async";
import { Toaster } from "sonner";
import type { ReactNode } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { CartProvider } from "@/hooks/useCart";
import { MapsProvider } from "@/features/maps/Maps";
import { AppRoutes } from "./routes";
import { isConfigured } from "@/lib/env";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
      mutations: { retry: 0 },
    },
  });
}

function ConfigMissing() {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-extrabold text-primary">Kapında</h1>
        <p>Uygulama yapılandırması eksik. Yönetici VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY değerlerini tanımlamalıdır.</p>
      </div>
    </div>
  );
}

export function AppProviders({ client, helmetContext, children }: { client: QueryClient; helmetContext?: { helmet?: HelmetServerState }; children: ReactNode }) {
  return (
    <HelmetProvider context={helmetContext}>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <CartProvider>
            <MapsProvider>{children}</MapsProvider>
          </CartProvider>
        </AuthProvider>
        <Toaster position="top-center" richColors closeButton />
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export function App() {
  if (!isConfigured && typeof window !== "undefined") return <ConfigMissing />;
  return <AppRoutes />;
}
