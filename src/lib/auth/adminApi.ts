import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { audit } from "./auth";
import type { AppRole } from "./permissions";

/**
 * Account creation uses a second, session-less Supabase client so signing up a
 * new person never replaces the administrator's own session. Every write below
 * still passes through row-level security, so the database — not this file — is
 * what actually decides whether the caller may do it.
 */
const signupClient = createClient<Database>(
  import.meta.env["VITE_SUPABASE_URL"] as string,
  import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);

export interface ManagedUser {
  id: string;
  full_name: string;
  email: string;
  status: string;
  session_timeout_minutes: number;
  must_change_password: boolean;
  last_login_at: string | null;
  role: AppRole | undefined;
  overrides: Record<string, boolean>;
}

export async function listUsers(): Promise<ManagedUser[]> {
  const [{ data: profiles, error }, { data: roles }, { data: overrides }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, email, status, session_timeout_minutes, must_change_password, last_login_at",
      )
      .order("created_at"),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("user_permissions").select("user_id, permission, allowed"),
  ]);
  if (error) throw error;
  return (profiles ?? []).map((p) => ({
    ...p,
    role: (roles ?? []).find((r) => r.user_id === p.id)?.role as AppRole | undefined,
    overrides: Object.fromEntries(
      (overrides ?? []).filter((o) => o.user_id === p.id).map((o) => [o.permission, o.allowed]),
    ),
  }));
}

export async function createUser(input: {
  fullName: string;
  email: string;
  password: string;
  role: AppRole;
  sessionTimeoutMinutes: number;
  status: "active" | "inactive";
}) {
  const email = input.email.trim().toLowerCase();
  const { data, error } = await signupClient.auth.signUp({
    email,
    password: input.password,
    options: { data: { full_name: input.fullName } },
  });
  if (error) throw new Error(error.message);
  const userId = data.user?.id;
  if (!userId) throw new Error("The account could not be created.");

  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    email,
    full_name: input.fullName,
    status: input.status,
    session_timeout_minutes: input.sessionTimeoutMinutes,
    must_change_password: true,
  });
  if (profileError) throw new Error(profileError.message);

  const { error: roleError } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role: input.role });
  if (roleError) throw new Error(roleError.message);

  await audit("user.created", email, "success", { role: input.role });
  return userId;
}

export async function updateUser(
  userId: string,
  patch: {
    full_name?: string;
    status?: "active" | "inactive";
    session_timeout_minutes?: number;
    must_change_password?: boolean;
  },
  email?: string,
) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw new Error(error.message);
  await audit("user.updated", email ?? userId, "success", { fields: Object.keys(patch) });
}

export async function setUserRole(userId: string, role: AppRole, email?: string) {
  await supabase.from("user_roles").delete().eq("user_id", userId);
  const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
  if (error) throw new Error(error.message);
  await audit("user.role_changed", email ?? userId, "success", { role });
}

export async function setUserOverrides(
  userId: string,
  overrides: Record<string, boolean>,
  email?: string,
) {
  await supabase.from("user_permissions").delete().eq("user_id", userId);
  const rows = Object.entries(overrides).map(([permission, allowed]) => ({
    user_id: userId,
    permission,
    allowed,
  }));
  if (rows.length > 0) {
    const { error } = await supabase.from("user_permissions").insert(rows);
    if (error) throw new Error(error.message);
  }
  await audit("user.permissions_changed", email ?? userId, "success");
}

/** Sends a password-reset link; the person sets their own new password. */
export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new Error(error.message);
  await audit("user.password_reset_sent", email, "success");
}

/** Changes the signed-in person's own password. */
export async function changeOwnPassword(currentPassword: string, password: string) {
  const { error } = await supabase.auth.updateUser({
    password,
    ...(currentPassword ? ({ current_password: currentPassword } as never) : {}),
  });
  if (error) throw new Error(error.message);
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    await supabase.from("profiles").update({ must_change_password: false }).eq("id", data.user.id);
  }
  await audit("user.password_changed", data.user?.email ?? null, "success");
}

export async function resetAccountingData() {
  const { error } = await supabase.rpc("reset_accounting_data");
  if (error) {
    await audit("dataset.reset", "accounting records", "failure", { message: error.message });
    throw new Error(error.message);
  }
  await audit("dataset.reset", "accounting records", "success");
}

export interface AuditRow {
  id: string;
  actor_email: string | null;
  action: string;
  target: string | null;
  result: string;
  created_at: string;
}

export async function listSecurityAudit(limit = 200): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from("security_audit_log")
    .select("id, actor_email, action, target, result, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
