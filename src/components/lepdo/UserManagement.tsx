import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth";
import {
  createUser,
  listSecurityAudit,
  listUsers,
  sendPasswordReset,
  setUserOverrides,
  setUserRole,
  updateUser,
  type AuditRow,
  type ManagedUser,
} from "@/lib/auth/adminApi";
import {
  PERMISSIONS,
  ROLES,
  TIMEOUT_OPTIONS,
  roleLabel,
  type AppRole,
} from "@/lib/auth/permissions";
import { ModalShell, SectionCard, EmptyState } from "@/components/lepdo/shared";
import { formatDateTime } from "@/lib/lepdo/format";
import { cn } from "@/lib/utils";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

interface FormState {
  id?: string;
  fullName: string;
  email: string;
  password: string;
  confirm: string;
  role: AppRole;
  sessionTimeoutMinutes: number;
  active: boolean;
}

const EMPTY: FormState = {
  fullName: "",
  email: "",
  password: "",
  confirm: "",
  role: "staff",
  sessionTimeoutMinutes: 60,
  active: true,
};

export function UserManagement() {
  const { can, roles, user: me, refreshProfile } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [permTarget, setPermTarget] = useState<ManagedUser | null>(null);
  const [permDraft, setPermDraft] = useState<Record<string, boolean>>({});
  const [roleDefaults, setRoleDefaults] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, { data: defaults }] = await Promise.all([
        listUsers(),
        supabase.from("role_permissions").select("role, permission"),
      ]);
      setUsers(list);
      const grouped: Record<string, string[]> = {};
      for (const row of defaults ?? []) {
        (grouped[row.role] ??= []).push(row.permission);
      }
      setRoleDefaults(grouped);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Users could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (can("users.view")) void load();
    else setLoading(false);
  }, [can, load]);

  const save = async () => {
    if (!form) return;
    if (!form.fullName.trim() || !form.email.trim()) {
      toast.error("Name and email are required.");
      return;
    }
    setBusy(true);
    try {
      if (form.id) {
        const existing = users.find((u) => u.id === form.id);
        await updateUser(
          form.id,
          {
            full_name: form.fullName.trim(),
            session_timeout_minutes: form.sessionTimeoutMinutes,
            ...(form.id === me?.id
              ? {}
              : { status: form.active ? ("active" as const) : ("inactive" as const) }),
          },
          form.email,
        );
        if (existing && existing.role !== form.role) {
          await setUserRole(form.id, form.role, form.email);
        }
        toast.success("User updated.");
      } else {
        if (form.password.length < 8) {
          toast.error("Use a password of at least 8 characters.");
          setBusy(false);
          return;
        }
        if (form.password !== form.confirm) {
          toast.error("The two passwords do not match.");
          setBusy(false);
          return;
        }
        await createUser({
          fullName: form.fullName.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          role: form.role,
          sessionTimeoutMinutes: form.sessionTimeoutMinutes,
          status: form.active ? "active" : "inactive",
        });
        toast.success("User created. They must change the password at first login.");
      }
      setForm(null);
      await load();
      await refreshProfile();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The user could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (u: ManagedUser) => {
    if (u.id === me?.id) {
      toast.error("You cannot deactivate your own account.");
      return;
    }
    try {
      await updateUser(u.id, { status: u.status === "active" ? "inactive" : "active" }, u.email);
      toast.success(u.status === "active" ? "User deactivated." : "User activated.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The change was refused.");
    }
  };

  const resetPassword = async (u: ManagedUser) => {
    try {
      await sendPasswordReset(u.email);
      await updateUser(u.id, { must_change_password: true }, u.email);
      toast.success(`A password reset link was sent to ${u.email}.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The reset link could not be sent.");
    }
  };

  const openPermissions = (u: ManagedUser) => {
    setPermTarget(u);
    const defaults = roleDefaults[u.role ?? ""] ?? [];
    const effective: Record<string, boolean> = {};
    for (const p of PERMISSIONS) {
      effective[p.id] = u.overrides[p.id] ?? defaults.includes(p.id);
    }
    setPermDraft(effective);
  };

  const savePermissions = async () => {
    if (!permTarget) return;
    const defaults = new Set(roleDefaults[permTarget.role ?? ""] ?? []);
    const overrides: Record<string, boolean> = {};
    for (const p of PERMISSIONS) {
      const wanted = permDraft[p.id] === true;
      if (wanted !== defaults.has(p.id)) overrides[p.id] = wanted;
    }
    setBusy(true);
    try {
      await setUserOverrides(permTarget.id, overrides, permTarget.email);
      toast.success("Permissions saved.");
      setPermTarget(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Permissions could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, typeof PERMISSIONS>();
    for (const p of PERMISSIONS) {
      map.set(p.group, [...(map.get(p.group) ?? []), p]);
    }
    return [...map.entries()];
  }, []);

  if (!can("users.view")) return null;

  return (
    <>
      <SectionCard
        title="User Management"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
            {can("users.add") ? (
              <Button size="sm" onClick={() => setForm({ ...EMPTY })}>
                <Plus className="size-4" /> Add user
              </Button>
            ) : null}
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading users…
          </div>
        ) : users.length === 0 ? (
          <EmptyState title="No users yet" hint="Add a user to give them access." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="bg-muted/60">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                    <TableCell className="text-xs">{u.email}</TableCell>
                    <TableCell className="text-xs">{roleLabel(u.role)}</TableCell>
                    <TableCell className="text-xs">{u.session_timeout_minutes} min</TableCell>
                    <TableCell className="text-xs">
                      {u.last_login_at ? formatDateTime(u.last_login_at) : "Never"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-xs font-medium",
                          u.status === "active" ? "text-sl-paid" : "text-muted-foreground",
                        )}
                      >
                        {u.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {can("users.edit") ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setForm({
                                  id: u.id,
                                  fullName: u.full_name,
                                  email: u.email,
                                  password: "",
                                  confirm: "",
                                  role: u.role ?? "staff",
                                  sessionTimeoutMinutes: u.session_timeout_minutes,
                                  active: u.status === "active",
                                })
                              }
                            >
                              Edit
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void resetPassword(u)}>
                              Reset password
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void toggleActive(u)}>
                              {u.status === "active" ? "Deactivate" : "Activate"}
                            </Button>
                          </>
                        ) : null}
                        {isSuperAdmin ? (
                          <Button size="sm" variant="ghost" onClick={() => openPermissions(u)}>
                            Permissions
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Passwords are never stored in this app — they are held, encrypted, by the sign-in service.
          Roles and permissions are also checked inside the database, so hiding a button is never
          the only protection.
        </p>
      </SectionCard>

      <SecurityActivity />

      <ModalShell
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit user" : "Add user"}
        width="max-w-[520px]"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {form ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Full name">
              <Input
                className="h-9"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                className="h-9"
                type="email"
                disabled={!!form.id}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            {form.id ? null : (
              <>
                <Field label="Password">
                  <Input
                    className="h-9"
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </Field>
                <Field label="Confirm password">
                  <Input
                    className="h-9"
                    type="password"
                    autoComplete="new-password"
                    value={form.confirm}
                    onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  />
                </Field>
              </>
            )}
            <Field label="Role">
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={form.role}
                disabled={!isSuperAdmin}
                onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })}
              >
                {ROLES.filter((r) => r.id !== "super_admin" || isSuperAdmin).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} — {r.hint}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Session timeout">
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={form.sessionTimeoutMinutes}
                onChange={(e) =>
                  setForm({ ...form, sessionTimeoutMinutes: Number(e.target.value) })
                }
              >
                {TIMEOUT_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Account active">
                <div className="flex h-9 items-center gap-2">
                  <Switch
                    checked={form.active}
                    disabled={form.id === me?.id}
                    onCheckedChange={(v) => setForm({ ...form, active: v })}
                  />
                  <span className="text-xs text-muted-foreground">
                    Inactive people cannot sign in and any open session stops working.
                  </span>
                </div>
              </Field>
            </div>
            {isSuperAdmin ? null : (
              <p className="text-[11px] text-muted-foreground sm:col-span-2">
                Only a Super Admin can change roles and per-person permissions.
              </p>
            )}
          </div>
        ) : null}
      </ModalShell>

      <ModalShell
        open={!!permTarget}
        onClose={() => setPermTarget(null)}
        title={`Permissions — ${permTarget?.full_name || permTarget?.email || ""}`}
        subtitle={`Role default: ${roleLabel(permTarget?.role)}`}
        width="max-w-[640px]"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setPermTarget(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void savePermissions()}>
              {busy ? "Saving…" : "Save permissions"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {grouped.map(([group, items]) => (
            <div key={group}>
              <p className="mb-1 text-xs font-semibold text-navy">{group}</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {items.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="size-4 cursor-pointer"
                      checked={permDraft[p.id] === true}
                      onChange={(e) => setPermDraft({ ...permDraft, [p.id]: e.target.checked })}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ModalShell>
    </>
  );
}

function SecurityActivity() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSecurityAudit()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <SectionCard title="Login & security activity">
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading activity…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No security activity recorded yet" />
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[620px]">
            <TableHeader>
              <TableRow className="bg-muted/60">
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>What happened</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{formatDateTime(r.created_at)}</TableCell>
                  <TableCell className="text-xs">{r.actor_email ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.action}</TableCell>
                  <TableCell className="text-xs">{r.target ?? "—"}</TableCell>
                  <TableCell
                    className={cn(
                      "text-xs font-medium",
                      r.result === "success" ? "text-sl-paid" : "text-destructive",
                    )}
                  >
                    {r.result}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </SectionCard>
  );
}
