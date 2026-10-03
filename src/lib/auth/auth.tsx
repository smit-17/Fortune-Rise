import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { PERMISSION_IDS, type AppRole } from "./permissions";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  status: string;
  session_timeout_minutes: number;
  must_change_password: boolean;
  last_login_at: string | null;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  role: AppRole | undefined;
  permissions: Set<string>;
  can: (permission: string) => boolean;
  notice: string | null;
  clearNotice: () => void;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  signOut: (reason?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const KEY = "__lepdo_auth_ctx__";
const g = globalThis as unknown as Record<string, unknown>;
const AuthContext =
  (g[KEY] as React.Context<AuthState | null> | undefined) ??
  (g[KEY] = createContext<AuthState | null>(null));

const ACTIVITY_KEY = "lepdo.session.activity";
const GENERIC_ERROR = "Invalid email or password.";

/** Writes an audit row. Failures are never allowed to block the user. */
export async function audit(
  action: string,
  target?: string | null,
  result: "success" | "failure" | "error" = "success",
  metadata: Record<string, unknown> = {},
) {
  try {
    const { data } = await supabase.auth.getSession();
    await supabase.from("security_audit_log").insert({
      actor_id: data.session?.user.id ?? null,
      actor_email: data.session?.user.email ?? null,
      action,
      target: target ?? null,
      result,
      metadata: metadata as never,
    });
  } catch {
    /* audit is best-effort */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const signingOut = useRef(false);

  const loadAccess = useCallback(async (userId: string) => {
    const [{ data: prof }, { data: roleRows }, { data: overrides }] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, email, status, session_timeout_minutes, must_change_password, last_login_at",
        )
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("user_permissions").select("permission, allowed").eq("user_id", userId),
    ]);

    const myRoles = (roleRows ?? []).map((r) => r.role as AppRole);
    let allowed = new Set<string>();
    if (myRoles.includes("super_admin")) {
      allowed = new Set(PERMISSION_IDS);
    } else if (myRoles.length > 0) {
      const { data: rolePerms } = await supabase
        .from("role_permissions")
        .select("permission")
        .in("role", myRoles);
      allowed = new Set((rolePerms ?? []).map((r) => r.permission));
      for (const o of overrides ?? []) {
        if (o.allowed) allowed.add(o.permission);
        else allowed.delete(o.permission);
      }
    }

    setProfile((prof as Profile | null) ?? null);
    setRoles(myRoles);
    setPermissions(prof && prof.status === "active" ? allowed : new Set());
    return prof as Profile | null;
  }, []);

  const signOut = useCallback(async (reason?: string) => {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      await audit("logout", null, "success", reason ? { reason } : {});
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    setSession(null);
    setProfile(null);
    setRoles([]);
    setPermissions(new Set());
    if (reason) setNotice(reason);
    signingOut.current = false;
  }, []);

  useEffect(() => {
    let active = true;

    const hydrate = async (next: Session | null) => {
      if (!active) return;
      setSession(next);
      if (!next?.user) {
        setProfile(null);
        setRoles([]);
        setPermissions(new Set());
        setLoading(false);
        return;
      }
      const prof = await loadAccess(next.user.id);
      if (!active) return;
      if (!prof) {
        setLoading(false);
        await signOut("This account has no access to LEPDO Accounting.");
        return;
      }
      if (prof.status !== "active") {
        setLoading(false);
        await signOut("This account has been deactivated. Contact an administrator.");
        return;
      }
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => hydrate(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void hydrate(next);
      } else if (event === "TOKEN_REFRESHED") {
        setSession(next);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadAccess, signOut]);

  /* ---------- idle session timeout, shared across tabs ---------- */
  const timeoutMinutes = profile?.session_timeout_minutes ?? 60;
  useEffect(() => {
    if (!session?.user || timeoutMinutes <= 0) return;
    const limit = timeoutMinutes * 60 * 1000;

    const touch = () => {
      try {
        window.localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      } catch {
        /* storage unavailable */
      }
    };
    const lastActivity = () => {
      try {
        return Number(window.localStorage.getItem(ACTIVITY_KEY) ?? 0) || Date.now();
      } catch {
        return Date.now();
      }
    };
    touch();

    const events = ["mousedown", "keydown", "touchstart", "scroll", "focus"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });

    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity() > limit) {
        void signOut("Your session has expired. Please log in again.");
      }
    }, 15000);

    return () => {
      for (const e of events) window.removeEventListener(e, touch);
      window.clearInterval(timer);
    };
  }, [session?.user, timeoutMinutes, signOut]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const clean = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: clean,
        password,
      });
      if (error || !data.user) {
        await audit("login.failure", clean, "failure");
        return { ok: false, message: GENERIC_ERROR };
      }
      const prof = await loadAccess(data.user.id);
      if (!prof || prof.status !== "active") {
        await audit("login.blocked", clean, "failure", {
          reason: prof ? "inactive" : "no profile",
        });
        await supabase.auth.signOut();
        setSession(null);
        return {
          ok: false,
          message: prof
            ? "This account has been deactivated. Contact an administrator."
            : GENERIC_ERROR,
        };
      }
      await audit("login.success", clean, "success");
      await supabase
        .from("profiles")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", data.user.id);
      setNotice(null);
      return { ok: true };
    },
    [loadAccess],
  );

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadAccess(session.user.id);
  }, [session?.user, loadAccess]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      roles,
      role: roles[0],
      permissions,
      can: (permission: string) => permissions.has(permission),
      notice,
      clearNotice: () => setNotice(null),
      signIn,
      signOut,
      refreshProfile,
    }),
    [loading, session, profile, roles, permissions, notice, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
