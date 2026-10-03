import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Context,
} from "react";
import { buildSeed } from "./seed";
import { round2, uid } from "./format";
import { categoryMap } from "./constants";
import { DEFAULT_SETTINGS } from "./extras";
import { mergeMasters } from "./masters";
import { isLedgerEntry } from "./entry";
import { mergeThreeWay } from "@/lib/lepdo/merge";
import { loadWorkspace, saveWorkspace, WORKSPACE_ID } from "@/lib/lepdo/workspace.functions";
import { supabase } from "@/integrations/supabase/client";


import type {
  Allocation,
  AppSettings,
  AuditEntry,
  BankAccount,
  CashLocation,
  Contact,
  EntryChange,
  Invoice,
  LepdoData,
  Party,
  SourceType,
  Transaction,
} from "./types";

// No browser storage: the database row is the single source of truth.
const USER = "LEPDO Admin";

export interface NewEntryInput {
  date: string;
  sourceType: SourceType;
  accountId: string;
  direction: "in" | "out";
  amount: number;
  category: Transaction["category"];
  partyId: string | null;
  particulars: string;
  reference?: string | undefined;
  paymentMethod?: string | undefined;
  notes?: string | undefined;
  attachmentName?: string | undefined;
  allocations?: Allocation[] | undefined;
  uchhinaReturnDate?: string | undefined;
  drawingCategory?: string | undefined;
  expenseCategory?: string | undefined;
  expensePaid?: boolean | undefined;
  /** true for entries recorded through Bank Entry / Cash Entry */
  ledger?: boolean | undefined;
  /** destination for transfer categories */
  destinationType?: SourceType | undefined;
  destinationId?: string | undefined;
}

/** Fields shared by sales invoices and purchase bills (all optional). */
export interface InvoiceExtraInput {
  dueDays?: number | undefined;
  discountMode?: Invoice["discountMode"];
  discountValue?: number | undefined;
  supplyLocation?: Invoice["supplyLocation"];
  cgstAmount?: number | undefined;
  sgstAmount?: number | undefined;
  igstAmount?: number | undefined;
}

export interface SalesInvoiceInput extends InvoiceExtraInput {
  id?: string | undefined;
  number: string;
  partyId: string;
  date: string;
  /** empty string = no due date */
  dueDate: string;
  sellerName?: string | undefined;
  sellerIncentivePercent?: number | undefined;
  platform?: string | undefined;
  invoiceKind?: Invoice["invoiceKind"];
  jewelryItems?: Invoice["jewelryItems"];
  foreignTotal?: number | undefined;
  saleType?: Invoice["saleType"];
  currency?: string | undefined;
  exchangeRate?: number | undefined;
  gstType?: Invoice["gstType"];
  gstRate?: number | undefined;
  lines: Invoice["lines"];
  subtotal: number;
  discount: number;
  taxableAmount: number;
  taxAmount: number;
  shipping: number;
  roundOff: number;
  total: number;
  notes?: string | undefined;
}

export interface PurchaseBillInput extends InvoiceExtraInput {
  id?: string | undefined;
  number: string;
  partyId: string;
  date: string;
  /** empty string = no due date */
  dueDate: string;
  paymentTermsDays?: number | undefined;
  brokerName?: string | undefined;
  supplierInvoiceNumber?: string | undefined;
  billKind: NonNullable<Invoice["billKind"]>;
  usdRate?: number | undefined;
  purchaseType?: Invoice["purchaseType"];
  gstRate?: number | undefined;
  lines?: Invoice["lines"];
  makingLines?: Invoice["makingLines"];
  subtotal: number;
  discount?: number | undefined;
  taxableAmount?: number | undefined;
  taxAmount?: number | undefined;
  total: number;
  notes?: string | undefined;
}


export interface CustomerInput {
  id?: string | undefined;
  name: string;
  phone?: string | undefined;
  email?: string | undefined;
  gstin?: string | undefined;
  billingAddress?: string | undefined;
  country?: string | undefined;
  company?: string | undefined;
  city?: string | undefined;
  type?: Party["type"] | undefined;
}

export interface ContactInput {
  id?: string | undefined;
  kind: Contact["kind"];
  name: string;
  phone?: string | undefined;
  company?: string | undefined;
  role?: string | undefined;
  rateType: Contact["rateType"];
  rate?: number | undefined;
  notes?: string | undefined;
}

export type ExtraKey =
  | "liabilities"
  | "liabilityEntries"
  | "stockEntries"
  | "teamMembers"
  | "teamPayments"
  | "goals"
  | "emiPlans"
  | "emiPayments";


export interface AuditFields {
  id: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

interface StoreValue extends LepdoData {
  ready: boolean;
  /** null while healthy; a message when the database could not be reached */
  syncError: string | null;
  /** re-fetch the latest database snapshot */
  refresh: () => Promise<void>;
  /** replace the whole workspace in the database (backup restore) */
  replaceAll: (snapshot: Partial<LepdoData>) => void;

  addEntry: (input: NewEntryInput) => { ok: boolean; message: string };
  updateEntry: (
    id: string,
    input: NewEntryInput,
    reason?: string,
  ) => { ok: boolean; message: string };
  voidEntry: (id: string, reason?: string) => void;
  restoreEntry: (id: string) => void;
  toggleReconciled: (id: string) => void;

  duplicateEntry: (id: string) => void;
  addParty: (name: string, type: Party["type"]) => Party;
  ensureParties: (list: Party[]) => void;
  ensureBankAccounts: (list: BankAccount[]) => void;
  saveBankAccount: (acc: Omit<BankAccount, "id"> & { id?: string }) => void;
  saveCashLocation: (loc: Omit<CashLocation, "id"> & { id?: string }) => void;
  resetDemoData: () => void;
  balanceOf: (sourceType: SourceType, accountId: string) => number;
  lastUpdatedOf: (accountId: string) => string | null;
  openInvoices: (kind: "sales" | "purchase", partyId: string | null) => Invoice[];
  isLikelyDuplicate: (input: NewEntryInput, ignoreId?: string) => boolean;
  nextInvoiceNumber: () => string;
  saveSalesInvoice: (input: SalesInvoiceInput) => { ok: boolean; message: string; id?: string };
  voidSalesInvoice: (id: string) => void;
  restoreSalesInvoice: (id: string) => void;
  saveCustomer: (input: CustomerInput) => Party;
  /** permanently delete a customer/supplier master record */
  removeParty: (id: string) => void;
  nextPurchaseBillNumber: () => string;
  savePurchaseBill: (input: PurchaseBillInput) => { ok: boolean; message: string; id?: string };
  voidPurchaseBill: (id: string) => void;
  restorePurchaseBill: (id: string) => void;
  saveContact: (input: ContactInput) => { ok: boolean; message: string; contact?: Contact };
  /** upsert any of the extra collections (liabilities, stock, team, goals) */
  saveRecord: <K extends ExtraKey>(key: K, item: LepdoData[K][number]) => void;
  /** flip the voided flag on a record inside an extra collection */
  setRecordVoided: (key: ExtraKey, id: string, voided: boolean) => void;
  removeRecord: (key: ExtraKey, id: string) => void;
  saveSettings: (patch: Partial<AppSettings>) => void;
  /** add or rename a master value (Settings › Master Data) */
  saveMaster: (masterId: string, value: { id?: string; name: string; active?: boolean }) => void;
  /** deactivate / reactivate a master value without touching history */
  setMasterActive: (masterId: string, id: string, active: boolean) => void;
  /** delete a master value — blocked when the value is used historically */
  removeMaster: (masterId: string, id: string) => { ok: boolean; message: string };

  stamp: <T extends object>(
    prefix: string,
    item: T & { id?: string | undefined },
  ) => T & AuditFields;
}

// Keep the context identity stable across HMR updates so the provider and
// consumers never end up on two different context objects.
const g = globalThis as unknown as { __lepdoStoreCtx?: Context<StoreValue | null> };
const StoreContext = (g.__lepdoStoreCtx ??= createContext<StoreValue | null>(null));

function hydrate(parsed: Partial<LepdoData> | null | undefined): LepdoData {
  const seed = buildSeed();
  if (!parsed || Object.keys(parsed).length === 0) return seed;
  const deletedPartyIds = parsed.deletedPartyIds ?? {};
  return {
    ...seed,
    ...parsed,
    deletedPartyIds,
    parties: (parsed.parties ?? seed.parties).filter((party) => !deletedPartyIds[party.id]),
    brokers: parsed.brokers ?? [],
    sellers: parsed.sellers ?? [],
    liabilities: parsed.liabilities ?? [],
    liabilityEntries: parsed.liabilityEntries ?? [],
    stockEntries: parsed.stockEntries ?? [],
    teamMembers: parsed.teamMembers ?? [],
    teamPayments: parsed.teamPayments ?? [],
    goals: parsed.goals ?? [],
    emiPlans: parsed.emiPlans ?? [],
    emiPayments: parsed.emiPayments ?? [],
    masters: mergeMasters(parsed.masters),

    settings: {
      ...DEFAULT_SETTINGS,
      ...(parsed.settings ?? {}),
      business: { ...DEFAULT_SETTINGS.business, ...(parsed.settings?.business ?? {}) },
      branding: { ...DEFAULT_SETTINGS.branding, ...(parsed.settings?.branding ?? {}) },
      invoice: { ...DEFAULT_SETTINGS.invoice, ...(parsed.settings?.invoice ?? {}) },
      rules: { ...DEFAULT_SETTINGS.rules, ...(parsed.settings?.rules ?? {}) },
      security: { ...DEFAULT_SETTINGS.security, ...(parsed.settings?.security ?? {}) },
    },
  };
}

// The database is the single source of truth: there is no browser-local copy of
// application data. An empty workspace simply renders empty states until the
// first record is saved to the database.


let counter = 2000;
function nextCode(): string {
  counter += 1;
  return `TXN-${counter}`;
}

export function LepdoProvider({ children }: { children: ReactNode; userId?: string }) {
  const [data, setData] = useState<LepdoData>(() => buildSeed());
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Snapshot JSON we last pushed/received, so realtime echoes of our own write
  // (and identical payloads) never trigger a pointless re-render or write-back.
  const syncedJsonRef = useRef<string | null>(null);
  // Snapshot our local edits are based on (last state agreed with the cloud).
  const baseJsonRef = useRef<string | null>(null);
  // set when state came from the cloud: skips one save cycle so remote data is
  // never immediately pushed back (which would fight other clients).
  const fromRemoteRef = useRef(false);
  // `updated_at` of the snapshot this client is based on (optimistic concurrency).
  const versionRef = useRef<string | null>(null);

  // Latest local state, readable from callbacks without re-subscribing.
  const dataRef = useRef<LepdoData>(data);
  dataRef.current = data;

  const applyRemote = useCallback(
    (parsed: Partial<LepdoData>, json: string, updatedAt: string | null) => {
      // Ignore stale snapshots (e.g. a delayed echo of one of our own earlier
      // writes arriving after a newer save): they would resurrect records the
      // user has just deleted.
      if (
        updatedAt &&
        versionRef.current &&
        updatedAt <= versionRef.current &&
        syncedJsonRef.current !== json
      ) {
        return;
      }
      versionRef.current = updatedAt;
      if (syncedJsonRef.current === json) {
        baseJsonRef.current = json;
        return;
      }

      // Unsaved local edits (a write is still debounced/in flight): merge the
      // remote snapshot into ours instead of discarding what the user just did.
      const localJson = JSON.stringify(dataRef.current);
      const hasLocalEdits =
        syncedJsonRef.current !== null && localJson !== syncedJsonRef.current;

      let nextParsed = parsed;
      let nextJson = json;
      if (hasLocalEdits) {
        const base = baseJsonRef.current
          ? (JSON.parse(baseJsonRef.current) as Partial<LepdoData>)
          : parsed;
        nextParsed = mergeThreeWay(
          base,
          parsed,
          JSON.parse(localJson) as Partial<LepdoData>,
        );
        nextJson = JSON.stringify(nextParsed);
      }
      baseJsonRef.current = json;

      const loaded = hydrate(nextParsed);
      counter = Math.max(
        counter,
        2000,
        ...loaded.transactions.map((t) => Number(t.code.replace("TXN-", "")) || 0),
      );
      // A merged snapshot still has to be pushed; a pure remote one does not.
      if (!hasLocalEdits) {
        syncedJsonRef.current = nextJson;
        fromRemoteRef.current = true;
      }
      setData(loaded);
    },
    [],
  );

  const pullRef = useRef<() => Promise<void>>(async () => {});

  const refresh = useCallback(() => pullRef.current(), []);

  // Load: the database row is the only source of application data.
  useEffect(() => {
    let cancelled = false;

    const pull = async () => {
      try {
        const { json, updatedAt } = await loadWorkspace();
        if (cancelled) return;
        const remote = json ? (JSON.parse(json) as Partial<LepdoData>) : null;
        if (remote && json && Object.keys(remote).length > 0) {
          applyRemote(remote, json, updatedAt);
        } else {
          versionRef.current = updatedAt;
        }
        setSyncError(null);
      } catch {
        if (!cancelled) setSyncError("Could not reach the database. Retrying…");
      } finally {
        if (!cancelled) setReady(true);
      }
    };
    pullRef.current = pull;

    void pull();

    // Realtime: the database row is the single source of truth. Any insert or
    // update from another tab/browser/device pushes the new snapshot here.
    const channel = supabase
      .channel("lepdo-workspace")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace", filter: `id=eq.${WORKSPACE_ID}` },
        (payload) => {
          const row = (payload.new ?? null) as { data?: unknown; updated_at?: string } | null;
          if (!row?.data) return;
          try {
            const json = JSON.stringify(row.data);
            applyRemote(row.data as Partial<LepdoData>, json, row.updated_at ?? null);
          } catch {
            void pull();
          }
        },
      )
      .subscribe((status) => {
        // Reconnected after a drop: re-pull in case events were missed.
        if (status === "SUBSCRIBED") void pull();
      });

    const onWake = () => {
      if (document.visibilityState === "visible") void pull();
    };
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
      void supabase.removeChannel(channel);
    };
  }, [applyRemote]);


  // Save: every change is written straight to the database (debounced) with a
  // version check. A rejected (stale) write is merged with the newest remote
  // snapshot and retried, so concurrent edits from two browsers are never lost.
  useEffect(() => {
    if (!ready) return;
    const json = JSON.stringify(data);
    if (fromRemoteRef.current) {
      fromRemoteRef.current = false;
      return;
    }
    if (syncedJsonRef.current === json) return;

    const push = async (payloadJson: string, attempt: number): Promise<void> => {
      syncedJsonRef.current = payloadJson;
      const res = await saveWorkspace({
        json: payloadJson,
        version: versionRef.current,
      });
      if (res.ok) {
        versionRef.current = res.updatedAt;
        baseJsonRef.current = payloadJson;
        setSyncError(null);
        return;
      }
      // Someone else wrote first: three-way merge their snapshot with ours
      // (only fields we actually changed win) and retry.
      versionRef.current = res.updatedAt;
      if (attempt >= 3) {
        syncedJsonRef.current = null;
        return;
      }
      const remote = res.json ? (JSON.parse(res.json) as Partial<LepdoData>) : {};
      const base = baseJsonRef.current
        ? (JSON.parse(baseJsonRef.current) as Partial<LepdoData>)
        : remote;
      const merged = mergeThreeWay(
        base,
        remote,
        JSON.parse(payloadJson) as Partial<LepdoData>,
      );
      const mergedJson = JSON.stringify(merged);
      applyRemote(merged, mergedJson, versionRef.current);
      await push(mergedJson, attempt + 1);
    };

    const timer = window.setTimeout(() => {
      void push(json, 0).catch(() => {
        // write failed (offline / server error): allow a retry on next change
        // or reconnect, and tell the user their change is not saved yet.
        syncedJsonRef.current = null;
        setSyncError("Changes could not be saved to the database. Retrying…");
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [data, ready, applyRemote]);






  const log = useCallback(
    (action: string, entity: string, detail: string): AuditEntry => ({
      id: uid("aud"),
      at: new Date().toISOString(),
      action,
      entity,
      detail,
      by: USER,
    }),
    [],
  );

  const applyAllocations = useCallback(
    (
      state: LepdoData,
      allocations: Allocation[] | undefined,
      kind: "sales" | "purchase" | null,
      sign: 1 | -1,
    ): LepdoData => {
      if (!allocations?.length || !kind) return state;
      const key = kind === "sales" ? "salesInvoices" : "purchaseBills";
      const list = state[key].map((inv) => {
        const alloc = allocations.find((a) => a.invoiceId === inv.id);
        if (!alloc) return inv;
        return { ...inv, paid: round2(Math.max(0, inv.paid + sign * alloc.amount)) };
      });
      return { ...state, [key]: list };
    },
    [],
  );

  const buildTransactions = useCallback((input: NewEntryInput): Transaction[] => {
    const now = new Date().toISOString();
    const meta = input.category ? categoryMap[input.category] : undefined;
    const allocated = round2((input.allocations ?? []).reduce((s, a) => s + a.amount, 0));
    const base: Transaction = {
      id: uid("tx"),
      code: nextCode(),
      date: input.date,
      sourceType: input.sourceType,
      accountId: input.accountId,
      direction: input.direction,
      amount: round2(input.amount),
      category: input.category,
      partyId: input.partyId,
      particulars: input.particulars.trim(),
      reference: input.reference?.trim() || undefined,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      attachmentName: input.attachmentName,
      allocations: input.allocations,
      advanceAmount: meta?.needsAllocation ? round2(input.amount - allocated) : undefined,
      uchhinaReturnDate: input.uchhinaReturnDate,
      drawingCategory: input.drawingCategory,
      expenseCategory: input.expenseCategory,
      expensePaid: input.expensePaid,
      ledger: input.ledger,
      history: [
        {
          at: now,
          by: USER,
          action: "created",
          detail: `entry created — ₹${round2(input.amount)}`,
        },
      ],
      reconciled: false,
      voided: false,
      createdAt: now,
      updatedAt: now,
      createdBy: USER,
    };

    if (meta?.isTransfer && input.destinationId && input.destinationType) {
      const groupId = uid("trf");
      const ref = base.reference ?? groupId.toUpperCase();
      return [
        { ...base, direction: "out", transferGroupId: groupId, reference: ref },
        {
          ...base,
          id: uid("tx"),
          code: nextCode(),
          sourceType: input.destinationType,
          accountId: input.destinationId,
          direction: "in",
          transferGroupId: groupId,
          reference: ref,
          particulars: `${base.particulars} (transfer in)`,
        },
      ];
    }
    return [base];
  }, []);

  const validate = useCallback((input: NewEntryInput): string | null => {
    if (!input.date) return "Date is required.";
    const unpaidExpense = input.category === "expense" && input.expensePaid === false;
    if (!input.accountId && !unpaidExpense) return "Account / location is required.";
    if (!(input.amount > 0)) return "Amount must be greater than zero.";
    if (!input.particulars.trim()) return "Particulars are required.";
    if (!input.category) return "Please select a transaction category.";
    const meta = categoryMap[input.category];
    if (meta.isTransfer) {
      if (!input.destinationId) return "Select a destination account or cash location.";
      if (input.destinationId === input.accountId)
        return "Source and destination cannot be the same.";
    } else if (meta.needsAllocation && !input.partyId) {
      return "Party / person is required.";
    }
    const allocated = round2((input.allocations ?? []).reduce((s, a) => s + a.amount, 0));
    if (allocated > round2(input.amount))
      return "Allocated amount cannot exceed the payment amount.";
    return null;
  }, []);

  const balanceOf = useCallback(
    (sourceType: SourceType, accountId: string) => {
      const opening =
        sourceType === "bank"
          ? (data.bankAccounts.find((b) => b.id === accountId)?.openingBalance ?? 0)
          : (data.cashLocations.find((c) => c.id === accountId)?.openingBalance ?? 0);
      const delta = data.transactions
        .filter((t) => !t.voided && isLedgerEntry(t) && t.accountId === accountId)
        .reduce((sum, t) => sum + (t.direction === "in" ? t.amount : -t.amount), 0);
      return round2(opening + delta);
    },
    [data],
  );

  const lastUpdatedOf = useCallback(
    (accountId: string) => {
      const rows = data.transactions
        .filter((t) => t.accountId === accountId && !t.voided && isLedgerEntry(t))
        .map((t) => t.updatedAt)
        .sort();
      return rows.length ? (rows[rows.length - 1] ?? null) : null;
    },
    [data.transactions],
  );

  const openInvoices = useCallback(
    (kind: "sales" | "purchase", partyId: string | null) => {
      const list = kind === "sales" ? data.salesInvoices : data.purchaseBills;
      return list.filter(
        (i) => !i.voided && (!partyId || i.partyId === partyId) && round2(i.paid) < round2(i.total),
      );
    },
    [data.salesInvoices, data.purchaseBills],
  );

  const isLikelyDuplicate = useCallback(
    (input: NewEntryInput, ignoreId?: string) =>
      data.transactions.some(
        (t) =>
          t.id !== ignoreId &&
          !t.voided &&
          t.date === input.date &&
          round2(t.amount) === round2(input.amount) &&
          t.accountId === input.accountId &&
          t.direction === input.direction &&
          (t.reference ?? "") === (input.reference?.trim() ?? ""),
      ),
    [data.transactions],
  );

  const addEntry = useCallback<StoreValue["addEntry"]>(
    (input) => {
      const error = validate(input);
      if (error) return { ok: false, message: error };
      const rows = buildTransactions(input);
      setData((prev) => {
        let next: LepdoData = { ...prev, transactions: [...prev.transactions, ...rows] };
        const kind = input.category ? (categoryMap[input.category].needsAllocation ?? null) : null;
        next = applyAllocations(next, input.allocations, kind, 1);
        next = {
          ...next,
          auditLogs: [
            log(
              "create",
              rows.length > 1 ? "transfer" : "transaction",
              `${rows.map((r) => r.code).join(" + ")} — ₹${input.amount} ${input.direction === "in" ? "in" : "out"}`,
            ),
            ...next.auditLogs,
          ],
        };
        return next;
      });
      return { ok: true, message: "Entry saved." };
    },
    [applyAllocations, buildTransactions, log, validate],
  );

  const updateEntry = useCallback<StoreValue["updateEntry"]>(
    (id, input, reason) => {
      const error = validate(input);
      if (error) return { ok: false, message: error };
      setData((prev) => {
        const existing = prev.transactions.find((t) => t.id === id);
        if (!existing) return prev;
        const kindOld = existing.category
          ? (categoryMap[existing.category].needsAllocation ?? null)
          : null;
        const kindNew = input.category
          ? (categoryMap[input.category].needsAllocation ?? null)
          : null;
        let next = applyAllocations(prev, existing.allocations, kindOld, -1);
        next = applyAllocations(next, input.allocations, kindNew, 1);
        const allocated = round2((input.allocations ?? []).reduce((s, a) => s + a.amount, 0));
        const now = new Date().toISOString();
        const changed = [
          existing.date !== input.date ? `date ${existing.date} → ${input.date}` : null,
          round2(existing.amount) !== round2(input.amount)
            ? `amount ₹${round2(existing.amount)} → ₹${round2(input.amount)}`
            : null,
          existing.category !== input.category
            ? `category ${existing.category ?? "—"} → ${input.category ?? "—"}`
            : null,
          existing.particulars.trim() !== input.particulars.trim() ? "particulars" : null,
        ]
          .filter(Boolean)
          .join(", ");
        const entry: EntryChange = {
          at: now,
          by: USER,
          action: "edited",
          detail: changed || "details updated",
          reason,
        };
        // keep every linked transfer row in sync with the edited entry
        const groupId = existing.transferGroupId;
        next = {
          ...next,
          transactions: next.transactions.map((t) => {
            if (t.id === id)
              return {
                ...t,
                ...input,
                amount: round2(input.amount),
                particulars: input.particulars.trim(),
                advanceAmount: kindNew ? round2(input.amount - allocated) : undefined,
                history: [...(t.history ?? []), entry],
                updatedAt: now,
              };
            if (groupId && t.transferGroupId === groupId)
              return {
                ...t,
                date: input.date,
                amount: round2(input.amount),
                category: input.category,
                reference: input.reference?.trim() || t.reference,
                notes: input.notes,
                particulars: `${input.particulars.trim()} (transfer in)`,
                history: [...(t.history ?? []), { ...entry, action: "linked-updated" }],
                updatedAt: now,
              };
            return t;
          }),
          auditLogs: [
            log(
              "update",
              "transaction",
              `${existing.code} edited${changed ? ` — ${changed}` : ""}${reason ? ` · reason: ${reason}` : ""}`,
            ),
            ...next.auditLogs,
          ],
        };
        return next;
      });
      return { ok: true, message: "Entry updated." };
    },
    [applyAllocations, log, validate],
  );

  const voidEntry = useCallback<StoreValue["voidEntry"]>(
    (id, reason) => {
      setData((prev) => {
        const target = prev.transactions.find((t) => t.id === id);
        if (!target) return prev;
        const ids = target.transferGroupId
          ? prev.transactions
              .filter((t) => t.transferGroupId === target.transferGroupId)
              .map((t) => t.id)
          : [id];
        const kind = target.category
          ? (categoryMap[target.category].needsAllocation ?? null)
          : null;
        let next = applyAllocations(prev, target.allocations, kind, -1);
        const now = new Date().toISOString();
        next = {
          ...next,
          transactions: next.transactions.map((t) =>
            ids.includes(t.id)
              ? {
                  ...t,
                  voided: true,
                  history: [
                    ...(t.history ?? []),
                    { at: now, by: USER, action: "voided", detail: "removed from books", reason },
                  ],
                  updatedAt: now,
                }
              : t,
          ),
          auditLogs: [
            log(
              "void",
              "transaction",
              `${target.code} voided${reason ? ` · reason: ${reason}` : ""}`,
            ),
            ...next.auditLogs,
          ],
        };
        return next;
      });
    },
    [applyAllocations, log],
  );

  const restoreEntry = useCallback<StoreValue["restoreEntry"]>(
    (id) => {
      setData((prev) => {
        const target = prev.transactions.find((t) => t.id === id);
        if (!target) return prev;
        const ids = target.transferGroupId
          ? prev.transactions
              .filter((t) => t.transferGroupId === target.transferGroupId)
              .map((t) => t.id)
          : [id];
        const kind = target.category
          ? (categoryMap[target.category].needsAllocation ?? null)
          : null;
        let next = applyAllocations(prev, target.allocations, kind, 1);
        next = {
          ...next,
          transactions: next.transactions.map((t) =>
            ids.includes(t.id) ? { ...t, voided: false, updatedAt: new Date().toISOString() } : t,
          ),
          auditLogs: [log("restore", "transaction", `${target.code} restored`), ...next.auditLogs],
        };
        return next;
      });
    },
    [applyAllocations, log],
  );

  const toggleReconciled = useCallback<StoreValue["toggleReconciled"]>(
    (id) => {
      setData((prev) => ({
        ...prev,
        transactions: prev.transactions.map((t) =>
          t.id === id
            ? { ...t, reconciled: !t.reconciled, updatedAt: new Date().toISOString() }
            : t,
        ),
        auditLogs: [log("reconcile", "transaction", `${id} reconcile toggled`), ...prev.auditLogs],
      }));
    },
    [log],
  );

  const duplicateEntry = useCallback<StoreValue["duplicateEntry"]>(
    (id) => {
      setData((prev) => {
        const src = prev.transactions.find((t) => t.id === id);
        if (!src) return prev;
        const copy: Transaction = {
          ...src,
          id: uid("tx"),
          code: nextCode(),
          transferGroupId: undefined,
          reconciled: false,
          voided: false,
          allocations: [],
          particulars: `${src.particulars} (copy)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return {
          ...prev,
          transactions: [...prev.transactions, copy],
          auditLogs: [
            log("duplicate", "transaction", `${src.code} duplicated as ${copy.code}`),
            ...prev.auditLogs,
          ],
        };
      });
    },
    [log],
  );

  const addParty = useCallback<StoreValue["addParty"]>(
    (name, type) => {
      const party: Party = { id: uid("p"), name: name.trim(), type };
      setData((prev) => ({
        ...prev,
        parties: [...prev.parties, party],
        auditLogs: [log("create", "party", `${party.name} added`), ...prev.auditLogs],
      }));
      return party;
    },
    [log],
  );

  const ensureParties = useCallback<StoreValue["ensureParties"]>((list) => {
    setData((prev) => {
      const missing = list.filter((p) => !prev.parties.some((x) => x.id === p.id));
      if (!missing.length) return prev;
      return { ...prev, parties: [...prev.parties, ...missing] };
    });
  }, []);

  const ensureBankAccounts = useCallback<StoreValue["ensureBankAccounts"]>((list) => {
    setData((prev) => {
      const missing = list.filter((b) => !prev.bankAccounts.some((x) => x.id === b.id));
      if (!missing.length) return prev;
      return { ...prev, bankAccounts: [...prev.bankAccounts, ...missing] };
    });
  }, []);

  const saveBankAccount = useCallback<StoreValue["saveBankAccount"]>(
    (acc) => {
      setData((prev) => {
        const id = acc.id ?? uid("bank");
        const exists = prev.bankAccounts.some((b) => b.id === id);
        return {
          ...prev,
          bankAccounts: exists
            ? prev.bankAccounts.map((b) => (b.id === id ? { ...b, ...acc, id } : b))
            : [...prev.bankAccounts, { ...acc, id }],
          auditLogs: [
            log(exists ? "update" : "create", "bank_account", `${acc.bankName} — ${acc.nickname}`),
            ...prev.auditLogs,
          ],
        };
      });
    },
    [log],
  );

  const saveCashLocation = useCallback<StoreValue["saveCashLocation"]>(
    (loc) => {
      setData((prev) => {
        const id = loc.id ?? uid("cash");
        const exists = prev.cashLocations.some((c) => c.id === id);
        return {
          ...prev,
          cashLocations: exists
            ? prev.cashLocations.map((c) => (c.id === id ? { ...c, ...loc, id } : c))
            : [...prev.cashLocations, { ...loc, id }],
          auditLogs: [
            log(exists ? "update" : "create", "cash_location", loc.name),
            ...prev.auditLogs,
          ],
        };
      });
    },
    [log],
  );

  const nextInvoiceNumber = useCallback<StoreValue["nextInvoiceNumber"]>(() => {
    const year = new Date().getUTCFullYear();
    const prefix = `SI-${year}-`;
    const max = data.salesInvoices.reduce((acc, inv) => {
      if (!inv.number.startsWith(prefix)) return acc;
      const n = Number(inv.number.slice(prefix.length));
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  }, [data.salesInvoices]);

  const saveSalesInvoice = useCallback<StoreValue["saveSalesInvoice"]>(
    (input) => {
      const number = input.number.trim();
      if (!number) return { ok: false, message: "Invoice number is required." };
      if (!input.partyId) return { ok: false, message: "Please select a customer." };
      if (!input.date) return { ok: false, message: "Invoice date is required." };
      if (input.dueDate && input.dueDate < input.date)
        return { ok: false, message: "Due date cannot be before the invoice date." };

      const hasRows = (input.lines ?? []).length > 0 || (input.jewelryItems ?? []).length > 0;
      if (!hasRows) return { ok: false, message: "Add at least one item row." };
      if (!(input.total > 0))
        return { ok: false, message: "Invoice total must be greater than zero." };

      const clash = data.salesInvoices.find(
        (i) =>
          i.id !== input.id &&
          !i.voided &&
          (i.number.toLowerCase() === number.toLowerCase() ||
            (i.partyId === input.partyId &&
              i.date === input.date &&
              round2(i.total) === round2(input.total))),
      );
      if (clash)
        return {
          ok: false,
          message:
            clash.number.toLowerCase() === number.toLowerCase()
              ? `Invoice number ${number} already exists.`
              : `A matching invoice (${clash.number}) already exists for this customer, date and amount.`,
        };

      const now = new Date().toISOString();
      const id = input.id ?? uid("si");
      setData((prev) => {
        const existing = prev.salesInvoices.find((i) => i.id === id);
        const invoice: Invoice = {
          id,
          number,
          partyId: input.partyId,
          date: input.date,
          dueDate: input.dueDate,
          total: round2(input.total),
          paid: existing?.paid ?? 0,
          voided: false,
          sellerName: input.sellerName,
          platform: input.platform,
          invoiceKind: input.invoiceKind ?? "diamond",
          jewelryItems: input.jewelryItems,
          foreignTotal: input.foreignTotal,
          saleType: input.saleType,
          currency: input.currency ?? "INR",
          exchangeRate: input.exchangeRate ?? 1,
          gstType: input.gstType,
          gstRate: input.gstRate,
          lines: input.lines,
          subtotal: round2(input.subtotal),
          discount: round2(input.discount),
          taxableAmount: round2(input.taxableAmount),
          taxAmount: round2(input.taxAmount),
          shipping: round2(input.shipping),
          roundOff: round2(input.roundOff),
          dueDays: input.dueDays,
          discountMode: input.discountMode,
          discountValue: input.discountValue,
          supplyLocation: input.supplyLocation,
          cgstAmount: input.cgstAmount,
          sgstAmount: input.sgstAmount,
          igstAmount: input.igstAmount,
          sellerIncentivePercent: input.sellerIncentivePercent,

          notes: input.notes,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        return {
          ...prev,
          salesInvoices: existing
            ? prev.salesInvoices.map((i) => (i.id === id ? invoice : i))
            : [...prev.salesInvoices, invoice],
          auditLogs: [
            log(
              existing ? "update" : "create",
              "sales_invoice",
              `${number} — ₹${round2(input.total)}`,
            ),
            ...prev.auditLogs,
          ],
        };
      });
      return { ok: true, message: input.id ? "Invoice updated." : "Invoice saved.", id };
    },
    [data.salesInvoices, log],
  );

  const voidSalesInvoice = useCallback<StoreValue["voidSalesInvoice"]>(
    (id) => {
      setData((prev) => ({
        ...prev,
        salesInvoices: prev.salesInvoices.map((i) =>
          i.id === id ? { ...i, voided: true, updatedAt: new Date().toISOString() } : i,
        ),
        auditLogs: [
          log(
            "void",
            "sales_invoice",
            `${prev.salesInvoices.find((i) => i.id === id)?.number ?? id} voided`,
          ),
          ...prev.auditLogs,
        ],
      }));
    },
    [log],
  );

  const restoreSalesInvoice = useCallback<StoreValue["restoreSalesInvoice"]>(
    (id) => {
      setData((prev) => ({
        ...prev,
        salesInvoices: prev.salesInvoices.map((i) =>
          i.id === id ? { ...i, voided: false, updatedAt: new Date().toISOString() } : i,
        ),
        auditLogs: [
          log(
            "restore",
            "sales_invoice",
            `${prev.salesInvoices.find((i) => i.id === id)?.number ?? id} restored`,
          ),
          ...prev.auditLogs,
        ],
      }));
    },
    [log],
  );

  const saveCustomer = useCallback<StoreValue["saveCustomer"]>(
    (input) => {
      const name = input.name.trim();
      const existing = input.id
        ? data.parties.find((p) => p.id === input.id)
        : data.parties.find(
            (p) =>
              p.name.trim().toLowerCase() === name.toLowerCase() &&
              (!input.type || p.type === input.type),
          );
      const party: Party = {
        id: existing?.id ?? uid("p"),
        name,
        type: existing?.type ?? input.type ?? "customer",
        phone: input.phone,
        email: input.email,
        gstin: input.gstin,
        billingAddress: input.billingAddress,
        country: input.country,
        company: input.company,
        city: input.city,
      };
      setData((prev) => ({
        ...prev,
        deletedPartyIds: Object.fromEntries(
          Object.entries(prev.deletedPartyIds ?? {}).filter(([id]) => id !== party.id),
        ),
        parties: prev.parties.some((p) => p.id === party.id)
          ? prev.parties.map((p) => (p.id === party.id ? { ...p, ...party } : p))
          : [...prev.parties, party],
        auditLogs: [log(existing ? "update" : "create", "customer", party.name), ...prev.auditLogs],
      }));
      return party;
    },
    [data.parties, log],
  );

  const removeParty = useCallback<StoreValue["removeParty"]>(
    (id) => {
      setData((prev) => {
        const party = prev.parties.find((p) => p.id === id);
        if (!party) return prev;
        return {
          ...prev,
          parties: prev.parties.filter((p) => p.id !== id),
          deletedPartyIds: {
            ...(prev.deletedPartyIds ?? {}),
            [id]: new Date().toISOString(),
          },
          auditLogs: [log("delete", "customer", party.name), ...prev.auditLogs],
        };
      });
    },
    [log],
  );

  const nextPurchaseBillNumber = useCallback<StoreValue["nextPurchaseBillNumber"]>(() => {
    const year = new Date().getUTCFullYear();
    const prefix = `PB-${year}-`;
    const max = data.purchaseBills.reduce((acc, b) => {
      if (!b.number.startsWith(prefix)) return acc;
      const n = Number(b.number.slice(prefix.length));
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  }, [data.purchaseBills]);

  const savePurchaseBill = useCallback<StoreValue["savePurchaseBill"]>(
    (input) => {
      const number = input.number.trim();
      if (!number) return { ok: false, message: "Bill number is required." };
      if (!input.partyId) return { ok: false, message: "Please select a supplier." };
      if (!input.date) return { ok: false, message: "Invoice date is required." };
      if (input.dueDate && input.dueDate < input.date)
        return { ok: false, message: "Due date cannot be before the invoice date." };

      const hasRows = (input.lines ?? []).length > 0 || (input.makingLines ?? []).length > 0;
      if (!hasRows) return { ok: false, message: "Add at least one item row." };
      if (!(input.total > 0))
        return { ok: false, message: "Bill total must be greater than zero." };

      const clash = data.purchaseBills.find(
        (b) => b.id !== input.id && !b.voided && b.number.toLowerCase() === number.toLowerCase(),
      );
      if (clash) return { ok: false, message: `Bill number ${number} already exists.` };


      const now = new Date().toISOString();
      const id = input.id ?? uid("pb");
      setData((prev) => {
        const existing = prev.purchaseBills.find((b) => b.id === id);
        const bill: Invoice = {
          id,
          number,
          partyId: input.partyId,
          date: input.date,
          dueDate: input.dueDate,
          total: round2(input.total),
          paid: existing?.paid ?? 0,
          voided: false,
          billKind: input.billKind,
          brokerName: input.brokerName,
          supplierInvoiceNumber: input.supplierInvoiceNumber,
          paymentTermsDays: input.paymentTermsDays,
          usdRate: input.usdRate,
          currency: "INR",
          exchangeRate: 1,
          lines: input.lines ?? [],
          makingLines: input.makingLines ?? [],
          subtotal: round2(input.subtotal),
          discount: round2(input.discount ?? 0),
          taxableAmount: round2(input.taxableAmount ?? input.total),
          taxAmount: round2(input.taxAmount ?? 0),
          dueDays: input.dueDays,
          discountMode: input.discountMode,
          discountValue: input.discountValue,
          purchaseType: input.purchaseType,
          gstRate: input.gstRate,
          supplyLocation: input.supplyLocation,
          cgstAmount: input.cgstAmount,
          sgstAmount: input.sgstAmount,
          igstAmount: input.igstAmount,
          shipping: 0,

          roundOff: 0,
          notes: input.notes,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        return {
          ...prev,
          purchaseBills: existing
            ? prev.purchaseBills.map((b) => (b.id === id ? bill : b))
            : [...prev.purchaseBills, bill],
          auditLogs: [
            log(
              existing ? "update" : "create",
              "purchase_bill",
              `${number} — ₹${round2(input.total)}`,
            ),
            ...prev.auditLogs,
          ],
        };
      });
      return { ok: true, message: input.id ? "Bill updated." : "Bill saved.", id };
    },
    [data.purchaseBills, log],
  );

  const voidPurchaseBill = useCallback<StoreValue["voidPurchaseBill"]>(
    (id) => {
      setData((prev) => ({
        ...prev,
        purchaseBills: prev.purchaseBills.map((b) =>
          b.id === id ? { ...b, voided: true, updatedAt: new Date().toISOString() } : b,
        ),
        auditLogs: [
          log(
            "void",
            "purchase_bill",
            `${prev.purchaseBills.find((b) => b.id === id)?.number ?? id} voided`,
          ),
          ...prev.auditLogs,
        ],
      }));
    },
    [log],
  );

  const restorePurchaseBill = useCallback<StoreValue["restorePurchaseBill"]>(
    (id) => {
      setData((prev) => ({
        ...prev,
        purchaseBills: prev.purchaseBills.map((b) =>
          b.id === id ? { ...b, voided: false, updatedAt: new Date().toISOString() } : b,
        ),
        auditLogs: [
          log(
            "restore",
            "purchase_bill",
            `${prev.purchaseBills.find((b) => b.id === id)?.number ?? id} restored`,
          ),
          ...prev.auditLogs,
        ],
      }));
    },
    [log],
  );

  const saveContact = useCallback<StoreValue["saveContact"]>(
    (input) => {
      const name = input.name.trim();
      if (!name) return { ok: false, message: "Name is required." };
      const list = input.kind === "broker" ? data.brokers : data.sellers;
      const duplicate = list.find(
        (c) => c.id !== input.id && c.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (duplicate)
        return {
          ok: false,
          message: `${input.kind === "broker" ? "Broker" : "Seller"} "${name}" already exists.`,
        };
      const contact: Contact = {
        id: input.id ?? uid(input.kind),
        kind: input.kind,
        name,
        phone: input.phone,
        company: input.company,
        role: input.role,
        rateType: input.rateType,
        rate: input.rate,
        notes: input.notes,
      };
      const key = input.kind === "broker" ? "brokers" : "sellers";
      const previousName = list.find((c) => c.id === contact.id)?.name;
      setData((prev) => {
        const current = prev[key];
        const exists = current.some((c) => c.id === contact.id);
        const next: LepdoData = {
          ...prev,
          [key]: exists
            ? current.map((c) => (c.id === contact.id ? contact : c))
            : [...current, contact],
          auditLogs: [
            log(exists ? "update" : "create", input.kind, contact.name),
            ...prev.auditLogs,
          ],
        };
        // keep the name used on existing invoices in sync after a rename
        if (exists && previousName && previousName !== contact.name) {
          if (input.kind === "broker")
            next.purchaseBills = next.purchaseBills.map((b) =>
              b.brokerName === previousName ? { ...b, brokerName: contact.name } : b,
            );
          else
            next.salesInvoices = next.salesInvoices.map((i) =>
              i.sellerName === previousName ? { ...i, sellerName: contact.name } : i,
            );
        }
        return next;
      });
      return { ok: true, message: input.id ? "Saved." : "Added.", contact };
    },
    [data.brokers, data.sellers, log],
  );

  const stamp = useCallback<StoreValue["stamp"]>((prefix, item) => {
    const now = new Date().toISOString();
    return {
      ...item,
      id: item.id ?? uid(prefix),
      createdAt: (item as { createdAt?: string }).createdAt ?? now,
      createdBy: (item as { createdBy?: string }).createdBy ?? USER,
      updatedAt: now,
      updatedBy: USER,
    };
  }, []);

  const saveRecord = useCallback<StoreValue["saveRecord"]>(
    (key, item) => {
      setData((prev) => {
        const list = prev[key] as { id: string }[];
        const exists = list.some((r) => r.id === (item as { id: string }).id);
        const nextList = exists
          ? list.map((r) => (r.id === (item as { id: string }).id ? item : r))
          : [...list, item];
        return {
          ...prev,
          [key]: nextList,
          auditLogs: [
            log(exists ? "update" : "create", key, (item as { id: string }).id),
            ...prev.auditLogs,
          ],
        } as LepdoData;
      });
    },
    [log],
  );

  const setRecordVoided = useCallback<StoreValue["setRecordVoided"]>(
    (key, id, voided) => {
      setData(
        (prev) =>
          ({
            ...prev,
            [key]: (prev[key] as { id: string }[]).map((r) =>
              r.id === id
                ? { ...r, voided, updatedAt: new Date().toISOString(), updatedBy: USER }
                : r,
            ),
            auditLogs: [log(voided ? "void" : "restore", key, id), ...prev.auditLogs],
          }) as LepdoData,
      );
    },
    [log],
  );

  const removeRecord = useCallback<StoreValue["removeRecord"]>(
    (key, id) => {
      setData(
        (prev) =>
          ({
            ...prev,
            [key]: (prev[key] as { id: string }[]).filter((r) => r.id !== id),
            auditLogs: [log("delete", key, id), ...prev.auditLogs],
          }) as LepdoData,
      );
    },
    [log],
  );

  const saveSettings = useCallback<StoreValue["saveSettings"]>(
    (patch) => {
      setData((prev) => ({
        ...prev,
        settings: { ...prev.settings, ...patch },
        auditLogs: [log("update", "settings", Object.keys(patch).join(", ")), ...prev.auditLogs],
      }));
    },
    [log],
  );

  const saveMaster = useCallback<StoreValue["saveMaster"]>(
    (masterId, value) => {
      setData((prev) => {
        const list = prev.masters[masterId] ?? [];
        const name = value.name.trim();
        if (!name) return prev;
        const exists = value.id ? list.some((v) => v.id === value.id) : false;
        const nextList = exists
          ? list.map((v) =>
              v.id === value.id ? { ...v, name, active: value.active ?? v.active } : v,
            )
          : [...list, { id: uid("mv"), name, active: value.active ?? true }];
        return {
          ...prev,
          masters: { ...prev.masters, [masterId]: nextList },
          auditLogs: [
            log(exists ? "update" : "create", `master:${masterId}`, name),
            ...prev.auditLogs,
          ],
        };
      });
    },
    [log],
  );

  const setMasterActive = useCallback<StoreValue["setMasterActive"]>(
    (masterId, id, active) => {
      setData((prev) => ({
        ...prev,
        masters: {
          ...prev.masters,
          [masterId]: (prev.masters[masterId] ?? []).map((v) =>
            v.id === id ? { ...v, active } : v,
          ),
        },
        auditLogs: [
          log(active ? "activate" : "deactivate", `master:${masterId}`, id),
          ...prev.auditLogs,
        ],
      }));
    },
    [log],
  );

  const masterValueInUse = useCallback(
    (name: string) => {
      const n = name.trim().toLowerCase();
      const hit = (v: string | undefined | null) => (v ?? "").trim().toLowerCase() === n;
      return (
        data.salesInvoices.some(
          (i) => hit(i.platform) || hit(i.currency) || hit(i.saleType) || hit(i.gstType),
        ) ||
        data.purchaseBills.some((b) => hit(b.currency) || hit(b.purchaseType)) ||
        data.transactions.some((t) => hit(t.expenseCategory) || hit(t.drawingCategory)) ||
        data.salesInvoices.some((i) =>
          (i.jewelryItems ?? []).some(
            (j) =>
              hit(j.metal) ||
              hit(j.category) ||
              hit(j.metalColour) ||
              j.stones.some((s) => hit(s.stoneType)),
          ),
        )
      );
    },
    [data.salesInvoices, data.purchaseBills, data.transactions],
  );

  const removeMaster = useCallback<StoreValue["removeMaster"]>(
    (masterId, id) => {
      const value = (data.masters[masterId] ?? []).find((v) => v.id === id);
      if (!value) return { ok: false, message: "Value not found." };
      if (masterValueInUse(value.name)) {
        setMasterActive(masterId, id, false);
        return {
          ok: false,
          message: `"${value.name}" is used on existing records — deactivated instead of deleted.`,
        };
      }
      setData((prev) => ({
        ...prev,
        masters: {
          ...prev.masters,
          [masterId]: (prev.masters[masterId] ?? []).filter((v) => v.id !== id),
        },
        auditLogs: [log("delete", `master:${masterId}`, value.name), ...prev.auditLogs],
      }));
      return { ok: true, message: `"${value.name}" deleted.` };
    },
    [data.masters, log, masterValueInUse, setMasterActive],
  );

  const resetDemoData = useCallback(() => {
    setData(buildSeed());
  }, []);

  /** Restore a backup snapshot: written to the database by the save effect. */
  const replaceAll = useCallback((snapshot: Partial<LepdoData>) => {
    setData(hydrate(snapshot));
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      ...data,
      ready,
      syncError,
      refresh,
      replaceAll,

      addEntry,
      updateEntry,
      voidEntry,
      restoreEntry,
      toggleReconciled,
      duplicateEntry,
      addParty,
      ensureParties,
      ensureBankAccounts,
      saveBankAccount,
      saveCashLocation,
      resetDemoData,
      balanceOf,
      lastUpdatedOf,
      openInvoices,
      isLikelyDuplicate,
      nextInvoiceNumber,
      saveSalesInvoice,
      voidSalesInvoice,
      restoreSalesInvoice,
      saveCustomer,
      removeParty,
      nextPurchaseBillNumber,
      savePurchaseBill,
      voidPurchaseBill,
      restorePurchaseBill,
      saveContact,
      saveRecord,
      setRecordVoided,
      removeRecord,
      saveSettings,
      saveMaster,
      setMasterActive,
      removeMaster,
      stamp,
    }),
    [
      data,
      ready,
      syncError,
      refresh,
      replaceAll,

      addEntry,
      updateEntry,
      voidEntry,
      restoreEntry,
      toggleReconciled,
      duplicateEntry,
      addParty,
      ensureParties,
      ensureBankAccounts,
      saveBankAccount,
      saveCashLocation,
      resetDemoData,
      balanceOf,
      lastUpdatedOf,
      openInvoices,
      isLikelyDuplicate,
      nextInvoiceNumber,
      saveSalesInvoice,
      voidSalesInvoice,
      restoreSalesInvoice,
      saveCustomer,
      removeParty,
      nextPurchaseBillNumber,
      savePurchaseBill,
      voidPurchaseBill,
      restorePurchaseBill,
      saveContact,
      saveRecord,
      setRecordVoided,
      removeRecord,
      saveSettings,
      saveMaster,
      setMasterActive,
      removeMaster,
      stamp,
    ],
  );

  return (
    <StoreContext.Provider value={value}>
      {!ready ? (
        <div className="flex min-h-screen items-center justify-center px-4">
          <p className="text-sm text-muted-foreground">Loading your data…</p>
        </div>
      ) : (
        <>
          {syncError ? (
            <div className="sticky top-0 z-50 bg-destructive px-4 py-2 text-center text-xs font-medium text-destructive-foreground">
              {syncError}{" "}
              <button className="underline" onClick={() => void refresh()}>
                Retry now
              </button>
            </div>
          ) : null}
          {children}
        </>
      )}
    </StoreContext.Provider>
  );

}

export function useLepdo(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useLepdo must be used inside LepdoProvider");
  return ctx;
}

export function partyName(parties: Party[], id: string | null): string {
  if (!id) return "—";
  return parties.find((p) => p.id === id)?.name ?? "—";
}
