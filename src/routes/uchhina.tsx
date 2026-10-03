import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Download,
  HandCoins,
  Pencil,
  Plus,
  Scale,
  Search,
  Trash2,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, formatMoney, todayISO } from "@/lib/lepdo/format";
import { MoneyInput, NumInput, toNum } from "@/components/lepdo/numeric";
import { useLepdo } from "@/lib/lepdo/store";
import { periodLabel } from "@/lib/lepdo/period";
import { useShell } from "@/components/lepdo/shell-context";
import { CASH_BOOKS } from "@/lib/lepdo/cash";
import { Combo } from "@/components/lepdo/sales/ui";
import {
  UCHHINA_GIVEN,
  UCHHINA_RECEIVED_BACK,
  UCHHINA_RETURNED,
  UCHHINA_TAKEN,
  buildPersonLedgers,
  uchhinaDirection,
  uchhinaTypeLabel,
  type PersonLedger,
  type UchhinaRow,
} from "@/lib/lepdo/uchhina";
import { downloadUchhinaExcel, downloadUchhinaPdf } from "@/lib/lepdo/uchhinaReport";

export const Route = createFileRoute("/uchhina")({
  head: () => ({
    meta: [
      { title: "Uchhina — LEPDO Accounting" },
      {
        name: "description",
        content:
          "Person-wise Uchhina register for LEPDO: money given, received back, money taken, returned and outstanding balances.",
      },
      { property: "og:title", content: "Uchhina — LEPDO Accounting" },
      {
        property: "og:description",
        content:
          "Manual person-wise Uchhina register with running balances and CA-ready Excel and PDF reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UchhinaPage,
});

function UchhinaPage() {
  const store = useLepdo();
  const shell = useShell();
  const { from, to, preset } = shell;
  const [person, setPerson] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<UchhinaRow | null>(null);
  const [deleting, setDeleting] = useState<UchhinaRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const setQuickUchhina = shell.setQuickUchhina;
  useEffect(() => {
    setQuickUchhina(() => setFormOpen(true));
    return () => setQuickUchhina(null);
  }, [setQuickUchhina]);

  const allLedgers = useMemo(
    () =>
      buildPersonLedgers(
        store.transactions,
        store.parties,
        store.bankAccounts,
        store.cashLocations,
        from,
        to,
      ),
    [store.transactions, store.parties, store.bankAccounts, store.cashLocations, from, to],
  );

  const ledgers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allLedgers.filter(
      (l) =>
        (person === "all" || l.personId === person) && (!q || l.name.toLowerCase().includes(q)),
    );
  }, [allLedgers, person, search]);

  const totals = useMemo(
    () =>
      ledgers.reduce(
        (acc, l) => ({
          given: acc.given + l.periodGiven,
          taken: acc.taken + l.periodTaken,
          stillToReceive: acc.stillToReceive + l.stillToReceive,
          stillToPay: acc.stillToPay + l.stillToPay,
          net: acc.net + l.netBalance,
        }),
        { given: 0, taken: 0, stillToReceive: 0, stillToPay: 0, net: 0 },
      ),
    [ledgers],
  );

  const doDownload = (kind: "excel" | "pdf") => {
    const meta = {
      personLabel:
        person === "all"
          ? "All Persons"
          : (allLedgers.find((l) => l.personId === person)?.name ?? "All Persons"),
      periodLabel: `${periodLabel(preset)} (${formatDate(from)} – ${formatDate(to)})`,
      given: totals.given,
      stillToReceive: totals.stillToReceive,
      taken: totals.taken,
      stillToPay: totals.stillToPay,
    };
    if (kind === "excel") downloadUchhinaExcel(ledgers, meta);
    else if (!downloadUchhinaPdf(ledgers, meta)) {
      toast.error("Allow pop-ups to generate the PDF report.");
      return;
    }
    toast.success(`Uchhina report ready — ${meta.personLabel}.`);
  };

  const cards = [
    {
      key: "given",
      label: "Total Money Given",
      value: totals.given,
      icon: ArrowUpRight,
      cls: "bg-uch-advance-bg text-uch-advance",
      period: true,
    },
    {
      key: "receive",
      label: "Still to Receive",
      value: Math.max(0, totals.stillToReceive),
      icon: HandCoins,
      cls: "bg-uch-out-bg text-uch-out",
      period: false,
    },
    {
      key: "taken",
      label: "Total Money Taken",
      value: totals.taken,
      icon: ArrowDownLeft,
      cls: "bg-uch-taken-bg text-uch-taken",
      period: true,
    },
    {
      key: "pay",
      label: "Still to Pay",
      value: Math.max(0, totals.stillToPay),
      icon: Scale,
      cls: "bg-uch-pay-bg text-uch-pay",
      period: false,
    },
  ] as const;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="hidden text-xl font-semibold tracking-tight text-navy lg:block lg:text-2xl">
          Uchhina
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={person} onValueChange={setPerson}>
            <SelectTrigger aria-label="Person filter" className="h-9 w-[170px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All Persons</SelectItem>
              {allLedgers.map((l) => (
                <SelectItem key={l.personId} value={l.personId}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search person"
              value={search}
              placeholder="Search person"
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-[180px] pl-8 text-sm"
            />
          </div>

          <Button className="h-9" onClick={() => setFormOpen(true)}>
            <Plus className="size-4" /> Add Uchhina
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 border-gold text-navy">
                <Download className="size-4" /> Download Report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{periodLabel(preset)}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => doDownload("excel")}>Excel (.xls)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doDownload("pdf")}>PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.key} className={cn("rounded-xl border border-border p-4", c.cls)}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold leading-tight">{c.label}</p>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card/70">
                <c.icon className="size-[18px]" />
              </span>
            </div>
            <p className="num mt-3 text-xl font-semibold">{formatMoney(c.value)}</p>
            <p className="mt-1 text-xs opacity-70">
              {c.period ? `${formatDate(from)} – ${formatDate(to)}` : `As on ${formatDate(to)}`}
            </p>
          </div>
        ))}
      </div>

      <NetBalanceCard net={totals.net} asOn={to} />

      <p className="text-xs text-muted-foreground">
        Uchhina is recorded manually here — Add, edit or delete entries only from this section.
      </p>

      {ledgers.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
          No Uchhina entries yet. Use “Add Uchhina” above to record money given, received back,
          taken or returned for a person.
        </div>
      ) : (
        <PersonTable
          ledgers={ledgers}
          open={open}
          onToggle={(id) => setOpen((s) => ({ ...s, [id]: !(s[id] ?? true) }))}
          onEdit={setEditing}
          onDelete={setDeleting}
        />
      )}

      <UchhinaFormDialog
        open={formOpen || !!editing}
        editing={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `${uchhinaTypeLabel(deleting.category)} of ${formatMoney(deleting.amount)} on ${formatDate(deleting.date)} will be removed from the books.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-neg text-white hover:bg-neg/90"
              onClick={() => {
                if (deleting) store.voidEntry(deleting.id);
                setDeleting(null);
                toast.success("Entry deleted.");
              }}
            >
              Delete entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NetBalanceCard({ net, asOn }: { net: number; asOn: string }) {
  const label =
    net > 0
      ? "Net Receivable — We Have to Receive"
      : net < 0
        ? "Net Payable — We Have to Pay"
        : "Settled";
  return (
    <div
      className={cn(
        "rounded-xl border-2 p-4 shadow-sm",
        net > 0
          ? "border-uch-out bg-uch-out-bg text-uch-out"
          : net < 0
            ? "border-uch-pay bg-uch-pay-bg text-uch-pay"
            : "border-border bg-muted text-muted-foreground",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card/70">
            <Scale className="size-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold">Net Uchhina Balance</p>
            <p className="text-xs opacity-70">
              Still to Receive − Still to Pay · As on {formatDate(asOn)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="num text-2xl font-semibold">{formatMoney(Math.abs(net))}</p>
          <p className="text-xs font-medium">{label}</p>
        </div>
      </div>
    </div>
  );
}

function netCls(net: number): string {
  if (net > 0) return "text-uch-out";
  if (net < 0) return "text-uch-pay";
  return "text-muted-foreground";
}

/** Person-wise table (desktop) / stacked cards (mobile), each expandable to entries. */
function PersonTable({
  ledgers,
  open,
  onToggle,
  onEdit,
  onDelete,
}: {
  ledgers: PersonLedger[];
  open: Record<string, boolean>;
  onToggle: (id: string) => void;
  onEdit: (row: UchhinaRow) => void;
  onDelete: (row: UchhinaRow) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Person</th>
              <th className="px-3 py-2 text-right font-semibold">Given</th>
              <th className="px-3 py-2 text-right font-semibold">Received Back</th>
              <th className="px-3 py-2 text-right font-semibold">Taken</th>
              <th className="px-3 py-2 text-right font-semibold">Returned</th>
              <th className="px-3 py-2 text-right font-semibold">Still to Receive</th>
              <th className="px-3 py-2 text-right font-semibold">Still to Pay</th>
              <th className="px-3 py-2 text-right font-semibold">Net Balance</th>
            </tr>
          </thead>
          <tbody>
            {ledgers.map((l) => {
              const isOpen = open[l.personId] ?? true;
              return (
                <>
                  <tr
                    key={l.personId}
                    className="cursor-pointer border-t border-border align-top hover:bg-muted/40"
                    onClick={() => onToggle(l.personId)}
                  >
                    <td className="px-3 py-2 font-semibold text-navy">
                      <span className="flex items-center gap-2">
                        <ChevronDown
                          className={cn("size-4 transition-transform", isOpen ? "" : "-rotate-90")}
                          aria-hidden
                        />
                        {l.name}
                      </span>
                    </td>
                    <td className="num whitespace-nowrap px-3 py-2 text-right text-uch-advance">
                      {formatMoney(l.given)}
                    </td>
                    <td className="num whitespace-nowrap px-3 py-2 text-right text-uch-returned">
                      {formatMoney(l.receivedBack)}
                    </td>
                    <td className="num whitespace-nowrap px-3 py-2 text-right text-uch-taken">
                      {formatMoney(l.taken)}
                    </td>
                    <td className="num whitespace-nowrap px-3 py-2 text-right text-uch-returned">
                      {formatMoney(l.returned)}
                    </td>
                    <td className="num whitespace-nowrap px-3 py-2 text-right font-semibold text-uch-out">
                      {formatMoney(Math.max(0, l.stillToReceive))}
                    </td>
                    <td className="num whitespace-nowrap px-3 py-2 text-right font-semibold text-uch-pay">
                      {formatMoney(Math.max(0, l.stillToPay))}
                    </td>
                    <td
                      className={cn(
                        "num whitespace-nowrap px-3 py-2 text-right font-semibold",
                        netCls(l.netBalance),
                      )}
                    >
                      {formatMoney(Math.abs(l.netBalance))}
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr key={`${l.personId}-detail`} className="border-t border-border">
                      <td colSpan={8} className="bg-muted/20 p-0">
                        <EntriesTable ledger={l} onEdit={onEdit} onDelete={onDelete} />
                      </td>
                    </tr>
                  ) : null}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="space-y-3 lg:hidden">
        {ledgers.map((l) => {
          const isOpen = open[l.personId] ?? true;
          return (
            <section
              key={l.personId}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            >
              <button
                type="button"
                onClick={() => onToggle(l.personId)}
                aria-expanded={isOpen}
                className="flex w-full flex-col gap-2 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-navy">
                  <ChevronDown
                    className={cn("size-4 transition-transform", isOpen ? "" : "-rotate-90")}
                    aria-hidden
                  />
                  {l.name}
                </span>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <Fig label="Given" value={l.given} cls="text-uch-advance" />
                  <Fig label="Received Back" value={l.receivedBack} cls="text-uch-returned" />
                  <Fig label="Taken" value={l.taken} cls="text-uch-taken" />
                  <Fig label="Returned" value={l.returned} cls="text-uch-returned" />
                  <Fig
                    label="Still to Receive"
                    value={Math.max(0, l.stillToReceive)}
                    cls="font-semibold text-uch-out"
                  />
                  <Fig
                    label="Still to Pay"
                    value={Math.max(0, l.stillToPay)}
                    cls="font-semibold text-uch-pay"
                  />
                  <Fig
                    label="Net Balance"
                    value={Math.abs(l.netBalance)}
                    cls={cn("col-span-2 font-semibold", netCls(l.netBalance))}
                  />
                </dl>
              </button>
              {isOpen ? <EntriesTable ledger={l} onEdit={onEdit} onDelete={onDelete} /> : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Fig({ label, value, cls }: { label: string; value: number; cls?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("num", cls)}>{formatMoney(value)}</dd>
    </div>
  );
}

function EntriesTable({
  ledger,
  onEdit,
  onDelete,
}: {
  ledger: PersonLedger;
  onEdit: (row: UchhinaRow) => void;
  onDelete: (row: UchhinaRow) => void;
}) {
  if (ledger.rows.length === 0) {
    return (
      <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
        No entries in the selected period.
      </p>
    );
  }
  return (
    <>
      <div className="hidden overflow-x-auto border-t border-border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Date</th>
              <th className="px-3 py-2 text-left font-semibold">Entry Type</th>
              <th className="px-3 py-2 text-left font-semibold">Particulars</th>
              <th className="px-3 py-2 text-left font-semibold">Account</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
              <th className="px-3 py-2 text-right font-semibold">Receivable</th>
              <th className="px-3 py-2 text-right font-semibold">Payable</th>
              <th className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ledger.rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap px-3 py-2">{formatDate(r.date)}</td>
                <td className="px-3 py-2">
                  <TypeBadge row={r} />
                </td>
                <td className="max-w-[260px] px-3 py-2 text-muted-foreground">
                  <span className="block break-words">{r.particulars}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{r.account}</td>
                <td
                  className={cn(
                    "num whitespace-nowrap px-3 py-2 text-right font-medium",
                    typeCls(r.category).split(" ")[1],
                  )}
                >
                  {formatMoney(r.amount)}
                </td>
                <td className="num whitespace-nowrap px-3 py-2 text-right font-semibold text-uch-out">
                  {formatMoney(r.receivable)}
                </td>
                <td className="num whitespace-nowrap px-3 py-2 text-right font-semibold text-uch-pay">
                  {formatMoney(r.payable)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label="Edit entry"
                      onClick={() => onEdit(r)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-neg hover:text-neg"
                      aria-label="Delete entry"
                      onClick={() => onDelete(r)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border border-t border-border md:hidden">
        {ledger.rows.map((r) => (
          <li key={r.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{formatDate(r.date)}</p>
                <p className="mt-1 break-words text-sm font-medium text-navy">{r.particulars}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <TypeBadge row={r} />
                  <span className="text-xs text-muted-foreground">{r.account}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={cn("num text-sm font-semibold", typeCls(r.category).split(" ")[1])}
                >
                  {formatMoney(r.amount)}
                </span>
                <span className="num text-xs text-muted-foreground">
                  Rec {formatMoney(r.receivable)} · Pay {formatMoney(r.payable)}
                </span>
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => onEdit(r)}
              >
                <Pencil className="size-3.5" /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs text-neg hover:text-neg"
                onClick={() => onDelete(r)}
              >
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function TypeBadge({ row }: { row: UchhinaRow }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium",
        typeCls(row.category),
      )}
    >
      {uchhinaTypeLabel(row.category)}
    </span>
  );
}

function typeCls(id: UchhinaRow["category"]): string {
  switch (id) {
    case UCHHINA_GIVEN:
      return "bg-uch-advance-bg text-uch-advance";
    case UCHHINA_RECEIVED_BACK:
      return "bg-uch-returned-bg text-uch-returned";
    case UCHHINA_TAKEN:
      return "bg-uch-taken-bg text-uch-taken";
    default:
      return "bg-uch-pay-bg text-uch-pay";
  }
}

const TYPES = [
  { id: UCHHINA_GIVEN, label: "Money Given" },
  { id: UCHHINA_RECEIVED_BACK, label: "Money Received Back" },
  { id: UCHHINA_TAKEN, label: "Money Taken" },
  { id: UCHHINA_RETURNED, label: "Money Returned" },
] as const;

/** Manual Add / Edit form for a single Uchhina entry. */
function UchhinaFormDialog({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: UchhinaRow | null;
  onClose: () => void;
}) {
  const store = useLepdo();
  const banks = store.bankAccounts.filter((b) => b.active);
  const accounts = [
    ...banks.map((b) => ({
      id: b.id,
      label: `${b.bankName} ••${b.last4}`,
      sourceType: "bank" as const,
    })),
    ...CASH_BOOKS.map((c) => ({ id: c.id, label: `${c.short} Cash`, sourceType: "cash" as const })),
  ];
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [type, setType] = useState<UchhinaRow["category"]>(UCHHINA_GIVEN);
  const [particulars, setParticulars] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [addPersonOpen, setAddPersonOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const tx = store.transactions.find((t) => t.id === editing.id);
      setDate(editing.date);
      setAccountId(tx?.accountId || accounts[0]?.id || "");
      setName(store.parties.find((p) => p.id === tx?.partyId)?.name ?? "");
      setType(editing.category ?? UCHHINA_GIVEN);
      setParticulars(editing.particulars);
      setAmount(String(editing.amount));
      setNotes(tx?.notes ?? "");
    } else {
      setDate(todayISO());
      setAccountId((prev) => prev || accounts[0]?.id || "");
      setName("");
      setType(UCHHINA_GIVEN);
      setParticulars("");
      setAmount("");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const submit = () => {
    const account = accounts.find((a) => a.id === accountId);
    const value = Number(amount);
    if (!account) {
      toast.error("Select a bank or cash account.");
      return;
    }
    if (!name.trim()) {
      toast.error("Person name is required.");
      return;
    }
    if (!particulars.trim()) {
      toast.error("Particulars are required.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }

    const existing = store.parties.find(
      (p) => p.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    const party = existing ?? store.addParty(name.trim(), "other");
    const input = {
      date,
      sourceType: account.sourceType,
      accountId: account.id,
      direction: uchhinaDirection(type) ?? "out",
      amount: value,
      category: type,
      partyId: party.id,
      particulars: particulars.trim(),
      notes: notes.trim() || undefined,
    };

    if (editing) {
      const res = store.updateEntry(editing.id, input);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`${uchhinaTypeLabel(type)} updated for ${party.name}.`);
      onClose();
      return;
    }

    if (store.isLikelyDuplicate(input)) {
      toast.error("A matching Uchhina entry already exists for this date and amount.");
      return;
    }
    const res = store.addEntry(input);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(`${uchhinaTypeLabel(type)} recorded for ${party.name}.`);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="text-navy">
              {editing ? "Edit Uchhina Entry" : "Add Uchhina Entry"}
            </DialogTitle>
            <DialogDescription>
              Uchhina entries are recorded manually here and never pulled from Bank or Cash entries.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 overflow-y-auto px-5 py-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="uch-date">Date</Label>
              <Input
                id="uch-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger aria-label="Account">
                  <SelectValue placeholder="Bank or Cash" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="uch-person">Person Name</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Combo
                    value={name}
                    onChange={setName}
                    options={store.parties.map((p) => p.name)}
                    placeholder="Search or select a person"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0"
                  onClick={() => setAddPersonOpen(true)}
                >
                  <UserPlus className="size-4" /> Add Person
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Transaction Type</Label>
              <Select
                value={type ?? ""}
                onValueChange={(v) => setType(v as UchhinaRow["category"])}
              >
                <SelectTrigger aria-label="Transaction type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uch-amt">Amount (₹)</Label>
              <MoneyInput
                id="uch-amt"
                value={toNum(amount)}
                onChange={(n) => setAmount(String(n))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="uch-part">Particulars</Label>
              <Input
                id="uch-part"
                value={particulars}
                placeholder="Purpose of the Uchhina"
                onChange={(e) => setParticulars(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="uch-notes">Reference / Notes (optional)</Label>
              <Textarea
                id="uch-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="border-t border-border px-5 py-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit}>
              <Wallet className="size-4" /> {editing ? "Save Changes" : "Save Uchhina"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddPersonDialog
        open={addPersonOpen}
        onClose={() => setAddPersonOpen(false)}
        onCreated={(created) => setName(created)}
      />
    </>
  );
}

function AddPersonDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const store = useLepdo();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      toast.error("Enter a person name.");
      return;
    }
    const existing = store.parties.find(
      (p) => p.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    const party = existing ?? store.addParty(trimmed, "other");
    onCreated(party.name);
    toast.success(existing ? `${party.name} already exists — selected.` : `${party.name} added.`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-navy">Add Person</DialogTitle>
          <DialogDescription>Creates a new party you can select for Uchhina.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="new-person-name">Name</Label>
          <Input
            id="new-person-name"
            autoFocus
            value={value}
            placeholder="e.g. Ramesh Bhai"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <UserPlus className="size-4" /> Add Person
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
