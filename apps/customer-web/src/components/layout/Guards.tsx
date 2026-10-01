import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Spinner } from "@/components/ui/misc";
import { ConsentGate } from "@/features/auth/ConsentGate";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, profile } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner />
      </div>
    );
  }
  if (!user) return <Navigate to={`/giris?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (profile && !profile.consents_complete) return <ConsentGate />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner />
      </div>
    );
  }
  if (!user) return <Navigate to="/giris?next=/admin" replace />;
  // UI gizlemek güvenlik değildir: tüm admin verileri ayrıca RLS ve admin RPC'leriyle sunucuda korunur.
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
