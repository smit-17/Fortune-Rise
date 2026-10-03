import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const ROLES: { id: AppRole; label: string; hint: string }[] = [
  { id: "super_admin", label: "Super Admin", hint: "Full access to everything, including roles" },
  { id: "owner", label: "Owner", hint: "All accounting data plus settings" },
  { id: "admin", label: "Admin", hint: "All accounting data, settings and users" },
  { id: "manager", label: "Manager", hint: "View, add and edit accounting data" },
  { id: "staff", label: "Staff", hint: "View and add accounting data" },
  { id: "viewer", label: "Viewer", hint: "View only" },
];

export function roleLabel(role: AppRole | undefined) {
  return ROLES.find((r) => r.id === role)?.label ?? "No role";
}

export const PERMISSIONS: { id: string; label: string; group: string }[] = [
  { id: "dashboard.view", label: "View dashboard", group: "General" },
  { id: "accounting.view", label: "View accounting data", group: "Accounting" },
  { id: "accounting.add", label: "Add records", group: "Accounting" },
  { id: "accounting.edit", label: "Edit records", group: "Accounting" },
  { id: "accounting.delete", label: "Delete records", group: "Accounting" },
  { id: "reports.view", label: "View reports & P&L", group: "Reports" },
  { id: "settings.view", label: "Open Settings", group: "Settings" },
  { id: "settings.edit", label: "Change settings", group: "Settings" },
  { id: "users.view", label: "View users", group: "Users" },
  { id: "users.add", label: "Add users", group: "Users" },
  { id: "users.edit", label: "Edit users & reset passwords", group: "Users" },
  { id: "dataset.reset", label: "Reset accounting data", group: "Danger" },
];

export const PERMISSION_IDS = PERMISSIONS.map((p) => p.id);

/** Which permission a page needs. Anything not listed needs accounting.view. */
export const PAGE_PERMISSION: Record<string, string> = {
  "/": "dashboard.view",
  "/pl": "reports.view",
  "/reports": "reports.view",
  "/settings": "settings.view",
};

export function pagePermission(path: string) {
  return PAGE_PERMISSION[path] ?? "accounting.view";
}

export const TIMEOUT_OPTIONS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour (system default)" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
];
