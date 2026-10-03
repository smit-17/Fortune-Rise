import { isPosted } from "@/lib/lepdo/entry";
import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleHelp,
  Copy,
  Eye,
  Pencil,
  Plus,
  Ban,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CATEGORIES } from "@/lib/lepdo/constants";
import { formatDate, formatDateTime, formatMoney, round2 } from "@/lib/lepdo/format";
import { partyName, useLepdo } from "@/lib/lepdo/store";
import type { SourceType, Transaction } from "@/lib/lepdo/types";
import { CategoryBadge, PageHeading, StatusBadge, SummaryCard, statusOf } from "./bits";
import { useShell } from "./shell-context";

interface Row extends Transaction {
  balance: number;
}

export function LedgerView({ sourceType }: { sourceType: SourceType }) {
  const store = useLepdo();
  const shell = useShell();
  const isBank = sourceType === "bank";

  const [accountFilter, setAccountFilter] = useState("all");
  const [dirFilter, setDirFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [partyFilter, setPartyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [localSearch, setLocalSearch] = useState("");
  const [viewing, setViewing] = useState<Transaction | null>(null);
  const [voidTarget, setVoidTarget] = useState<Transaction | null>(null);

  const accounts = isBank ? store.bankAccounts : store.cashLocations;

  const rowsWithBalance = useMemo<Row[]>(() => {
    const running = new Map<string, number>();
    accounts.forEach((a) => running.set(a.id, a.openingBalance));
    const sorted = [...store.transactions]
      .filter((t) => t.sourceType === sourceType)
      .sort((a, b) =>
        a.date === b.date ? a.code.localeCompare(b.code) : a.date.localeCompare(b.date),
      );
    return sorted.map((t) => {
      const prev = running.get(t.accountId) ?? 0;
      const next = isPosted(t)
        ? round2(prev + (t.direction === "in" ? t.amount : -t.amount))
        : prev;
      running.set(t.accountId, next);
      return { ...t, balance: next };
    });
  }, [store.transactions, accounts, sourceType]);

  const search = (shell.search || localSearch).toLowerCase().trim();

  const filtered = useMemo(() => {
    return rowsWithBalance
      .filter((t) => t.date >= shell.from && t.date <= shell.to)
      .filter((t) => accountFilter === "all" || t.accountId === accountFilter)
      .filter((t) => dirFilter === "all" || t.direction === dirFilter)
      .filter((t) =>
        catFilter === "all"
          ? true
          : catFilter === "unclassified"
            ? !t.category
            : t.category === catFilter,
      )
      .filter((t) => partyFilter === "all" || t.partyId === partyFilter)
      .filter((t) => statusFilter === "all" || statusOf(t).toLowerCase() === statusFilter)
      .filter((t) => (minAmount ? t.amount >= Number(minAmount) : true))
      .filter((t) => (maxAmount ? t.amount <= Number(maxAmount) : true))
      .filter((t) =>
        search
          ? `${t.particulars} ${t.reference ?? ""} ${t.code}`.toLowerCase().includes(search)
          : true,
      )
      .reverse();
  }, [
    rowsWithBalance,
    shell.from,
    shell.to,
    accountFilter,
    dirFilter,
    catFilter,
    partyFilter,
    statusFilter,
    minAmount,
    maxAmount,
    search,
  ]);

  const periodRows = rowsWithBalance.filter(
    (t) => isPosted(t) && t.date >= shell.from && t.date <= shell.to,
  );
  const moneyIn = round2(
    periodRows.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0),
  );
  const moneyOut = round2(
    periodRows.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0),
  );
  const totalBalance = round2(
    accounts.filter((a) => a.active).reduce((s, a) => s + store.balanceOf(sourceType, a.id), 0),
  );
  const unclassified = rowsWithBalance.filter((t) => isPosted(t) && !t.category).length;

  function clearFilters() {
    setAccountFilter("all");
    setDirFilter("all");
    setCatFilter("all");
    setPartyFilter("all");
    setStatusFilter("all");
    setMinAmount("");
    setMaxAmount("");
    setLocalSearch("");
    shell.setSearch("");
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title={isBank ? "Bank Ledger" : "Cash Book"}
        breadcrumb={`LEPDO Accounting / ${isBank ? "Bank Ledger" : "Cash Book"}`}
      >
        <Button onClick={() => shell.openEntry({ sourceType })}>
          <Plus className="size-4" /> {isBank ? "Add Bank Entry" : "Add Cash Entry"}
        </Button>
      </PageHeading>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label={isBank ? "Total Bank Balance" : "Total Cash Balance"}
          value={formatMoney(totalBalance)}
          hint={`${accounts.filter((a) => a.active).length} active ${isBank ? "accounts" : "locations"}`}
          icon={<Wallet className="size-4" />}
        />
        <SummaryCard
          label={isBank ? "Money In" : "Cash In"}
          value={formatMoney(moneyIn)}
          hint="Selected period"
          tone="pos"
          icon={<ArrowDownRight className="size-4" />}
        />
        <SummaryCard
          label={isBank ? "Money Out" : "Cash Out"}
          value={formatMoney(moneyOut)}
          hint="Selected period"
          tone="neg"
          icon={<ArrowUpRight className="size-4" />}
        />
        <SummaryCard
          label="Unclassified Entries"
          value={String(unclassified)}
          hint="Need a category before reporting"
          tone="muted"
          icon={<CircleHelp className="size-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((acc) => {
          const bank = "bankName" in acc ? acc : null;
          const updated = store.lastUpdatedOf(acc.id);
          return (
            <div key={acc.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">
                    {bank ? bank.bankName : (acc as { name: string }).name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {bank ? `${bank.nickname} • ••••${bank.last4}` : "Cash location"}
                    {!acc.active ? " • Inactive" : ""}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setAccountFilter(acc.id)}>
                  View Ledger
                </Button>
              </div>
              <p className="num mt-3 text-xl font-semibold text-foreground">
                {formatMoney(store.balanceOf(sourceType, acc.id))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Last updated {updated ? formatDateTime(updated) : "—"}
              </p>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <FilterSelect
            label={isBank ? "Bank account" : "Cash location"}
            value={accountFilter}
            onChange={setAccountFilter}
            options={[
              { value: "all", label: "All" },
              ...accounts.map((a) => ({
                value: a.id,
                label:
                  "bankName" in a ? `${a.bankName} ••${a.last4}` : (a as { name: string }).name,
              })),
            ]}
          />
          <FilterSelect
            label={isBank ? "Credit / Debit" : "Cash In / Out"}
            value={dirFilter}
            onChange={setDirFilter}
            options={[
              { value: "all", label: "All" },
              { value: "in", label: isBank ? "Credit" : "Cash In" },
              { value: "out", label: isBank ? "Debit" : "Cash Out" },
            ]}
          />
          <FilterSelect
            label="Category"
            value={catFilter}
            onChange={setCatFilter}
            options={[
              { value: "all", label: "All" },
              { value: "unclassified", label: "Unclassified" },
              ...CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
            ]}
          />
          <FilterSelect
            label="Party"
            value={partyFilter}
            onChange={setPartyFilter}
            options={[
              { value: "all", label: "All" },
              ...store.parties.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All" },
              { value: "classified", label: "Classified" },
              { value: "unclassified", label: "Unclassified" },
              { value: "reconciled", label: "Reconciled" },
              { value: "deleted", label: "Deleted" },
            ]}
          />
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Min amount</p>
            <Input
              inputMode="decimal"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Max amount</p>
            <Input
              inputMode="decimal"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              Search particulars / reference
            </p>
            <Input
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing {filtered.length} of {rowsWithBalance.length} entries
          </p>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <Table className="min-w-[1180px]">
            <TableHeader>
              <TableRow className="bg-muted/60">
                <TableHead>Date</TableHead>
                <TableHead>{isBank ? "Bank" : "Location"}</TableHead>
                <TableHead className="min-w-[220px]">Particulars</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">{isBank ? "Credit" : "Cash In"}</TableHead>
                <TableHead className="text-right">{isBank ? "Debit" : "Cash Out"}</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-14 text-center">
                    <p className="font-medium text-foreground">
                      No transactions match your filters
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Adjust the date range or filters, or add a new entry.
                    </p>
                    <Button className="mt-4" onClick={() => shell.openEntry({ sourceType })}>
                      <Plus className="size-4" /> Add entry
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => {
                  const acc = accounts.find((a) => a.id === t.accountId);
                  const accName = acc
                    ? "bankName" in acc
                      ? `${acc.bankName} ••${acc.last4}`
                      : (acc as { name: string }).name
                    : "—";
                  return (
                    <TableRow key={t.id} className={t.voided ? "opacity-60" : undefined}>
                      <TableCell className="whitespace-nowrap">{formatDate(t.date)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{accName}</TableCell>
                      <TableCell className="max-w-[280px]">
                        <p className="truncate text-sm text-foreground" title={t.particulars}>
                          {t.particulars}
                        </p>
                        <p className="text-xs text-muted-foreground">{t.code}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {partyName(store.parties, t.partyId)}
                      </TableCell>
                      <TableCell>
                        <CategoryBadge id={t.category} />
                      </TableCell>
                      <TableCell className="num whitespace-nowrap text-right font-medium text-pos">
                        {t.direction === "in" ? formatMoney(t.amount) : "—"}
                      </TableCell>
                      <TableCell className="num whitespace-nowrap text-right font-medium text-neg">
                        {t.direction === "out" ? formatMoney(t.amount) : "—"}
                      </TableCell>
                      <TableCell className="num whitespace-nowrap text-right font-semibold">
                        {formatMoney(t.balance)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {t.reference ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge t={t} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <IconAction label="View" onClick={() => setViewing(t)}>
                            <Eye className="size-4" />
                          </IconAction>
                          <IconAction
                            label="Edit"
                            onClick={() => shell.openEntry({ sourceType, editing: t })}
                          >
                            <Pencil className="size-4" />
                          </IconAction>
                          <IconAction label="Duplicate" onClick={() => store.duplicateEntry(t.id)}>
                            <Copy className="size-4" />
                          </IconAction>
                          {t.voided ? (
                            <IconAction label="Restore" onClick={() => store.restoreEntry(t.id)}>
                              <RotateCcw className="size-4" />
                            </IconAction>
                          ) : (
                            <IconAction label="Void" onClick={() => setVoidTarget(t)}>
                              <Ban className="size-4" />
                            </IconAction>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-navy">Transaction {viewing?.code}</DialogTitle>
            <DialogDescription>Full detail of this ledger entry.</DialogDescription>
          </DialogHeader>
          {viewing ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Date" value={formatDate(viewing.date)} />
              <Detail label="Amount" value={formatMoney(viewing.amount)} />
              <Detail
                label="Direction"
                value={viewing.direction === "in" ? "Money In" : "Money Out"}
              />
              <Detail label="Party" value={partyName(store.parties, viewing.partyId)} />
              <Detail label="Reference" value={viewing.reference ?? "—"} />
              <Detail label="Payment method" value={viewing.paymentMethod ?? "—"} />
              <Detail label="Attachment" value={viewing.attachmentName ?? "—"} />
              <Detail label="Status" value={statusOf(viewing)} />
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Particulars</dt>
                <dd className="text-foreground">{viewing.particulars}</dd>
              </div>
              {viewing.allocations?.length ? (
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Allocations</dt>
                  <dd className="num text-foreground">
                    {viewing.allocations
                      .map((a) => {
                        const inv =
                          store.salesInvoices.find((i) => i.id === a.invoiceId) ??
                          store.purchaseBills.find((i) => i.id === a.invoiceId);
                        return `${inv?.number ?? a.invoiceId}: ${formatMoney(a.amount)}`;
                      })
                      .join(", ")}
                  </dd>
                </div>
              ) : null}
              {viewing.advanceAmount ? (
                <Detail label="Stored as advance" value={formatMoney(viewing.advanceAmount)} />
              ) : null}
              {viewing.notes ? <Detail label="Notes" value={viewing.notes} /> : null}
            </dl>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => viewing && store.toggleReconciled(viewing.id)}
              disabled={!viewing || viewing.voided}
            >
              {viewing?.reconciled ? "Mark unreconciled" : "Mark reconciled"}
            </Button>
            <Button onClick={() => setViewing(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!voidTarget} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-navy">Delete this entry?</DialogTitle>
            <DialogDescription>
              Deleted entries are removed from all balances, reports and totals. Linked transfer
              entries are deleted together.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVoidTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (voidTarget) store.voidEntry(voidTarget.id);
                setVoidTarget(null);
              }}
            >
              Void entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num text-foreground">{value}</dd>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} title={label} aria-label={label}>
      {children}
      <span className="sr-only">{label}</span>
    </Button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
