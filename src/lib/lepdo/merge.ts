/**
 * Merges two workspace snapshots so concurrent edits from different browsers
 * are combined instead of one replacing the other.
 *
 * Rules:
 * - Arrays of records with an `id`: union by id, the local copy wins for ids
 *   present on both sides (it is the edit the user just made).
 * - Plain objects (settings, profile, ...): merged field by field.
 * - Anything else: the local value wins when it is defined.
 */
type Rec = Record<string, unknown>;

const RESET_SCOPED_KEYS = new Set([
  "bankAccounts",
  "cashLocations",
  "parties",
  "brokers",
  "sellers",
  "salesInvoices",
  "purchaseBills",
  "transactions",
  "auditLogs",
  "liabilities",
  "liabilityEntries",
  "stockEntries",
  "teamMembers",
  "teamPayments",
  "goals",
  "emiPlans",
  "emiPayments",
]);

function isIdList(value: unknown): value is Rec[] {
  return (
    Array.isArray(value) &&
    value.every((v) => !!v && typeof v === "object" && typeof (v as Rec)["id"] === "string")
  );
}

function isPlainObject(value: unknown): value is Rec {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function mergeSnapshots<T extends Rec>(remote: Partial<T>, local: Partial<T>): Partial<T> {
  const out: Rec = { ...remote };
  for (const key of Object.keys(local)) {
    const l = (local as Rec)[key];
    const r = (remote as Rec)[key];
    if (isIdList(l) && isIdList(r)) {
      const byId = new Map<string, Rec>();
      for (const item of r) byId.set(item["id"] as string, item);
      for (const item of l) byId.set(item["id"] as string, item);
      out[key] = Array.from(byId.values());
    } else if (isPlainObject(l) && isPlainObject(r)) {
      out[key] = mergeSnapshots(r, l);
    } else if (l !== undefined) {
      out[key] = l;
    }
  }
  return out as Partial<T>;
}


/**
 * Three-way merge used when a save is rejected because another client wrote
 * first. `base` is the snapshot our local edits started from, `remote` is the
 * newest snapshot in the database and `local` is what we tried to save.
 *
 * Only fields the user actually changed (local differs from base) override the
 * remote value, so an untouched field never rolls back somebody else's edit.
 * Records added locally are kept, records deleted locally are dropped.
 */
export function mergeThreeWay<T extends Rec>(
  base: Partial<T>,
  remote: Partial<T>,
  local: Partial<T>,
): Partial<T> {
  const out: Rec = { ...remote };
  const resetOccurred =
    typeof (remote as Rec)["accountingResetAt"] === "string" &&
    (remote as Rec)["accountingResetAt"] !== (base as Rec)["accountingResetAt"];
  const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);
  for (const key of keys) {
    const b = (base as Rec)[key];
    const r = (remote as Rec)[key];
    const l = (local as Rec)[key];
    if (l === undefined) continue;
    // A database reset is authoritative. Never merge accounting records or
    // balances from a browser snapshot that predates the reset back into it.
    if (resetOccurred && RESET_SCOPED_KEYS.has(key)) continue;
    if (isIdList(l) && isIdList(r)) {
      const baseIds = new Set(isIdList(b) ? b.map((i) => i["id"] as string) : []);
      const baseById = new Map<string, string>();
      if (isIdList(b)) for (const i of b) baseById.set(i["id"] as string, JSON.stringify(i));
      const localIds = new Set(l.map((i) => i["id"] as string));
      const byId = new Map<string, Rec>();
      for (const item of r) {
        const id = item["id"] as string;
        // deleted locally (it existed in our base) -> drop it
        if (!localIds.has(id) && baseIds.has(id)) continue;
        byId.set(id, item);
      }
      for (const item of l) {
        const id = item["id"] as string;
        const changedLocally = baseById.get(id) !== JSON.stringify(item);
        if (changedLocally || !byId.has(id)) byId.set(id, item);
      }
      out[key] = Array.from(byId.values());
    } else if (isPlainObject(l) && isPlainObject(r)) {
      out[key] = mergeThreeWay(isPlainObject(b) ? b : {}, r, l);
    } else if (JSON.stringify(l) !== JSON.stringify(b)) {
      out[key] = l;
    }
  }
  return out as Partial<T>;
}
