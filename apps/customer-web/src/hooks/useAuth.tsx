import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { isConfigured } from "@/lib/env";
import type { Profile } from "@/types/db";
import type { AppRole } from "@kapinda/shared-contracts";
import { revokeCurrentPushToken } from "@/lib/fcm";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  profile: Profile | null;
  roles: AppRole[];
  isAdmin: boolean;
  refreshProfile: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isConfigured && typeof window !== "undefined");
  const qc = useQueryClient();

  useEffect(() => {
    if (!isConfigured || typeof window === "undefined") return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [{ data: profile, error }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, phone, referral_code, consents_complete, is_blocked").eq("id", userId!).single(),
        supabase.from("user_roles").select("role").eq("user_id", userId!),
      ]);
      if (error || rErr) throw error ?? rErr;
      return { profile: profile as Profile, roles: (roles ?? []).map((r) => r.role as AppRole) };
    },
  });

  const signOut = useCallback(async () => {
    await revokeCurrentPushToken().catch(() => undefined);
    await supabase.auth.signOut();
    qc.clear();
  }, [qc]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading: loading || (Boolean(userId) && profileQuery.isLoading),
      profile: profileQuery.data?.profile ?? null,
      roles: profileQuery.data?.roles ?? [],
      isAdmin: profileQuery.data?.roles.includes("admin") ?? false,
      refreshProfile: () => void profileQuery.refetch(),
      signOut,
    }),
    [session, loading, userId, profileQuery, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider eksik");
  return ctx;
}
