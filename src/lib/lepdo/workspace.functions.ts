import { supabase } from "@/integrations/supabase/client";

export const WORKSPACE_ID = "lepdo-main";

/**
 * Workspace persistence runs through the public Data API using the publishable
 * key (baked into the client bundle at build time), so the app works on any
 * host — Lovable, Vercel, or a static deploy — without server-side secrets.
 * Row-level security limits access to the single shared `lepdo-main` row.
 */

/** Reads the shared LEPDO workspace snapshot as a JSON string. */
export async function loadWorkspace(): Promise<{
  json: string | null;
  updatedAt: string | null;
}> {
  const { data, error } = await supabase
    .from("workspace")
    .select("data, updated_at")
    .eq("id", WORKSPACE_ID)
    .maybeSingle();
  if (error) throw error;
  const row = data?.data ?? null;
  return {
    json: row ? JSON.stringify(row) : null,
    updatedAt: data?.updated_at ?? null,
  };
}

type SaveResult =
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: true; json: string | null; updatedAt: string | null };

async function conflictState(): Promise<SaveResult> {
  const { data } = await supabase
    .from("workspace")
    .select("data, updated_at")
    .eq("id", WORKSPACE_ID)
    .maybeSingle();
  return {
    ok: false,
    conflict: true,
    json: data?.data ? JSON.stringify(data.data) : null,
    updatedAt: data?.updated_at ?? null,
  };
}

/**
 * Writes the shared LEPDO workspace snapshot with optimistic concurrency.
 * `version` is the `updated_at` the client last read; the write only lands when
 * the row still carries that version, so a stale snapshot can never silently
 * replace newer data. On conflict the current row is returned for merging.
 */
export async function saveWorkspace(payload: {
  json: string;
  version?: string | null;
}): Promise<SaveResult> {
  if (!payload || typeof payload.json !== "string") {
    throw new Error("Invalid workspace payload");
  }
  const version = payload.version ?? null;
  const updatedAt = new Date().toISOString();
  const body = JSON.parse(payload.json) as never;

  if (version) {
    // Conditional update: only when the row is still at the version we read.
    const { data, error } = await supabase
      .from("workspace")
      .update({ data: body, updated_at: updatedAt })
      .eq("id", WORKSPACE_ID)
      .eq("updated_at", version)
      .select("updated_at");
    if (error) throw error;
    if (!data || data.length === 0) return conflictState();
    return { ok: true, updatedAt };
  }

  // No version yet: this client believes the row does not exist.
  const { error } = await supabase
    .from("workspace")
    .insert({ id: WORKSPACE_ID, data: body, updated_at: updatedAt });
  if (error) {
    if (error.code === "23505" || error.code === "23505".toString()) return conflictState();
    return conflictState();
  }
  return { ok: true, updatedAt };
}
