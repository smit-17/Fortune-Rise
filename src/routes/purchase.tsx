import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Download,
  FileText,
  HandCoins,
  Plus,
  Search,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, formatMoney, todayISO } from "@/lib/lepdo/format";
import { useLepdo } from "@/lib/lepdo/store";
import { PRESETS, periodLabel, rangeFor, type Preset } from "@/lib/lepdo/period";
import {
  FilterBar,
  inAmountRange,
  sortRows,
  type SelectFilterDef,
  type SortId,
} from "@/components/lepdo/FilterBar";
import { useShell } from "@/components/lepdo/shell-context";
import {
  brokerGroups,
  buildPurchaseModel,
  matchBill,
  supplierLedgerRows,
  type BillView,
} from "@/lib/lepdo/purchase";
import {
  downloadBillPdf,
  downloadPurchaseExcel,
  downloadPurchasePdf,
  type PurchaseReportKind,
} from "@/lib/lepdo/purchaseReport";
import { PurchaseForm } from "@/components/lepdo/purchase/PurchaseForm";
import { SupplierForm } from "@/components/lepdo/purchase/SupplierForm";
import { SupplierPaymentForm } from "@/components/lepdo/purchase/SupplierPaymentForm";
import { AdvanceForm } from "@/components/lepdo/purchase/AdvanceForm";
import { AdvanceAdjustForm } from "@/components/lepdo/purchase/AdvanceAdjustForm";
import { Panel, Stat, StatusChip } from "@/components/lepdo/sales/ui";

export const Route = createFileRoute("/purchase")({
  head: () => ({
    meta: [
      { title: "Purchase — LEPDO Accounting" },
      {
        name: "description",
        content:
          "LEPDO purchase dashboard with diamond invoices, jewelry making bills, supplier payables, broker views and CA-ready reports.",
      },
      { property: "og:title", content: "Purchase — LEPDO Accounting" },
      {
        property: "og:description",
        content:
          "Track purchase bills, payments made, pending payables, supplier advances and broker performance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PurchasePage,
});

type Tab = "dashboard" | "bills" | "suppliers" | "advances" | "brokers";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Purchase Dashboard" },
  { id: "bills", label: "Invoice-Wise" },
  { id: "suppliers", label: "Supplier-Wise" },
  { id: "advances", label: "Advance Payment" },
  { id: "brokers", label: "Broker-Wise" },
];

function PurchasePage() {
  const store = useLepdo();
  const shell = useShell();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [paySupplier, setPaySupplier] = useState<string | null>(null);
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [supplierEditId, setSupplierEditId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceSupplier, setAdvanceSupplier] = useState<string | null>(null);
  const [adjustId, setAdjustId] = useState<string | null>(null);

  /* ---- Invoice-Wise sort & filter state (kept while records open/close) ---- */
  const today = todayISO();
  const [billSort, setBillSort] = useState<SortId>("date_desc");
  const [billPreset, setBillPreset] = useState("header");
  const [billFrom, setBillFrom] = useState(today);
  const [billTo, setBillTo] = useState(today);
  const [billSearch, setBillSearch] = useState("");
  const [billMin, setBillMin] = useState("");
  const [billMax, setBillMax] = useState("");
  const [billFilters, setBillFilters] = useState<Record<string, string>>({
    supplier: "all",
    broker: "all",
    kind: "all",
    status: "all",
  });

  useEffect(() => {
    shell.setPageAction({
      label: "Add Purchase",
      run: () => {
        setEditId(null);
        setFormOpen(true);
      },
    });
    return () => shell.setPageAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const model = useMemo(
    () =>
      buildPurchaseModel({
        bills: store.purchaseBills,
        transactions: store.transactions,
        parties: store.parties,
        banks: store.bankAccounts,
        cash: store.cashLocations,
      }),
    [
      store.purchaseBills,
      store.transactions,
      store.parties,
      store.bankAccounts,
      store.cashLocations,
    ],
  );

  const inPeriod = useMemo(
    () => model.bills.filter((v) => v.bill.date >= shell.from && v.bill.date <= shell.to),
    [model.bills, shell.from, shell.to],
  );

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => inPeriod.filter((v) => matchBill(v, q)), [inPeriod, q]);
  const suppliers = useMemo(
    () =>
      q
        ? model.suppliers.filter(
            (s) => s.party.name.toLowerCase().includes(q) || s.bills.some((b) => matchBill(b, q)),
          )
        : model.suppliers,
    [model.suppliers, q],
  );
  const brokers = useMemo(() => brokerGroups(rows), [rows]);
  const recentBills = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const aAdded = a.bill.createdAt ?? a.bill.updatedAt ?? a.bill.date;
        const bAdded = b.bill.createdAt ?? b.bill.updatedAt ?? b.bill.date;
        return bAdded.localeCompare(aAdded) || b.bill.number.localeCompare(a.bill.number);
      }),
    [rows],
  );
  const outstandingSuppliers = useMemo(
    () =>
      suppliers
        .filter((supplier) => supplier.pending > 0)
        .sort((a, b) => {
          const latestAdded = (bills: BillView[]) =>
            bills.reduce((latest, view) => {
              const added = view.bill.createdAt ?? view.bill.updatedAt ?? view.bill.date;
              return added > latest ? added : latest;
            }, "");
          return latestAdded(b.bills).localeCompare(latestAdded(a.bills));
        }),
    [suppliers],
  );

  /* ---------------------- Invoice-Wise filtered + sorted --------------------- */
  const [bFrom, bTo] = useMemo(() => {
    if (billPreset === "header") return [shell.from, shell.to] as const;
    return rangeFor(billPreset as Preset, today, billFrom, billTo);
  }, [billPreset, shell.from, shell.to, today, billFrom, billTo]);

  const supplierOptions = useMemo(
    () => [
      { value: "all", label: "All suppliers" },
      ...model.suppliers.map((s) => ({ value: s.party.id, label: s.party.name })),
    ],
    [model.suppliers],
  );

  const brokerOptions = useMemo(() => {
    const names = new Set<string>(store.brokers.map((b) => b.name));
    for (const v of model.bills) if (v.bill.brokerName?.trim()) names.add(v.bill.brokerName.trim());
    return [
      { value: "all", label: "All brokers" },
      ...[...names].sort().map((n) => ({ value: n, label: n })),
      { value: "__none", label: "No broker" },
    ];
  }, [store.brokers, model.bills]);

  const billRows = useMemo(() => {
    const bq = billSearch.trim().toLowerCase();
    const list = model.bills.filter((v) => {
      if (v.bill.date < bFrom || v.bill.date > bTo) return false;
      if (billFilters["supplier"] !== "all" && v.bill.partyId !== billFilters["supplier"])
        return false;
      if (billFilters["broker"] !== "all") {
        const name = v.bill.brokerName?.trim() ?? "";
        if (billFilters["broker"] === "__none" ? !!name : name !== billFilters["broker"])
          return false;
      }
      if (billFilters["kind"] !== "all" && (v.bill.billKind ?? "diamond") !== billFilters["kind"])
        return false;
      if (billFilters["status"] !== "all" && v.status !== billFilters["status"]) return false;
      if (!inAmountRange(v.bill.total, billMin, billMax)) return false;
      if (bq) {
        const hay =
          `${v.bill.number} ${v.bill.supplierInvoiceNumber ?? ""} ${v.supplier?.name ?? ""}`.toLowerCase();
        if (!hay.includes(bq)) return false;
      }
      return true;
    });
    return sortRows(list, billSort, {
      date: (v) => v.bill.date,
      number: (v) => v.bill.number,
      amount: (v) => v.bill.total,
      updated: (v) => v.bill.updatedAt ?? v.bill.date,
    });
  }, [model.bills, bFrom, bTo, billFilters, billMin, billMax, billSearch, billSort]);

  function clearBillFilters() {
    setBillFilters({ supplier: "all", broker: "all", kind: "all", status: "all" });
    setBillMin("");
    setBillMax("");
    setBillSearch("");
  }

  const billDateOptions = useMemo(
    () => [
      { value: "header", label: `Header: ${periodLabel(shell.preset)}` },
      ...PRESETS.map((p) => ({ value: p.id, label: p.label })),
    ],
    [shell.preset],
  );

  const billFilterDefs: SelectFilterDef[] = useMemo(
    () => [
      { id: "supplier", label: "Supplier", options: supplierOptions },
      { id: "broker", label: "Broker", options: brokerOptions },
      {
        id: "kind",
        label: "Purchase type",
        options: [
          { value: "all", label: "All types" },
          { value: "diamond", label: "Diamond Purchase" },
          { value: "jewelry_making", label: "Jewelry Making" },
        ],
      },
      {
        id: "status",
        label: "Payment status",
        options: [
          { value: "all", label: "All statuses" },
          { value: "paid", label: "Paid" },
          { value: "part", label: "Part-Paid" },
          { value: "pending", label: "Pending" },
          { value: "overdue", label: "Overdue" },
        ],
      },
    ],
    [supplierOptions, brokerOptions],
  );

  const totals = {
    purchases: rows.reduce((s, v) => s + v.bill.total, 0),
    paid: rows.reduce((s, v) => s + v.paid, 0),
    pending: rows.reduce((s, v) => s + v.pending, 0),
    advance: model.totals.advance,
    suppliers: new Set(rows.map((v) => v.bill.partyId)).size,
    paidBills: rows.filter((v) => v.status === "paid").length,
    partBills: rows.filter((v) => v.status === "part").length,
    pendingBills: rows.filter((v) => v.status === "pending" || v.status === "overdue").length,
  };

  const label = periodLabel(shell.preset);

  function report(kind: PurchaseReportKind["kind"], format: "excel" | "pdf") {
    const payload: PurchaseReportKind =
      kind === "summary"
        ? { kind: "summary", bills: rows, suppliers }
        : kind === "register"
          ? { kind: "register", bills: rows }
          : { kind: "payable", suppliers };
    if (format === "excel") {
      downloadPurchaseExcel(payload, label);
      toast.success("Excel report downloaded.");
      return;
    }
    if (!downloadPurchasePdf(payload, label))
      toast.error("Allow pop-ups for this site to open the PDF print view.");
  }

  /** Download the currently filtered Invoice-Wise list. */
  function reportRows(list: BillView[], format: "excel" | "pdf") {
    const payload: PurchaseReportKind = { kind: "register", bills: list };
    if (format === "excel") {
      downloadPurchaseExcel(payload, label);
      toast.success("Excel report downloaded.");
      return;
    }
    if (!downloadPurchasePdf(payload, label))
      toast.error("Allow pop-ups for this site to open the PDF print view.");
  }

  return (
    <div className="space-y-4">
      {/* header */}
      <header className="space-y-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-navy sm:text-xl">Purchase</h1>
          <p className="truncate text-xs text-muted-foreground">
            {label} · {rows.length} bill{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 w-full pl-8"
            placeholder="Search purchases"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Button
            size="sm"
            onClick={() => {
              setEditId(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add Purchase
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPaySupplier(null);
              setPayOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add Payment
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="col-span-2 sm:col-span-1">
                <Download className="mr-1 h-4 w-4" /> Report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Excel</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => report("summary", "excel")}>
                Purchase summary
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => report("register", "excel")}>
                Purchase register
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => report("payable", "excel")}>
                Supplier payable
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>PDF</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => report("summary", "pdf")}>
                Purchase summary
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => report("register", "pdf")}>
                Purchase register
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => report("payable", "pdf")}>
                Supplier payable
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:flex sm:h-9 sm:w-auto sm:flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="text-xs sm:text-sm">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* dashboard */}
        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Stat
              label="Total Purchases"
              value={formatMoney(totals.purchases)}
              tone="purchase"
              hint={label}
              icon={<ShoppingCart className="h-4 w-4 opacity-70" />}
            />
            <Stat
              label="Total Paid"
              value={formatMoney(totals.paid)}
              tone="paid"
              icon={<Wallet className="h-4 w-4 opacity-70" />}
            />
            <Stat
              label="Total Pending"
              value={formatMoney(totals.pending)}
              tone="pending"
              icon={<FileText className="h-4 w-4 opacity-70" />}
            />
            <Stat
              label="Total Advance"
              value={formatMoney(totals.advance)}
              tone="advance"
              hint="All time"
              icon={<HandCoins className="h-4 w-4 opacity-70" />}
            />
            <Stat
              label="Total Suppliers"
              value={String(totals.suppliers)}
              tone="supplier"
              icon={<Users className="h-4 w-4 opacity-70" />}
            />
            <Stat label="Paid Bills" value={String(totals.paidBills)} tone="paid" />
            <Stat label="Part-Paid Bills" value={String(totals.partBills)} tone="part" />
            <Stat label="Pending Bills" value={String(totals.pendingBills)} tone="pending" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Recent bills">
              <div className="max-h-[28rem] space-y-2 overflow-y-auto overscroll-contain pr-1">
                {recentBills.map((v) => (
                  <button
                    key={v.bill.id}
                    type="button"
                    onClick={() => {
                      setEditId(v.bill.id);
                      setFormOpen(true);
                    }}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border p-2 text-left hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy">
                        {v.bill.number} · {v.supplier?.name ?? "—"}
                      </p>
                      <p className="num truncate text-[11px] text-muted-foreground">
                        {formatDate(v.bill.date)} · Pending {formatMoney(v.pending)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="num text-sm font-semibold text-navy">
                        {formatMoney(v.bill.total)}
                      </span>
                      <StatusChip status={v.status} />
                    </div>
                  </button>
                ))}
                {!rows.length ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    No purchase bills for this period.
                  </p>
                ) : null}
              </div>
            </Panel>

            <Panel title="Supplier outstanding">
              <div className="max-h-[28rem] space-y-2 overflow-y-auto overscroll-contain pr-1">
                {outstandingSuppliers.map((s) => (
                    <div
                      key={s.party.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border p-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy">{s.party.name}</p>
                        <p className="num truncate text-[11px] text-muted-foreground">
                          {s.billCount} bill{s.billCount === 1 ? "" : "s"} · Advance{" "}
                          {formatMoney(s.advance)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="num text-sm font-semibold text-sl-pending">
                          {formatMoney(s.pending)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPaySupplier(s.party.id);
                            setPayOpen(true);
                          }}
                        >
                          Pay
                        </Button>
                      </div>
                    </div>
                  ))}
                {!outstandingSuppliers.length ? (
                  <p className="p-3 text-sm text-muted-foreground">No pending supplier payables.</p>
                ) : null}
              </div>
            </Panel>
          </div>
        </TabsContent>

        {/* invoice-wise */}
        <TabsContent value="bills" className="mt-4 space-y-3">
          <FilterBar
            datePreset={billPreset}
            dateOptions={billDateOptions}
            onDatePreset={setBillPreset}
            customFrom={billFrom}
            customTo={billTo}
            onCustomFrom={setBillFrom}
            onCustomTo={setBillTo}
            search={billSearch}
            onSearch={setBillSearch}
            searchPlaceholder="Search bill number or supplier invoice"
            sort={billSort}
            onSort={setBillSort}
            filters={billFilterDefs}
            values={billFilters}
            onFilterChange={(id, value) => setBillFilters((f) => ({ ...f, [id]: value }))}
            amountMin={billMin}
            amountMax={billMax}
            onAmountMin={setBillMin}
            onAmountMax={setBillMax}
            onClearAll={clearBillFilters}
            right={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-9">
                    <Download className="mr-1 h-4 w-4" /> Download Filtered Report
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => reportRows(billRows, "excel")}>
                    Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => reportRows(billRows, "pdf")}>
                    PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
          <Panel title={`Purchase bills · ${billRows.length}`}>
            <div className="max-h-[calc(100dvh-19rem)] min-h-0 space-y-2 overflow-y-auto overscroll-contain pr-1">
              {billRows.map((v) => (
                <BillRow
                  key={v.bill.id}
                  view={v}
                  onEdit={() => {
                    setEditId(v.bill.id);
                    setFormOpen(true);
                  }}
                  onPay={() => {
                    setPaySupplier(v.bill.partyId);
                    setPayOpen(true);
                  }}
                  onPdf={() => {
                    if (!downloadBillPdf(v.bill, v.supplier?.name ?? "Supplier"))
                      toast.error("Allow pop-ups for this site to open the PDF print view.");
                  }}
                  onVoid={() => {
                    store.voidPurchaseBill(v.bill.id);
                    toast.success(`${v.bill.number} deleted.`);
                  }}
                />
              ))}
              {!billRows.length ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No purchase bills match the current filters.
                </p>
              ) : null}
            </div>
          </Panel>
        </TabsContent>

        {/* supplier-wise */}
        <TabsContent value="suppliers" className="mt-4">
          <Panel
            title="Supplier summary"
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSupplierEditId(null);
                  setSupplierFormOpen(true);
                }}
              >
                <Plus className="mr-1 h-4 w-4" /> Add Supplier
              </Button>
            }
          >
            <div className="space-y-2">
              {suppliers.map((s) => {
                const open = expanded === s.party.id;
                return (
                  <div key={s.party.id} className="rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : s.party.id)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-3 text-left hover:bg-muted"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-navy">{s.party.name}</p>
                        <p className="num truncate text-[11px] text-muted-foreground">
                          {s.billCount} bill{s.billCount === 1 ? "" : "s"} · Purchases{" "}
                          {formatMoney(s.totalPurchases)} · Paid {formatMoney(s.paid)} · Advance{" "}
                          {formatMoney(s.advance)}
                        </p>
                      </div>
                      <span className="num shrink-0 text-sm font-semibold text-sl-pending">
                        {formatMoney(s.pending)}
                      </span>
                    </button>
                    {open ? (
                      <div className="border-t border-border p-2">
                        <div className="mb-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSupplierEditId(s.party.id);
                              setSupplierFormOpen(true);
                            }}
                          >
                            Edit supplier
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setPaySupplier(s.party.id);
                              setPayOpen(true);
                            }}
                          >
                            Add payment
                          </Button>
                        </div>
                        <div className="space-y-1.5">
                          {supplierLedgerRows(s, model.payments).map((r) => (
                            <div
                              key={r.id}
                              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-navy">
                                  {r.type} · {r.reference}
                                </p>
                                <p className="num truncate text-[11px] text-muted-foreground">
                                  {formatDate(r.date)} · {r.particulars}
                                </p>
                              </div>
                              <span className="num shrink-0 text-xs text-navy">
                                {r.credit > 0
                                  ? `+${formatMoney(r.credit)}`
                                  : `−${formatMoney(r.debit)}`}{" "}
                                · {formatMoney(r.balance)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!suppliers.length ? (
                <p className="p-3 text-sm text-muted-foreground">No suppliers yet.</p>
              ) : null}
            </div>
          </Panel>
        </TabsContent>

        {/* advance payment */}
        <TabsContent value="advances" className="mt-4 space-y-3">
          <Panel
            title={`Advance payments (${model.payments.filter((p) => p.advance > 0).length})`}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAdvanceSupplier(null);
                  setAdvanceOpen(true);
                }}
              >
                <Plus className="mr-1 h-4 w-4" /> Add Advance
              </Button>
            }
          >
            <div className="space-y-2">
              {model.payments
                .filter((p) => p.advance > 0)
                .map((p) => (
                  <div
                    key={p.id}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy">
                        {store.parties.find((x) => x.id === p.partyId)?.name ?? "Unknown supplier"}
                      </p>
                      <p className="num truncate text-[11px] text-muted-foreground">
                        {formatDate(p.date)} · {p.account} · Ref {p.reference} · Paid{" "}
                        {formatMoney(p.amount)} · Adjusted {formatMoney(p.allocated)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span className="num rounded-md bg-sl-advance-bg px-2 py-1 text-xs font-semibold text-sl-advance">
                        Advance {formatMoney(p.advance)}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => setAdjustId(p.id)}>
                        Adjust to bill
                      </Button>
                    </div>
                  </div>
                ))}
              {!model.payments.some((p) => p.advance > 0) ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No unadjusted supplier advances.
                </p>
              ) : null}
            </div>
          </Panel>
        </TabsContent>

        {/* broker-wise */}
        <TabsContent value="brokers" className="mt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {brokers.map((b) => (
              <div key={b.key} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <p className="truncate text-sm font-semibold text-navy">{b.label}</p>
                  <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <p className="num mt-2 text-lg font-semibold text-pu-total">
                  {formatMoney(b.purchases)}
                </p>
                <div className="num mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
                  <span>Bills {b.count}</span>
                  <span>Suppliers {b.suppliers}</span>
                  <span>Paid {formatMoney(b.paid)}</span>
                  <span>Pending {formatMoney(b.pending)}</span>
                  <span className="col-span-2">Avg bill {formatMoney(b.average)}</span>
                </div>
              </div>
            ))}
            {!brokers.length ? (
              <p className="p-3 text-sm text-muted-foreground">
                No purchase bills for this period.
              </p>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>

      <PurchaseForm
        open={formOpen}
        billId={editId}
        onClose={() => setFormOpen(false)}
        onAddSupplier={() => {
          setSupplierEditId(null);
          setSupplierFormOpen(true);
        }}
        onEditSupplier={(id) => {
          setSupplierEditId(id);
          setSupplierFormOpen(true);
        }}
      />
      <SupplierForm
        open={supplierFormOpen}
        supplierId={supplierEditId}
        onClose={() => setSupplierFormOpen(false)}
      />
      <SupplierPaymentForm
        open={payOpen}
        presetSupplierId={paySupplier}
        onClose={() => setPayOpen(false)}
      />
      <AdvanceForm
        open={advanceOpen}
        presetSupplierId={advanceSupplier}
        onClose={() => setAdvanceOpen(false)}
      />
      <AdvanceAdjustForm
        open={adjustId !== null}
        paymentId={adjustId}
        onClose={() => setAdjustId(null)}
      />
    </div>
  );
}

function BillRow({
  view,
  onEdit,
  onPay,
  onPdf,
  onVoid,
}: {
  view: BillView;
  onEdit: () => void;
  onPay: () => void;
  onPdf: () => void;
  onVoid: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold text-navy">
        <span className="break-words">{view.bill.number}</span>
        <span className="text-muted-foreground"> · </span>
        <span className="break-words">{view.supplier?.name ?? "—"}</span>
      </p>
      <p className="text-[11px] text-muted-foreground">
        {formatDate(view.bill.date)}
        {view.bill.dueDate ? ` · Due ${formatDate(view.bill.dueDate)}` : ""} ·{" "}
        {view.bill.billKind === "jewelry_making" ? "Jewelry Making" : "Diamond"}
        {view.bill.purchaseType ? ` · ${view.bill.purchaseType}` : ""}
        {view.bill.brokerName ? ` · Broker ${view.bill.brokerName}` : ""}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="num flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>
            Total <b className="font-semibold text-navy">{formatMoney(view.bill.total)}</b>
          </span>
          <span>
            Paid <b className="font-semibold text-sl-paid">{formatMoney(view.paid)}</b>
          </span>
          <span>
            Pending <b className="font-semibold text-sl-pending">{formatMoney(view.pending)}</b>
          </span>
        </div>
        <StatusChip status={view.status} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={onPay}>
          Pay
        </Button>
        <Button size="sm" variant="ghost" onClick={onPdf}>
          PDF
        </Button>
        <Button size="sm" variant="ghost" className="text-neg" onClick={onVoid}>
          Delete
        </Button>
      </div>
    </div>
  );
}
