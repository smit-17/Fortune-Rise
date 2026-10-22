import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Landmark, MoreVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, formatMoney, round2, todayISO } from "@/lib/lepdo/format";
import { MoneyInput, NumInput, toNum } from "@/components/lepdo/numeric";
import { useLepdo, partyName, type NewEntryInput } from "@/lib/lepdo/store";
import { DRAWING_ACCOUNTS, DRAWING_PARTIES } from "@/lib/lepdo/drawings";
import { useShell } from "@/components/lepdo/shell-context";
import { PageHeading } from "@/components/lepdo/bits";
import {
  StatCard,
  Chip,
  SectionCard,
  EmptyState,
  DownloadMenu,
  ModalShell,
  Field,
  TextField,
  usePaged,
  Pager,
  AuditLine,
  TONE,
} from "@/components/lepdo/shared";
import {
  buildCapitalViews,
  buildLiabilityView,
  LIABILITY_KINDS,
  LIABILITY_ENTRY_TYPES,
  liabilityKindLabel,
  liabilityTypeLabel,
  type Tone,
} from "@/lib/lepdo/extras";
import type { ExportTable } from "@/lib/lepdo/exportTable";
import type {
  EmiPlan,
  Liability,
  LiabilityEntry,
  LiabilityKind,
  SourceType,
  Transaction,
} from "@/lib/lepdo/types";

export const Route = createFileRoute("/capital")({
  head: () => ({
    meta: [
      { title: "Capital, Investment & Liabilities — LEPDO Accounting" },
      {
        name: "description",
        content:
          "Founder capital, investment and liability register for LEPDO — capital balances, borrowings, EMIs and interest.",
      },
      { property: "og:title", content: "Capital, Investment & Liabilities — LEPDO Accounting" },
      {
        property: "og:description",
        content:
          "Track founder capital, investments and liabilities with running balances and audit trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CapitalPage,
});

function CapitalPage() {
  const store = useLepdo();
  const [tab, setTab] = useState("capital");

  if (!store.ready) {
    return (
      <div className="space-y-4 pb-8">
        <PageHeading title="Capital, Investment & Liabilities" breadcrumb="Accounting" />
        <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <PageHeading title="Capital, Investment & Liabilities" breadcrumb="Accounting" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="capital">Capital &amp; Investment</TabsTrigger>
          <TabsTrigger value="liabilities">Liabilities</TabsTrigger>
          <TabsTrigger value="emi">EMI Tracker</TabsTrigger>
        </TabsList>
        <TabsContent value="capital" className="mt-4">
          {tab === "capital" ? <CapitalTab /> : null}
        </TabsContent>
        <TabsContent value="liabilities" className="mt-4">
          {tab === "liabilities" ? <LiabilitiesTab /> : null}
        </TabsContent>
        <TabsContent value="emi" className="mt-4">
          {tab === "emi" ? <EmiTab /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ================= Capital & Investment ================= */

interface CapitalForm {
  id: string | null;
  date: string;
  partyId: string;
  manualParty: string;
  category: "owner_investment" | "owner_drawing";
  sourceType: SourceType;
  accountId: string;
  amount: string;
  particulars: string;
  reference: string;
  notes: string;
}

const MANUAL_PARTY = "__manual__";

const emptyCapitalForm = (): CapitalForm => ({
  id: null,
  date: todayISO(),
  partyId: DRAWING_PARTIES[0]?.id ?? "",
  manualParty: "",
  category: "owner_investment",
  sourceType: "bank",
  accountId: "",
  amount: "",
  particulars: "",
  reference: "",
  notes: "",
});

function CapitalTab() {
  const store = useLepdo();
  const [source, setSource] = useState<Transaction | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CapitalForm>(emptyCapitalForm);
  const [voidTarget, setVoidTarget] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const partyOptions = useMemo(() => {
    const list = [...DRAWING_PARTIES.map((p) => ({ id: p.id, name: p.name }))];
    for (const p of store.parties) {
      if (p.type === "founder" && !list.some((x) => x.id === p.id)) {
        list.push({ id: p.id, name: p.name });
      }
    }
    return list;
  }, [store.parties]);

  const accounts = useMemo(
    () =>
      form.sourceType === "bank"
        ? store.bankAccounts.map((b) => ({ id: b.id, label: b.nickname || b.bankName }))
        : store.cashLocations.map((c) => ({ id: c.id, label: c.name })),
    [form.sourceType, store.bankAccounts, store.cashLocations],
  );

  const openAdd = () => {
    setForm(emptyCapitalForm());
    setFormOpen(true);
  };

  const openEdit = (t: Transaction) => {
    setForm({
      id: t.id,
      date: t.date,
      partyId: t.partyId ?? DRAWING_PARTIES[0]?.id ?? "",
      manualParty: "",
      category: "owner_investment",
      sourceType: t.sourceType,
      accountId: t.accountId,
      amount: String(t.amount),
      particulars: t.particulars,
      reference: t.reference ?? "",
      notes: t.notes ?? "",
    });
    setFormOpen(true);
  };

  const submit = () => {
    const amount = Number(form.amount);
    const manualName = form.manualParty.trim();
    if (!form.partyId || (form.partyId === MANUAL_PARTY && !manualName)) {
      toast.error(
        form.partyId === MANUAL_PARTY ? "Enter the founder / party name." : "Select a founder / party.",
      );
      return;
    }
    if (!form.accountId) {
      toast.error("Select the account this entry belongs to.");
      return;
    }
    if (!(amount > 0)) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    let partyId = form.partyId;
    if (partyId === MANUAL_PARTY) {
      const match = partyOptions.find((p) => p.name.trim().toLowerCase() === manualName.toLowerCase());
      partyId = match ? match.id : store.addParty(manualName, "founder").id;
    }
    const input: NewEntryInput = {
      date: form.date,
      sourceType: form.sourceType,
      accountId: form.accountId,
      direction: "in",
      amount,
      category: "owner_investment",
      partyId,
      particulars:
        form.particulars.trim() || "Owner investment",
      reference: form.reference.trim() || undefined,
      notes: form.notes.trim() || undefined,
      ledger: false,
    };
    const res = form.id ? store.updateEntry(form.id, input) : store.addEntry(input);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(form.id ? "Capital entry updated" : "Capital entry saved");
    setFormOpen(false);
  };

  const confirmVoid = () => {
    if (!voidTarget) return;
    store.voidEntry(voidTarget.id, voidReason.trim() || undefined);
    toast.success("Capital entry deleted");
    setVoidTarget(null);
    setVoidReason("");
  };

  const buckets = useMemo(
    () => buildCapitalViews(store.transactions, (id) => partyName(store.parties, id)),
    [store.transactions, store.parties],
  );

  const totalInvested = useMemo(() => buckets.reduce((s, b) => s + b.invested, 0), [buckets]);

  const withBalance = useMemo(
    () =>
      buckets
        .flatMap((b) => b.rows.map((t) => ({ ...t, bucketLabel: b.label })))
        .sort((a, b) =>
          a.date === b.date ? a.code.localeCompare(b.code) : b.date.localeCompare(a.date),
        ),
    [buckets],
  );

  const paged = usePaged(withBalance, 25);

  const buildExport = (): ExportTable => ({
    title: "Capital & Investment Ledger",
    subtitle: `As on ${formatDate(todayISO())}`,
    columns: [
      { key: "date", label: "Date", date: true },
      { key: "party", label: "Investor/Party" },
      { key: "particulars", label: "Particulars" },
      { key: "amount", label: "Investment Amount", money: true, align: "right" },
    ],
    rows: withBalance.map((t) => ({
      date: t.date,
      party: partyName(store.parties, t.partyId),
      particulars: t.particulars,
      amount: t.amount,
    })),
  });

  const rowMenu = (t: Transaction) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Actions">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setSource(t)}>View details</DropdownMenuItem>
        <DropdownMenuItem onClick={() => openEdit(t)}>Edit</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => setVoidTarget(t)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {buckets.map((b) => (
          <SectionCard key={b.key} className="p-0">
            <div className={cn("rounded-xl p-4", TONE[b.tone].bg)}>
              <p className={cn("text-sm font-semibold", TONE[b.tone].text)}>{b.label}</p>
              <p className={cn("num mt-3 text-xl font-bold", TONE[b.tone].text)}>
                {formatMoney(b.invested)}
              </p>
              <p className={cn("text-xs", TONE[b.tone].text)}>{b.rows.length} entries</p>
            </div>
          </SectionCard>
        ))}
        <StatCard
          label="Total Investment Amount"
          tone="navy"
          icon={<Landmark className="size-4" />}
          value={formatMoney(totalInvested)}
        />
      </div>

      <SectionCard
        title="Capital & Investment Entries"
        actions={
          <div className="flex flex-wrap gap-2">
            <DownloadMenu build={buildExport} label="Download" />
            <Button className="h-9 bg-navy text-navy-foreground hover:bg-navy/90" onClick={openAdd}>
              <Plus className="size-4" /> Add Capital Entry
            </Button>
          </div>
        }
      >
        {withBalance.length === 0 ? (
          <EmptyState
            title="No investment entries yet"
            hint="Use Add Capital Entry to record a capital or investment entry here."
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Date</th>
                    <th className="px-3 py-2 text-left font-semibold">Investor/Party</th>
                    <th className="px-3 py-2 text-left font-semibold">Particulars</th>
                    <th className="px-3 py-2 text-right font-semibold">Investment Amount</th>
                    <th className="w-16 px-2 py-2 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((t) => (
                    <tr key={t.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(t.date)}</td>
                      <td className="px-3 py-2">
                        {partyName(store.parties, t.partyId)}
                        <span className="block text-xs text-muted-foreground">{t.bucketLabel}</span>
                      </td>
                      <td className="max-w-[300px] px-3 py-2 text-muted-foreground">
                        <span className="block break-words">{t.particulars}</span>
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right font-semibold text-navy">
                        {formatMoney(t.amount)}
                      </td>
                      <td className="px-2 py-2 text-right">{rowMenu(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border lg:hidden">
              {paged.slice.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                    <p className="mt-0.5 text-sm font-medium text-navy">
                      {partyName(store.parties, t.partyId)}
                    </p>
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">
                      {t.particulars}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="num text-sm font-semibold text-foreground">
                      {formatMoney(t.amount)}
                    </span>
                    {rowMenu(t)}
                  </div>
                </li>
              ))}
            </ul>
            <Pager {...paged} />
          </>
        )}
      </SectionCard>

      <Dialog open={!!source} onOpenChange={(o) => !o && setSource(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy">Capital entry details</DialogTitle>
            <DialogDescription>{source?.code}</DialogDescription>
          </DialogHeader>
          {source ? (
            <dl className="space-y-2 text-sm">
              {[
                ["Date", formatDate(source.date)],
                ["Party", partyName(store.parties, source.partyId)],
                ["Amount", formatMoney(source.amount)],
                ["Particulars", source.particulars],
                ["Reference", source.reference || "—"],
                ["Notes", source.notes || "—"],
                ["Created", formatDateTime(source.createdAt)],
                ["Updated", formatDateTime(source.updatedAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border pb-1.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="max-w-[60%] break-words text-right font-medium text-foreground">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      <ModalShell
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? "Edit Capital Entry" : "Add Capital Entry"}
        subtitle="Recorded only in Capital & Investment — no Bank or Cash entry is created."
        width="max-w-[640px]"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-9" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button className="h-9 bg-navy text-navy-foreground hover:bg-navy/90" onClick={submit}>
              {form.id ? "Update Entry" : "Save Entry"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Date"
            type="date"
            value={form.date}
            onChange={(v) => setForm((f) => ({ ...f, date: v }))}
          />
          <Field label="Founder / Party">
            <Select
              value={form.partyId}
              onValueChange={(v) => setForm((f) => ({ ...f, partyId: v }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select party" />
              </SelectTrigger>
              <SelectContent>
                {partyOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
                <SelectItem value={MANUAL_PARTY}>+ Enter manually</SelectItem>
              </SelectContent>
            </Select>
            {form.partyId === MANUAL_PARTY ? (
              <Input
                className="mt-2 h-9"
                placeholder="Founder / Party name"
                value={form.manualParty}
                onChange={(e) => setForm((f) => ({ ...f, manualParty: e.target.value }))}
              />
            ) : null}
          </Field>
          <Field label="Amount (₹)">
            <MoneyInput
              value={toNum(form.amount)}
              onChange={(n) => setForm((f) => ({ ...f, amount: String(n) }))}
            />
          </Field>
          <Field label="Account type">
            <Select
              value={form.sourceType}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, sourceType: v as SourceType, accountId: "" }))
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Account" hint="For reference only — the ledger is not affected.">
            <Select
              value={form.accountId}
              onValueChange={(v) => setForm((f) => ({ ...f, accountId: v }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <TextField
            label="Particulars"
            className="sm:col-span-2"
            value={form.particulars}
            onChange={(v) => setForm((f) => ({ ...f, particulars: v }))}
          />
          <TextField
            label="Reference"
            value={form.reference}
            onChange={(v) => setForm((f) => ({ ...f, reference: v }))}
          />
          <Field label="Notes" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>
        </div>
      </ModalShell>

      <AlertDialog open={!!voidTarget} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this capital entry?</AlertDialogTitle>
            <AlertDialogDescription>
              The entry stays in the audit trail but stops affecting capital balances.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="Reason (optional)"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmVoid}>Delete entry</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ================= Liabilities ================= */

interface LiabForm {
  id: string | null;
  kind: LiabilityKind;
  name: string;
  lender: string;
  originalAmount: string;
  interestRate: string;
  emi: string;
  nextDueDate: string;
  notes: string;
}

const emptyLiabForm = (): LiabForm => ({
  id: null,
  kind: "friends_family",
  name: "",
  lender: "",
  originalAmount: "",
  interestRate: "",
  emi: "",
  nextDueDate: "",
  notes: "",
});

interface EntryForm {
  liabilityId: string;
  date: string;
  type: LiabilityEntry["type"];
  particulars: string;
  principal: string;
  interest: string;
  paidFrom: string;
}

const emptyEntryForm = (liabilityId: string): EntryForm => ({
  liabilityId,
  date: todayISO(),
  type: "principal_repaid",
  particulars: "",
  principal: "",
  interest: "",
  paidFrom: "",
});

function LiabilitiesTab() {
  const store = useLepdo();
  const shell = useShell();
  const { from, to } = shell;
  const [liabFormOpen, setLiabFormOpen] = useState(false);
  const [entryFormOpen, setEntryFormOpen] = useState(false);
  const [editingLiab, setEditingLiab] = useState<Liability | null>(null);
  const [voidingLiab, setVoidingLiab] = useState<Liability | null>(null);
  const [voidingEntry, setVoidingEntry] = useState<LiabilityEntry | null>(null);
  const [sourceTx, setSourceTx] = useState<Transaction | null>(null);
  const [filterId, setFilterId] = useState<string>("all");

  const liabilities = store.liabilities.filter((l) => !l.voided);
  const views = useMemo(
    () => liabilities.map((l) => buildLiabilityView(l, store.liabilityEntries)),
    [liabilities, store.liabilityEntries],
  );

  const grouped = LIABILITY_KINDS.map((k) => ({
    kind: k,
    items: views.filter((v) => v.liability.kind === k.id),
  })).filter((g) => g.items.length > 0);

  const allRows = useMemo(() => {
    const rows: (LiabilityEntry & { balance: number; paid: number; liabName: string })[] = [];
    for (const v of views) {
      for (const r of v.rows) {
        rows.push({ ...r, liabName: v.liability.name });
      }
    }
    return rows
      .filter(
        (r) =>
          !r.voided &&
          (filterId === "all" || r.liabilityId === filterId) &&
          r.date >= from &&
          r.date <= to,
      )
      .sort((a, b) =>
        a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : b.date.localeCompare(a.date),
      );
  }, [views, filterId, from, to]);

  const paged = usePaged(allRows, 25);

  const buildExport = (): ExportTable => ({
    title: "Liabilities Ledger",
    subtitle: `${formatDate(from)} – ${formatDate(to)}`,
    columns: [
      { key: "date", label: "Date", date: true },
      { key: "account", label: "Account" },
      { key: "type", label: "Type" },
      { key: "particulars", label: "Particulars" },
      { key: "principal", label: "Principal", money: true, align: "right" },
      { key: "interest", label: "Interest", money: true, align: "right" },
      { key: "paid", label: "Paid", money: true, align: "right" },
      { key: "balance", label: "Balance", money: true, align: "right" },
    ],
    rows: allRows.map((r) => ({
      date: r.date,
      account: r.liabName,
      type: liabilityTypeLabel(r.type),
      particulars: r.particulars,
      principal: r.principal,
      interest: r.interest,
      paid: r.paid,
      balance: r.balance,
    })),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Note: borrowed money is not income, principal repayment is not an expense — only interest
        and eligible charges affect P&amp;L. Credit-card purchases keep their actual expense
        category.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Ledger period: {formatDate(from)} – {formatDate(to)} · outstanding balances are all-time.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-9 border-gold text-navy"
            onClick={() => setEntryFormOpen(true)}
          >
            <Plus className="size-4" /> Add Entry
          </Button>
          <Button
            className="h-9 bg-navy text-navy-foreground hover:bg-navy/90"
            onClick={() => {
              setEditingLiab(null);
              setLiabFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Add Liability
          </Button>
        </div>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          title="No liabilities recorded yet"
          hint="Add a liability (loan, credit card, borrowing) to start tracking it here."
        />
      ) : (
        grouped.map((g) => (
          <SectionCard key={g.kind.id} title={g.kind.label}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((v) => (
                <LiabilityCard
                  key={v.liability.id}
                  view={v}
                  tone={g.kind.tone}
                  onEdit={() => {
                    setEditingLiab(v.liability);
                    setLiabFormOpen(true);
                  }}
                  onVoid={() => setVoidingLiab(v.liability)}
                  onFilter={() => setFilterId(v.liability.id)}
                />
              ))}
            </div>
          </SectionCard>
        ))
      )}

      <SectionCard
        title="Liability Ledger"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterId} onValueChange={setFilterId}>
              <SelectTrigger aria-label="Filter liability" className="h-9 w-[180px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">All Liabilities</SelectItem>
                {store.liabilities.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DownloadMenu build={buildExport} label="Download" />
          </div>
        }
      >
        {allRows.length === 0 ? (
          <EmptyState title="No entries in the selected period." />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Date</th>
                    <th className="px-3 py-2 text-left font-semibold">Account</th>
                    <th className="px-3 py-2 text-left font-semibold">Type</th>
                    <th className="px-3 py-2 text-left font-semibold">Particulars</th>
                    <th className="px-3 py-2 text-right font-semibold">Principal</th>
                    <th className="px-3 py-2 text-right font-semibold">Interest</th>
                    <th className="px-3 py-2 text-right font-semibold">Paid</th>
                    <th className="px-3 py-2 text-right font-semibold">Balance</th>
                    <th className="w-8 px-2 py-2" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((r) => (
                    <tr
                      key={r.id}
                      className={cn(
                        "border-t border-border align-top",
                        r.voided ? "opacity-50 line-through" : "",
                      )}
                    >
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(r.date)}</td>
                      <td className="px-3 py-2">{r.liabName}</td>
                      <td className="px-3 py-2">
                        <Chip tone="grey">{liabilityTypeLabel(r.type)}</Chip>
                      </td>
                      <td className="max-w-[240px] px-3 py-2 text-muted-foreground">
                        <span className="block break-words">{r.particulars}</span>
                        <AuditLine
                          record={r}
                          sourceModule={r.sourceModule}
                          onViewSource={
                            r.sourceTxId
                              ? () => {
                                  const tx = store.transactions.find((t) => t.id === r.sourceTxId);
                                  if (tx) setSourceTx(tx);
                                }
                              : undefined
                          }
                        />
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right">
                        {r.principal ? formatMoney(r.principal) : "—"}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right">
                        {r.interest ? formatMoney(r.interest) : "—"}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right">
                        {formatMoney(r.paid)}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right font-semibold text-navy">
                        {formatMoney(r.balance)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label="Row actions"
                            >
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive"
                              disabled={r.voided}
                              onClick={() => setVoidingEntry(r)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border lg:hidden">
              {paged.slice.map((r) => (
                <li key={r.id} className={cn("py-3", r.voided ? "opacity-50 line-through" : "")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{formatDate(r.date)}</p>
                      <p className="mt-0.5 text-sm font-medium text-navy">{r.liabName}</p>
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">
                        {r.particulars}
                      </p>
                      <div className="mt-1">
                        <Chip tone="grey">{liabilityTypeLabel(r.type)}</Chip>
                      </div>
                      <AuditLine
                        record={r}
                        sourceModule={r.sourceModule}
                        onViewSource={
                          r.sourceTxId
                            ? () => {
                                const tx = store.transactions.find((t) => t.id === r.sourceTxId);
                                if (tx) setSourceTx(tx);
                              }
                            : undefined
                        }
                      />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="num text-sm font-semibold text-foreground">
                        {formatMoney(r.paid)}
                      </span>
                      <span className="num text-xs text-muted-foreground">
                        Bal {formatMoney(r.balance)}
                      </span>
                      {!r.voided ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1 text-xs text-destructive"
                          onClick={() => setVoidingEntry(r)}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Pager {...paged} />
          </>
        )}
      </SectionCard>

      <LiabilityFormModal
        open={liabFormOpen}
        editing={editingLiab}
        onClose={() => {
          setLiabFormOpen(false);
          setEditingLiab(null);
        }}
      />

      <EntryFormModal
        open={entryFormOpen}
        liabilities={store.liabilities}
        defaultLiabilityId={filterId !== "all" ? filterId : (store.liabilities[0]?.id ?? "")}
        onClose={() => setEntryFormOpen(false)}
      />

      <AlertDialog open={!!voidingLiab} onOpenChange={(o) => !o && setVoidingLiab(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this liability?</AlertDialogTitle>
            <AlertDialogDescription>
              {voidingLiab
                ? `${voidingLiab.name} will be marked closed/void and excluded from totals. It stays visible for audit.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (voidingLiab) {
                  store.setRecordVoided("liabilities", voidingLiab.id, true);
                  toast.success("Liability deleted.");
                }
                setVoidingLiab(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!voidingEntry} onOpenChange={(o) => !o && setVoidingEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {voidingEntry
                ? `${formatMoney(voidingEntry.principal + voidingEntry.interest)} on ${formatDate(voidingEntry.date)} will be excluded from totals.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (voidingEntry) {
                  store.setRecordVoided("liabilityEntries", voidingEntry.id, true);
                  toast.success("Entry deleted.");
                }
                setVoidingEntry(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!sourceTx} onOpenChange={(o) => !o && setSourceTx(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy">Source entry</DialogTitle>
            <DialogDescription>{sourceTx?.code}</DialogDescription>
          </DialogHeader>
          {sourceTx ? (
            <dl className="space-y-2 text-sm">
              {[
                ["Date", formatDate(sourceTx.date)],
                ["Amount", formatMoney(sourceTx.amount)],
                ["Particulars", sourceTx.particulars],
                ["Reference", sourceTx.reference || "—"],
                ["Created", formatDateTime(sourceTx.createdAt)],
                ["Updated", formatDateTime(sourceTx.updatedAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border pb-1.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="max-w-[60%] break-words text-right font-medium text-foreground">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LiabilityCard({
  view,
  tone,
  onEdit,
  onVoid,
  onFilter,
}: {
  view: ReturnType<typeof buildLiabilityView>;
  tone: Tone;
  onEdit: () => void;
  onVoid: () => void;
  onFilter: () => void;
}) {
  const l = view.liability;
  return (
    <div
      className={cn(
        "rounded-xl border border-border p-4",
        TONE[tone].bg,
        l.closed ? "opacity-60" : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("truncate text-sm font-semibold", TONE[tone].text)}>{l.name}</p>
          <p className={cn("text-xs opacity-80", TONE[tone].text)}>{l.lender}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" aria-label="Liability actions">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={onFilter}>View Ledger</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={onVoid}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <dl className={cn("mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs", TONE[tone].text)}>
        <div className="flex justify-between col-span-2">
          <dt>Original Amount</dt>
          <dd className="num font-semibold">{formatMoney(l.originalAmount)}</dd>
        </div>
        <div className="flex justify-between col-span-2">
          <dt>Repaid</dt>
          <dd className="num font-semibold">{formatMoney(view.repaid)}</dd>
        </div>
        <div className="flex justify-between col-span-2 border-t border-border/50 pt-1">
          <dt className="font-medium">Principal Outstanding</dt>
          <dd className="num font-bold">{formatMoney(view.outstanding)}</dd>
        </div>
        <div className="flex justify-between col-span-2">
          <dt>Interest Paid</dt>
          <dd className="num font-semibold">{formatMoney(view.interestPaid)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>EMI</dt>
          <dd className="num">{l.emi ? formatMoney(l.emi) : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Next Due</dt>
          <dd>{l.nextDueDate ? formatDate(l.nextDueDate) : "—"}</dd>
        </div>
      </dl>
      <div className="mt-2">
        <Chip tone={view.status === "Open" ? "green" : "grey"}>{view.status}</Chip>
      </div>
    </div>
  );
}

function LiabilityFormModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: Liability | null;
  onClose: () => void;
}) {
  const store = useLepdo();
  const [form, setForm] = useState<LiabForm>(emptyLiabForm());
  const [saving, setSaving] = useState(false);

  useState(() => {
    // noop placeholder to satisfy hook order; actual sync below via key
  });

  if (open && form.id !== (editing?.id ?? null) && !saving) {
    // sync form when target changes (safe: idempotent, guarded)
    const next = editing
      ? {
          id: editing.id,
          kind: editing.kind,
          name: editing.name,
          lender: editing.lender,
          originalAmount: String(editing.originalAmount),
          interestRate: editing.interestRate != null ? String(editing.interestRate) : "",
          emi: editing.emi != null ? String(editing.emi) : "",
          nextDueDate: editing.nextDueDate ?? "",
          notes: editing.notes ?? "",
        }
      : emptyLiabForm();
    if (JSON.stringify(next) !== JSON.stringify(form)) setForm(next);
  }

  const set = <K extends keyof LiabForm>(k: K, v: LiabForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("Enter a name for this liability.");
      return;
    }
    if (!form.lender.trim()) {
      toast.error("Enter the lender.");
      return;
    }
    const amount = Number(form.originalAmount) || 0;
    if (amount <= 0) {
      toast.error("Enter the original amount.");
      return;
    }
    setSaving(true);
    try {
      const rec = store.stamp("liab", {
        id: editing?.id,
        kind: form.kind,
        name: form.name.trim(),
        lender: form.lender.trim(),
        originalAmount: amount,
        interestRate: form.interestRate ? Number(form.interestRate) : undefined,
        emi: form.emi ? Number(form.emi) : undefined,
        nextDueDate: form.nextDueDate || undefined,
        notes: form.notes || undefined,
        closed: editing?.closed,
      });
      store.saveRecord("liabilities", rec);
      toast.success(editing ? "Liability updated." : "Liability added.");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={editing ? "Edit Liability" : "Add Liability"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={submit}
            className="bg-navy text-navy-foreground hover:bg-navy/90"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kind">
          <Select value={form.kind} onValueChange={(v) => set("kind", v as LiabilityKind)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIABILITY_KINDS.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <TextField label="Name" value={form.name} onChange={(v) => set("name", v)} />
        <TextField label="Lender" value={form.lender} onChange={(v) => set("lender", v)} />
        <Field label="Original Amount">
          <MoneyInput
            value={toNum(form.originalAmount)}
            onChange={(n) => set("originalAmount", String(n))}
          />
        </Field>
        <Field label="Interest Rate %">
          <NumInput
            decimals={4}
            value={toNum(form.interestRate)}
            onChange={(n) => set("interestRate", String(n))}
          />
        </Field>
        <Field label="EMI">
          <MoneyInput value={toNum(form.emi)} onChange={(n) => set("emi", String(n))} />
        </Field>
        <TextField
          label="Next Due Date"
          type="date"
          value={form.nextDueDate}
          onChange={(v) => set("nextDueDate", v)}
        />
        <Field label="Notes" className="sm:col-span-2">
          <Textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            className="text-sm"
            rows={2}
          />
        </Field>
      </div>
    </ModalShell>
  );
}

function EntryFormModal({
  open,
  liabilities,
  defaultLiabilityId,
  onClose,
}: {
  open: boolean;
  liabilities: Liability[];
  defaultLiabilityId: string;
  onClose: () => void;
}) {
  const store = useLepdo();
  const [form, setForm] = useState<EntryForm>(emptyEntryForm(defaultLiabilityId));
  const [saving, setSaving] = useState(false);

  if (open && form.liabilityId === "" && defaultLiabilityId) {
    setForm(emptyEntryForm(defaultLiabilityId));
  }

  const sources = useMemo(
    () => [
      ...store.bankAccounts
        .filter((b) => b.active)
        .map((b) => ({ id: b.id, label: `${b.bankName} — ${b.nickname}` })),
      ...store.cashLocations.filter((c) => c.active).map((c) => ({ id: c.id, label: c.name })),
    ],
    [store.bankAccounts, store.cashLocations],
  );

  const set = <K extends keyof EntryForm>(k: K, v: EntryForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.liabilityId) {
      toast.error("Select a liability.");
      return;
    }
    if (!form.particulars.trim()) {
      toast.error("Enter particulars.");
      return;
    }
    const principal = Number(form.principal) || 0;
    const interest = Number(form.interest) || 0;
    if (principal <= 0 && interest <= 0) {
      toast.error("Enter principal or interest amount.");
      return;
    }
    setSaving(true);
    try {
      const rec = store.stamp("liabent", {
        liabilityId: form.liabilityId,
        date: form.date,
        type: form.type,
        particulars: form.particulars.trim(),
        principal,
        interest,
        paidFrom: form.paidFrom || undefined,
        sourceModule: "Manual",
        voided: false,
      });
      store.saveRecord("liabilityEntries", rec);
      toast.success("Entry saved.");
      onClose();
      setForm(emptyEntryForm(form.liabilityId));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Add Liability Entry"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={submit}
            className="bg-navy text-navy-foreground hover:bg-navy/90"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Liability">
          <Select value={form.liabilityId} onValueChange={(v) => set("liabilityId", v)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select liability" />
            </SelectTrigger>
            <SelectContent>
              {liabilities.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <TextField label="Date" type="date" value={form.date} onChange={(v) => set("date", v)} />
        <Field label="Type">
          <Select value={form.type} onValueChange={(v) => set("type", v as LiabilityEntry["type"])}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIABILITY_ENTRY_TYPES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Paid from (optional)">
          <Select
            value={form.paidFrom || "none"}
            onValueChange={(v) => set("paidFrom", v === "none" ? "" : v)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Principal">
          <MoneyInput value={toNum(form.principal)} onChange={(n) => set("principal", String(n))} />
        </Field>
        <Field label="Interest">
          <MoneyInput value={toNum(form.interest)} onChange={(n) => set("interest", String(n))} />
        </Field>
        <Field label="Particulars" className="sm:col-span-2">
          <Input
            value={form.particulars}
            onChange={(e) => set("particulars", e.target.value)}
            className="h-9 text-sm"
          />
        </Field>
      </div>
    </ModalShell>
  );
}

/* ================= EMI Tracker (reminder only) ================= */

function EmiCard({
  plan,
  onEdit,
  onDelete,
  onClose,
  onReopen,
}: {
  plan: EmiPlan;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onReopen: () => void;
}) {
  const store = useLepdo();
  const closed = !!plan.closed;
  // Older plans stored a bank-account id; show its name, otherwise the typed text.
  const linkedBank = store.bankAccounts.find((b) => b.id === plan.paidFromId);
  const bankText = linkedBank
    ? `${linkedBank.bankName} — ${linkedBank.nickname}`
    : plan.paidFromId || "—";
  return (
    <SectionCard className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm leading-snug font-semibold break-words text-navy">{plan.name}</p>
          {plan.notes ? (
            <p className="mt-0.5 text-xs break-words text-muted-foreground">{plan.notes}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Chip tone={closed ? "grey" : "green"}>{closed ? "Closed" : "Active"}</Chip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" aria-label="EMI actions">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              {closed ? (
                <DropdownMenuItem onClick={onReopen}>Mark as Active</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onClose}>Close Loan</DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div
        className={cn(
          "mt-3 flex items-center justify-between rounded-md px-3 py-2",
          closed ? "bg-muted text-muted-foreground" : "bg-pl-blue text-navy",
        )}
      >
        <div>
          <p className="text-[11px] uppercase tracking-wide opacity-80">EMI Debit Date</p>
          <p className="text-sm font-semibold">Day {plan.dueDay} of month</p>
        </div>
        <p className="num text-lg font-bold">{formatMoney(plan.amount)}</p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Debit from</dt>
        <dd className="text-right text-xs leading-snug font-medium break-words">
          {bankText}
        </dd>
      </dl>
      <div className="mt-auto flex gap-2 pt-3">
        <Button variant="outline" size="sm" className="h-8 flex-1 text-xs" onClick={onEdit}>
          Edit
        </Button>
        {closed ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 flex-1 text-xs"
            onClick={onReopen}
          >
            Mark as Active
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-8 flex-1 bg-navy text-xs text-navy-foreground hover:bg-navy/90"
            onClick={onClose}
          >
            Close Loan
          </Button>
        )}
      </div>
    </SectionCard>
  );
}

interface EmiForm {
  id: string | null;
  name: string;
  amount: string;
  dueDay: string;
  bankText: string;
  notes: string;
  closed: boolean;
}

const emptyEmiForm = (): EmiForm => ({
  id: null,
  name: "",
  amount: "",
  dueDay: "5",
  bankText: "",
  notes: "",
  closed: false,
});

function EmiTab() {
  const store = useLepdo();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmiPlan | null>(null);
  const [closingPlan, setClosingPlan] = useState<EmiPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<EmiPlan | null>(null);

  const plans = store.emiPlans;
  // Ordered by the saved debit day, then by title. No upcoming-date calculation.
  const activePlans = useMemo(
    () =>
      plans
        .filter((p) => !p.closed)
        .sort((a, b) => {
          if (a.dueDay !== b.dueDay) return a.dueDay - b.dueDay;
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        }),
    [plans],
  );
  const closedPlans = useMemo(() => plans.filter((p) => p.closed), [plans]);
  /** Sum of EMI amounts from active records only; closed loans are excluded. */
  const totalActiveEmi = useMemo(
    () => round2(activePlans.reduce((s, p) => s + (p.amount || 0), 0)),
    [activePlans],
  );

  const deletePlan = () => {
    if (!deletingPlan) return;
    for (const pay of store.emiPayments.filter((x) => x.planId === deletingPlan.id)) {
      store.removeRecord("emiPayments", pay.id);
    }
    store.removeRecord("emiPlans", deletingPlan.id);
    toast.success("EMI reminder deleted.");
    setDeletingPlan(null);
  };

  const setClosed = (plan: EmiPlan, closed: boolean) => {
    store.saveRecord("emiPlans", { ...plan, closed });
    toast.success(closed ? "Loan closed." : "Loan marked active again.");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-navy/25 bg-navy p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gold">
              Total Active EMI Amount
            </p>
            <p className="num mt-1 text-2xl font-bold text-navy-foreground sm:text-3xl">
              {formatMoney(totalActiveEmi)}
            </p>
            <p className="mt-1 text-xs text-navy-foreground/70">
              Sum of EMI amounts from {activePlans.length} active{" "}
              {activePlans.length === 1 ? "loan" : "loans"}. Closed loans are not included.
            </p>
          </div>
          <Chip tone="green">Reminders only</Chip>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Active Loans"
          value={String(activePlans.length)}
          tone="green"
          icon={<CalendarClock className="size-4" />}
        />
        <StatCard
          label="Closed Loans"
          value={String(closedPlans.length)}
          tone="grey"
          icon={<CheckCircle2 className="size-4" />}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Reminders only — EMI plans never create or change any Bank, Cash, Expense or other entry.
        </p>
        <Button
          className="h-9 bg-navy text-navy-foreground hover:bg-navy/90"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" /> Add EMI Plan
        </Button>
      </div>

      {activePlans.length === 0 && closedPlans.length === 0 ? (
        <EmptyState title="No EMI plans yet" hint="Add an EMI plan to get monthly payment reminders." />
      ) : (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(max(300px, calc((100% - 32px) / 3)), 100%), 1fr))",
          }}
        >
          {activePlans.map((p) => (
            <EmiCard
              key={p.id}
              plan={p}
              onEdit={() => {
                setEditing(p);
                setFormOpen(true);
              }}
              onClose={() => setClosingPlan(p)}
              onReopen={() => setClosed(p, false)}
              onDelete={() => setDeletingPlan(p)}
            />
          ))}
        </div>
      )}

      {closedPlans.length > 0 ? (
        <SectionCard title="Closed Loans">
          <ul className="divide-y divide-border text-sm">
            {closedPlans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(p.amount)}/month · Debit day {p.dueDay}
                    {p.paidFromId ? ` · ${p.paidFromId}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setClosed(p, false)}
                  >
                    Mark as Active
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(p);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setDeletingPlan(p)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <EmiFormModal open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />

      <AlertDialog open={!!closingPlan} onOpenChange={(o) => !o && setClosingPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this loan?</AlertDialogTitle>
            <AlertDialogDescription>
              {closingPlan
                ? `${closingPlan.name} will move to Closed Loans and can be marked active again anytime.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (closingPlan) setClosed(closingPlan, true);
                setClosingPlan(null);
              }}
            >
              Close Loan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingPlan} onOpenChange={(o) => !o && setDeletingPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this EMI reminder?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingPlan
                ? `${deletingPlan.name} will be removed. No accounting entry is affected.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deletePlan}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmiFormModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: EmiPlan | null;
  onClose: () => void;
}) {
  const store = useLepdo();
  const [form, setForm] = useState<EmiForm>(emptyEmiForm());
  const [saving, setSaving] = useState(false);

  if (open && form.id !== (editing?.id ?? null) && !saving) {
    const next: EmiForm = editing
      ? {
          id: editing.id,
          name: editing.name,
          amount: String(editing.amount),
          dueDay: String(editing.dueDay),
          bankText: editing.paidFromId ?? "",
          notes: editing.notes ?? "",
          closed: !!editing.closed,
        }
      : emptyEmiForm();
    if (JSON.stringify(next) !== JSON.stringify(form)) setForm(next);
  }

  const set = <K extends keyof EmiForm>(k: K, v: EmiForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("Enter the EMI title / reason.");
      return;
    }
    const amount = Number(form.amount) || 0;
    if (amount <= 0) {
      toast.error("Enter the EMI amount.");
      return;
    }
    const dueDay = Number(form.dueDay) || 1;
    if (dueDay < 1 || dueDay > 31) {
      toast.error("Monthly debit date must be between 1 and 31.");
      return;
    }
    setSaving(true);
    try {
      const rec = store.stamp("emiplan", {
        id: editing?.id,
        name: form.name.trim(),
        lender: editing?.lender,
        loanType: editing?.loanType,
        interestRate: editing?.interestRate,
        reference: editing?.reference,
        amount,
        dueDay,
        paidFromType: "bank",
        paidFromId: form.bankText.trim(),
        startDate: editing?.startDate || todayISO(),
        endDate: undefined,
        installments: editing?.installments ?? 12,
        notes: form.notes || undefined,
        closed: form.closed,
      });
      store.saveRecord("emiPlans", rec as EmiPlan);
      toast.success(editing ? "EMI plan updated." : "EMI plan added.");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={editing ? "Edit EMI Plan" : "Add EMI Plan"}
      subtitle="Reminder only — no Bank, Cash or other accounting entry is created."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={submit}
            className="bg-navy text-navy-foreground hover:bg-navy/90"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <TextField label="EMI Title / Reason" value={form.name} onChange={(v) => set("name", v)} />
        <Field label="EMI Debit Date (day of month, 1-31)">
          <NumInput
            decimals={0}
            value={toNum(form.dueDay)}
            onChange={(n) => set("dueDay", String(n))}
          />
        </Field>
        <Field
          label="Debit From Bank"
          hint="Type any bank name — for reminder only, no balance is changed."
        >
          <Input
            value={form.bankText}
            onChange={(e) => set("bankText", e.target.value)}
            placeholder="e.g. HDFC Bank — Current A/c"
            className="h-9 text-sm"
          />
        </Field>
        <Field label="EMI Amount">
          <MoneyInput value={toNum(form.amount)} onChange={(n) => set("amount", String(n))} />
        </Field>
        <Field label="Other Details (optional)">
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
        </Field>
      </div>
    </ModalShell>
  );
}
