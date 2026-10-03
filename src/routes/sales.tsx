import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Download,
  FileText,
  IndianRupee,
  Plus,
  Receipt,
  Search,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { formatDate, formatDateTime, formatMoney, round2, todayISO } from "@/lib/lepdo/format";
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
  STATUS_CLASS,
  STATUS_LABEL,
  buildSalesModel,
  customerLedger,
  matchInvoice,
  platformGroups,
  sellerGroups,
  type CustomerView,
  type GroupView,
  type InvoiceView,
} from "@/lib/lepdo/sales";
import {
  downloadSalesExcel,
  downloadSalesPdf,
  type SalesReportKind,
} from "@/lib/lepdo/salesReport";
import { InvoicePdfDialog } from "@/components/lepdo/sales/InvoicePdfDialog";

import { SaleForm } from "@/components/lepdo/sales/SaleForm";
import { PaymentForm } from "@/components/lepdo/sales/PaymentForm";
import { CustomerForm } from "@/components/lepdo/sales/CustomerForm";
import { FormField, MODAL_CLASS, Panel, Row, Stat, StatusChip } from "@/components/lepdo/sales/ui";

export const Route = createFileRoute("/sales")({
  head: () => ({
    meta: [
      { title: "Sales — LEPDO Accounting" },
      {
        name: "description",
        content:
          "LEPDO sales dashboard with invoice, customer, seller and platform views, payment allocation and CA-ready Excel and PDF reports.",
      },
      { property: "og:title", content: "Sales — LEPDO Accounting" },
      {
        property: "og:description",
        content:
          "Track sales invoices, received and pending amounts, customer advances, seller and platform performance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SalesPage,
});

type Tab = "dashboard" | "invoices" | "customers" | "sellers" | "platforms";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Sales Dashboard" },
  { id: "invoices", label: "Invoice-Wise" },
  { id: "customers", label: "Customer-Wise" },
  { id: "sellers", label: "Seller-Wise" },
  { id: "platforms", label: "Platform-Wise" },
];

function SalesPage() {
  const store = useLepdo();
  const shell = useShell();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [pdfInvoiceId, setPdfInvoiceId] = useState<string | null>(null);

  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [group, setGroup] = useState<{ title: string; rows: InvoiceView[] } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  /* ---- Invoice-Wise sort & filter state ---- */
  const today = todayISO();
  const [invSort, setInvSort] = useState<SortId>("date_desc");
  const [invPreset, setInvPreset] = useState("header");
  const [invFrom, setInvFrom] = useState(today);
  const [invTo, setInvTo] = useState(today);
  const [invSearch, setInvSearch] = useState("");
  const [invMin, setInvMin] = useState("");
  const [invMax, setInvMax] = useState("");
  const [invFilters, setInvFilters] = useState<Record<string, string>>({
    customer: "all",
    seller: "all",
    platform: "all",
    saleType: "all",
    status: "all",
  });

  useEffect(() => {
    setUpdatedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    shell.setPageAction({
      label: "Add Sale",
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
      buildSalesModel({
        invoices: store.salesInvoices,
        transactions: store.transactions,
        parties: store.parties,
        banks: store.bankAccounts,
        cash: store.cashLocations,
        asOf: shell.to,
      }),
    [
      store.salesInvoices,
      store.transactions,
      store.parties,
      store.bankAccounts,
      store.cashLocations,
      shell.to,
    ],
  );

  const periodInvoices = useMemo(
    () => model.invoices.filter((v) => v.invoice.date >= shell.from && v.invoice.date <= shell.to),
    [model, shell.from, shell.to],
  );

  const q = search.trim().toLowerCase();
  const filteredInvoices = useMemo(
    () => periodInvoices.filter((v) => matchInvoice(v, q)),
    [periodInvoices, q],
  );

  const customers = useMemo(() => {
    const allowed = new Set(filteredInvoices.map((v) => v.invoice.partyId));
    return model.customers.filter((c) =>
      !q ? true : allowed.has(c.party.id) || c.party.name.toLowerCase().includes(q),
    );
  }, [model.customers, filteredInvoices, q]);

  const sellers = useMemo(() => sellerGroups(filteredInvoices), [filteredInvoices]);
  const platforms = useMemo(() => platformGroups(filteredInvoices), [filteredInvoices]);

  const totals = {
    sales: round2(filteredInvoices.reduce((s, v) => s + v.invoice.total, 0)),
    received: round2(filteredInvoices.reduce((s, v) => s + v.received, 0)),
    pending: round2(filteredInvoices.reduce((s, v) => s + v.pending, 0)),
    paid: filteredInvoices.filter((v) => v.status === "paid").length,
    part: filteredInvoices.filter((v) => v.status === "part").length,
    pendingCount: filteredInvoices.filter((v) => v.status === "pending").length,
    overdue: filteredInvoices.filter((v) => v.status === "overdue").length,
  };

  /* ------------------- Invoice-Wise: filtered + sorted rows ------------------ */
  const [iFrom, iTo] = useMemo(() => {
    if (invPreset === "header") return [shell.from, shell.to] as const;
    return rangeFor(invPreset as Preset, today, invFrom, invTo);
  }, [invPreset, shell.from, shell.to, today, invFrom, invTo]);

  const uniqValues = (list: (string | undefined)[]) =>
    [...new Set(list.map((v) => v?.trim()).filter((v): v is string => !!v))].sort();

  const invFilterDefs: SelectFilterDef[] = useMemo(
    () => [
      {
        id: "customer",
        label: "Customer",
        options: [
          { value: "all", label: "All customers" },
          ...model.customers.map((c) => ({ value: c.party.id, label: c.party.name })),
        ],
      },
      {
        id: "seller",
        label: "Seller",
        options: [
          { value: "all", label: "All sellers" },
          ...uniqValues(model.invoices.map((v) => v.invoice.sellerName)).map((n) => ({
            value: n,
            label: n,
          })),
          { value: "__none", label: "No seller" },
        ],
      },
      {
        id: "platform",
        label: "Platform",
        options: [
          { value: "all", label: "All platforms" },
          ...uniqValues(model.invoices.map((v) => v.invoice.platform)).map((n) => ({
            value: n,
            label: n,
          })),
        ],
      },
      {
        id: "saleType",
        label: "Sale type",
        options: [
          { value: "all", label: "All sale types" },
          ...uniqValues(model.invoices.map((v) => v.invoice.saleType)).map((n) => ({
            value: n,
            label: n.toUpperCase(),
          })),
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
    [model.customers, model.invoices],
  );

  const invoiceRows = useMemo(() => {
    const iq = invSearch.trim().toLowerCase();
    const list = model.invoices.filter((v) => {
      const inv = v.invoice;
      if (inv.date < iFrom || inv.date > iTo) return false;
      if (invFilters["customer"] !== "all" && inv.partyId !== invFilters["customer"]) return false;
      if (invFilters["seller"] !== "all") {
        const name = inv.sellerName?.trim() ?? "";
        if (invFilters["seller"] === "__none" ? !!name : name !== invFilters["seller"])
          return false;
      }
      if (
        invFilters["platform"] !== "all" &&
        (inv.platform?.trim() ?? "") !== invFilters["platform"]
      )
        return false;
      if (invFilters["saleType"] !== "all" && (inv.saleType ?? "") !== invFilters["saleType"])
        return false;
      if (invFilters["status"] !== "all" && v.status !== invFilters["status"]) return false;
      if (!inAmountRange(inv.total, invMin, invMax)) return false;
      if (iq && !matchInvoice(v, iq)) return false;
      return true;
    });
    return sortRows(list, invSort, {
      date: (v) => v.invoice.date,
      number: (v) => v.invoice.number,
      amount: (v) => v.invoice.total,
      updated: (v) => v.invoice.updatedAt ?? v.invoice.date,
    });
  }, [model.invoices, iFrom, iTo, invFilters, invMin, invMax, invSearch, invSort]);

  function clearInvFilters() {
    setInvFilters({
      customer: "all",
      seller: "all",
      platform: "all",
      saleType: "all",
      status: "all",
    });
    setInvMin("");
    setInvMax("");
    setInvSearch("");
  }

  const invDateOptions = useMemo(
    () => [
      { value: "header", label: `Header: ${periodLabel(shell.preset)}` },
      ...PRESETS.map((p) => ({ value: p.id, label: p.label })),
    ],
    [shell.preset],
  );

  const SALE_TYPE_META: { id: string; label: string }[] = [
    { id: "ue", label: "UE" },
    { id: "ui", label: "UI" },
    { id: "gst_inr", label: "GST INR" },
    { id: "export", label: "Export" },
  ];
  const saleTypeCards = useMemo(
    () =>
      SALE_TYPE_META.map((t) => {
        const list = filteredInvoices.filter((v) => v.invoice.saleType === t.id);
        return {
          ...t,
          count: list.length,
          total: round2(list.reduce((s, v) => s + v.invoice.total, 0)),
          received: round2(list.reduce((s, v) => s + v.received, 0)),
          pending: round2(list.reduce((s, v) => s + v.pending, 0)),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredInvoices],
  );

  const label = periodLabel(shell.preset);
  const openInvoice = openInvoiceId ? model.byId.get(openInvoiceId) : undefined;
  const pdfInvoice = pdfInvoiceId ? model.byId.get(pdfInvoiceId) : undefined;

  const openCustomer = openCustomerId
    ? model.customers.find((c) => c.party.id === openCustomerId)
    : undefined;

  function report(kind: SalesReportKind["kind"], as: "excel" | "pdf") {
    const payload: SalesReportKind =
      kind === "summary"
        ? { kind: "summary", invoices: filteredInvoices, customers }
        : kind === "register"
          ? { kind: "register", invoices: filteredInvoices }
          : { kind: "outstanding", customers };
    if (as === "excel") {
      downloadSalesExcel(payload, label);
      toast.success("Excel report downloaded.");
      return;
    }
    if (!downloadSalesPdf(payload, label)) toast.error("Allow pop-ups to print the PDF report.");
  }

  return (
    <div className="w-full max-w-full space-y-4 overflow-x-hidden">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-navy lg:text-xl">Sales</h1>
        <p className="truncate text-xs text-muted-foreground">
          {label} · Updated {updatedAt ? formatDateTime(updatedAt) : "—"}
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-card p-2">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 w-full pl-9"
            placeholder="Search date, invoice, customer, seller, platform, amount, status, UTR"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Button
            className="h-9"
            onClick={() => {
              setEditId(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Add Sale
          </Button>
          <Button
            className="h-9"
            variant="outline"
            onClick={() => {
              setPaymentCustomer(null);
              setPaymentOpen(true);
            }}
          >
            <Plus className="size-4" /> Add Payment
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="col-span-2 h-9 sm:col-span-1">
                <Download className="size-4" /> Download Report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Sales summary</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => report("summary", "excel")}>
                Excel (.xls)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => report("summary", "pdf")}>PDF</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Invoice register</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => report("register", "excel")}>
                Excel (.xls)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => report("register", "pdf")}>PDF</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Customer outstanding</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => report("outstanding", "excel")}>
                Excel (.xls)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => report("outstanding", "pdf")}>PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 sm:mx-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-navy text-navy-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat
              label="Total Sales"
              value={formatMoney(totals.sales)}
              tone="total"
              icon={<TrendingUp className="size-4" />}
            />
            <Stat
              label="Total Received"
              value={formatMoney(totals.received)}
              tone="paid"
              icon={<Wallet className="size-4" />}
            />
            <Stat
              label="Total Pending"
              value={formatMoney(totals.pending)}
              tone="pending"
              icon={<IndianRupee className="size-4" />}
            />
            <Stat
              label="Total Advance"
              value={formatMoney(model.totals.advance)}
              tone="advance"
              hint="Unallocated receipts"
              icon={<Receipt className="size-4" />}
            />
            <Stat
              label="Total Customers"
              value={String(model.totals.customers)}
              tone="customer"
              icon={<Users className="size-4" />}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Paid Invoices" value={String(totals.paid)} tone="paid" />
            <Stat label="Part-Paid Invoices" value={String(totals.part)} tone="part" />
            <Stat label="Pending Invoices" value={String(totals.pendingCount)} tone="settled" />
            <Stat label="Overdue Invoices" value={String(totals.overdue)} tone="pending" />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {saleTypeCards.map((t) => (
              <div
                key={t.id}
                className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-sm"
              >
                <p className="truncate text-xs font-medium text-muted-foreground">{t.label}</p>
                <p className="num mt-1 text-sm text-muted-foreground">
                  {t.count} invoice{t.count === 1 ? "" : "s"}
                </p>
                <p className="num mt-1 text-base font-semibold text-navy">{formatMoney(t.total)}</p>
                <div className="num mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>
                    Recd <b className="text-sl-paid">{formatMoney(t.received)}</b>
                  </span>
                  <span>
                    Due <b className="text-sl-pending">{formatMoney(t.pending)}</b>
                  </span>
                </div>
              </div>
            ))}
          </div>

          <Panel
            title="Recent Invoices"
            action={
              <button
                type="button"
                className="text-xs font-medium text-navy underline"
                onClick={() => setTab("invoices")}
              >
                View all
              </button>
            }
          >
            <InvoiceTable rows={filteredInvoices.slice(0, 8)} onOpen={setOpenInvoiceId} />
          </Panel>

          <Panel
            title="Customer Outstanding"
            action={
              <button
                type="button"
                className="text-xs font-medium text-navy underline"
                onClick={() => setTab("customers")}
              >
                View all
              </button>
            }
          >
            <CustomerTable rows={customers.slice(0, 8)} onOpen={setOpenCustomerId} />
          </Panel>
        </div>
      ) : null}

      {tab === "invoices" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Sale Type</span>
            <Select
              value={invFilters["saleType"] ?? "all"}
              onValueChange={(v) => setInvFilters((f) => ({ ...f, saleType: v }))}
            >
              <SelectTrigger className="h-9 w-[180px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(invFilterDefs.find((f) => f.id === "saleType")?.options ?? []).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FilterBar
            datePreset={invPreset}
            dateOptions={invDateOptions}
            onDatePreset={setInvPreset}
            customFrom={invFrom}
            customTo={invTo}
            onCustomFrom={setInvFrom}
            onCustomTo={setInvTo}
            search={invSearch}
            onSearch={setInvSearch}
            searchPlaceholder="Search invoice number or customer"
            sort={invSort}
            onSort={setInvSort}
            filters={invFilterDefs}
            values={invFilters}
            onFilterChange={(id, value) => setInvFilters((f) => ({ ...f, [id]: value }))}
            amountMin={invMin}
            amountMax={invMax}
            onAmountMin={setInvMin}
            onAmountMax={setInvMax}
            onClearAll={clearInvFilters}
            right={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-9">
                    <Download className="mr-1 h-4 w-4" /> Download Filtered Report
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      downloadSalesExcel({ kind: "register", invoices: invoiceRows }, label);
                      toast.success("Excel report downloaded.");
                    }}
                  >
                    Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      if (!downloadSalesPdf({ kind: "register", invoices: invoiceRows }, label))
                        toast.error("Allow pop-ups for this site to open the PDF print view.");
                    }}
                  >
                    PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
          <Panel title={`Invoices (${invoiceRows.length})`}>
            <InvoiceTable
              rows={invoiceRows}
              onOpen={setOpenInvoiceId}
              showMeta
              onEdit={(id) => {
                setEditId(id);
                setFormOpen(true);
              }}
              onAddPayment={(partyId) => {
                setPaymentCustomer(partyId);
                setPaymentOpen(true);
              }}
              onPreviewPdf={(id) => setPdfInvoiceId(id)}
              onVoid={(v) => {
                if (
                  !window.confirm(
                    `Delete invoice ${v.invoice.number}? It will be removed from all balances, reports and totals.`,
                  )
                )
                  return;
                store.voidSalesInvoice(v.invoice.id);
                toast.success("Invoice deleted.");
              }}
            />
          </Panel>
        </div>
      ) : null}

      {tab === "customers" ? (
        <Panel
          title={`Customers (${customers.length})`}
          action={
            <Button size="sm" variant="outline" onClick={() => setCustomerFormOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add Customer
            </Button>
          }
        >
          <CustomerTable rows={customers} onOpen={setOpenCustomerId} />
        </Panel>
      ) : null}

      {tab === "sellers" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sellers.length ? (
            sellers.map((g) => (
              <GroupCard
                key={g.key}
                group={g}
                kind="seller"
                onOpen={() => setGroup({ title: `Seller — ${g.label}`, rows: g.invoices })}
              />
            ))
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No seller data for this period.
            </p>
          )}
        </div>
      ) : null}

      {tab === "platforms" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map((g) => (
            <GroupCard
              key={g.key}
              group={g}
              kind="platform"
              onOpen={() => setGroup({ title: `Platform — ${g.label}`, rows: g.invoices })}
            />
          ))}
        </div>
      ) : null}

      <SaleForm
        open={formOpen}
        editId={editId}
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
      />

      <PaymentForm
        open={paymentOpen}
        presetCustomerId={paymentCustomer}
        onClose={() => setPaymentOpen(false)}
      />

      <CustomerForm
        open={customerFormOpen}
        customerId={null}
        onClose={() => setCustomerFormOpen(false)}
      />

      <GroupDialog group={group} onClose={() => setGroup(null)} onOpenInvoice={setOpenInvoiceId} />

      <InvoiceDialog
        view={openInvoice}
        onClose={() => setOpenInvoiceId(null)}
        onEdit={(id) => {
          setOpenInvoiceId(null);
          setEditId(id);
          setFormOpen(true);
        }}
        onAddPayment={(partyId) => {
          setOpenInvoiceId(null);
          setPaymentCustomer(partyId);
          setPaymentOpen(true);
        }}
        onPreviewPdf={(id) => setPdfInvoiceId(id)}
      />

      <InvoicePdfDialog
        invoice={pdfInvoice?.invoice}
        customer={pdfInvoice?.customer}
        received={pdfInvoice?.received}
        onClose={() => setPdfInvoiceId(null)}
        onEdit={(id) => {
          setPdfInvoiceId(null);
          setOpenInvoiceId(null);
          setEditId(id);
          setFormOpen(true);
        }}
      />

      <CustomerDialog
        customer={openCustomer}
        payments={model.payments}
        periodLabelText={label}
        onClose={() => setOpenCustomerId(null)}
        onOpenInvoice={(id) => {
          setOpenCustomerId(null);
          setOpenInvoiceId(id);
        }}
      />
    </div>
  );
}

/* --------------------------------- tables -------------------------------- */

const SALE_TYPE_LABEL: Record<string, string> = {
  ue: "UE",
  ui: "UI",
  gst_inr: "GST INR",
  export: "Export",
  domestic: "Domestic",
};

function InvoiceTable({
  rows,
  onOpen,
  showMeta,
  onEdit,
  onAddPayment,
  onPreviewPdf,
  onVoid,
}: {
  rows: InvoiceView[];
  onOpen: (id: string) => void;
  showMeta?: boolean;
  onEdit?: (id: string) => void;
  onAddPayment?: (partyId: string) => void;
  onPreviewPdf?: (id: string) => void;
  onVoid?: (view: InvoiceView) => void;
}) {
  if (!rows.length)
    return (
      <p className="px-2 py-6 text-center text-sm text-muted-foreground">
        No invoices for the selected filters.
      </p>
    );
  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Invoice No.</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Seller</th>
              <th className="px-3 py-2 font-medium">Platform</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">Received</th>
              <th className="px-3 py-2 text-right font-medium">Pending</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr
                key={v.invoice.id}
                className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/50"
                onClick={() => onOpen(v.invoice.id)}
              >
                <td className="whitespace-nowrap px-3 py-2">{formatDate(v.invoice.date)}</td>
                <td className="px-3 py-2 font-medium text-navy">{v.invoice.number}</td>
                <td className="px-3 py-2">{v.customer?.name ?? "—"}</td>
                <td className="px-3 py-2">{v.invoice.sellerName || "—"}</td>
                <td className="px-3 py-2">{v.invoice.platform || "—"}</td>
                <td className="num px-3 py-2 text-right">{formatMoney(v.invoice.total)}</td>
                <td className="num px-3 py-2 text-right text-sl-paid">{formatMoney(v.received)}</td>
                <td className="num px-3 py-2 text-right text-sl-pending">
                  {formatMoney(v.pending)}
                </td>
                <td className="px-3 py-2">
                  <StatusChip status={v.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 lg:hidden">
        {rows.map((v) => (
          <div key={v.invoice.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
            <button type="button" onClick={() => onOpen(v.invoice.id)} className="w-full text-left">
              <p className="text-sm font-semibold text-navy">
                <span className="break-words">{v.invoice.number}</span>
                <span className="text-muted-foreground"> · </span>
                <span className="break-words">{v.customer?.name ?? "—"}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatDate(v.invoice.date)} ·{" "}
                {SALE_TYPE_LABEL[v.invoice.saleType ?? "domestic"] ?? "Domestic"}
                {v.invoice.sellerName ? ` · ${v.invoice.sellerName}` : ""}
                {v.invoice.platform ? ` · ${v.invoice.platform}` : ""}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <div className="num flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>
                    Total <b className="font-semibold text-navy">{formatMoney(v.invoice.total)}</b>
                  </span>
                  <span>
                    Recd <b className="font-semibold text-sl-paid">{formatMoney(v.received)}</b>
                  </span>
                  <span>
                    Due <b className="font-semibold text-sl-pending">{formatMoney(v.pending)}</b>
                  </span>
                </div>
                <StatusChip status={v.status} />
              </div>
            </button>
            {showMeta ? (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                <Button size="sm" variant="ghost" onClick={() => onOpen(v.invoice.id)}>
                  View
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onEdit?.(v.invoice.id)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onAddPayment?.(v.invoice.partyId)}>
                  Payment
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onPreviewPdf?.(v.invoice.id)}>
                  PDF
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-neg hover:bg-neg/10 hover:text-neg"
                  onClick={() => onVoid?.(v)}
                >
                  Delete
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

function CustomerTable({ rows, onOpen }: { rows: CustomerView[]; onOpen: (id: string) => void }) {
  if (!rows.length)
    return (
      <p className="px-2 py-6 text-center text-sm text-muted-foreground">
        No customers for the selected filters.
      </p>
    );
  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 text-right font-medium">Invoices</th>
              <th className="px-3 py-2 text-right font-medium">Total Sales</th>
              <th className="px-3 py-2 text-right font-medium">Received</th>
              <th className="px-3 py-2 text-right font-medium">Advance</th>
              <th className="px-3 py-2 text-right font-medium">Pending</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.party.id}
                className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/50"
                onClick={() => onOpen(c.party.id)}
              >
                <td className="px-3 py-2 font-medium text-navy">{c.party.name}</td>
                <td className="num px-3 py-2 text-right">{c.invoiceCount}</td>
                <td className="num px-3 py-2 text-right">{formatMoney(c.totalSales)}</td>
                <td className="num px-3 py-2 text-right text-sl-paid">{formatMoney(c.received)}</td>
                <td className="num px-3 py-2 text-right text-sl-advance">
                  {formatMoney(c.advance)}
                </td>
                <td className="num px-3 py-2 text-right text-sl-pending">
                  {formatMoney(c.pending)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium",
                      STATUS_CLASS[c.status],
                    )}
                  >
                    {c.status === "settled" ? "Settled" : STATUS_LABEL[c.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 lg:hidden">
        {rows.map((c) => (
          <button
            key={c.party.id}
            type="button"
            onClick={() => onOpen(c.party.id)}
            className="w-full rounded-lg border border-border bg-card p-3 text-left"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <p className="truncate text-sm font-semibold text-navy">{c.party.name}</p>
              <span
                className={cn(
                  "shrink-0 rounded-md px-2 py-1 text-xs font-medium",
                  STATUS_CLASS[c.status],
                )}
              >
                {c.status === "settled" ? "Settled" : STATUS_LABEL[c.status]}
              </span>
            </div>
            <div className="num mt-2 grid grid-cols-2 gap-1 text-xs">
              <span>Sales {formatMoney(c.totalSales)}</span>
              <span className="text-sl-paid">Recd {formatMoney(c.received)}</span>
              <span className="text-sl-advance">Adv {formatMoney(c.advance)}</span>
              <span className="text-sl-pending">Due {formatMoney(c.pending)}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

/* --------------------------- seller / platform --------------------------- */

function GroupCard({
  group,
  kind,
  onOpen,
}: {
  group: GroupView;
  kind: "seller" | "platform";
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <p className="truncate text-sm font-semibold text-navy">{group.label}</p>
        <span className="shrink-0 rounded-md bg-sl-total-bg px-2 py-1 text-xs font-medium text-sl-total">
          {group.count} {kind === "seller" ? "invoices" : "orders"}
        </span>
      </div>
      <div className="num mt-3 grid grid-cols-2 gap-2 text-xs">
        {kind === "seller" ? (
          <span className="text-muted-foreground">Customers: {group.customers}</span>
        ) : (
          <span className="text-muted-foreground">Avg: {formatMoney(group.average)}</span>
        )}
        <span className="text-sl-total">Sales {formatMoney(group.sales)}</span>
        <span className="text-sl-paid">Recd {formatMoney(group.received)}</span>
        <span className="text-sl-pending">Due {formatMoney(group.pending)}</span>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Collection</span>
          <span className="num">{group.collection}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-sl-paid"
            style={{ width: `${Math.min(100, group.collection)}%` }}
          />
        </div>
      </div>
    </button>
  );
}

function GroupDialog({
  group,
  onClose,
  onOpenInvoice,
}: {
  group: { title: string; rows: InvoiceView[] } | null;
  onClose: () => void;
  onOpenInvoice: (id: string) => void;
}) {
  return (
    <Dialog open={!!group} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={MODAL_CLASS}>
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-navy">{group?.title ?? "Invoices"}</DialogTitle>
          <DialogDescription>
            {group?.rows.length ?? 0} invoices in the selected period.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5">
          <InvoiceTable
            rows={group?.rows ?? []}
            onOpen={(id) => {
              onClose();
              onOpenInvoice(id);
            }}
          />
        </div>
        <div className="flex shrink-0 gap-2 border-t border-border bg-card px-5 py-4">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- dialogs -------------------------------- */

function InvoiceDialog({
  view,
  onClose,
  onEdit,
  onAddPayment,
  onPreviewPdf,
}: {
  view: InvoiceView | undefined;
  onClose: () => void;
  onEdit: (id: string) => void;
  onAddPayment: (partyId: string) => void;
  onPreviewPdf: (id: string) => void;
}) {
  const store = useLepdo();

  const inv = view?.invoice;
  const isJewelry = inv?.invoiceKind === "jewelry";
  return (
    <Dialog open={!!view} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={MODAL_CLASS}>
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-navy">{inv?.number ?? "Invoice"}</DialogTitle>
            {view ? <StatusChip status={view.status} /> : null}
          </div>
          <DialogDescription>
            {view?.customer?.name ?? "—"} · {inv ? formatDate(inv.date) : ""}
            {inv?.dueDate ? ` · Due ${formatDate(inv.dueDate)}` : ""}
            {inv?.sellerName ? ` · ${inv.sellerName}` : ""}
            {inv?.platform ? ` · ${inv.platform}` : ""}
          </DialogDescription>
        </DialogHeader>

        {view && inv ? (
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Invoice Total" value={formatMoney(inv.total)} tone="total" />
              <Stat label="Received" value={formatMoney(view.received)} tone="paid" />
              <Stat label="Pending" value={formatMoney(view.pending)} tone="pending" />
            </div>

            <Tabs defaultValue="items" className="mt-5">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="items">Invoice Items</TabsTrigger>
                <TabsTrigger value="payments">Payment History</TabsTrigger>
                <TabsTrigger value="summary">Summary</TabsTrigger>
              </TabsList>

              <TabsContent value="items" className="mt-3">
                {isJewelry ? (
                  <div className="space-y-2">
                    {(inv.jewelryItems ?? []).map((it) => (
                      <div key={it.id} className="rounded-xl border border-border p-3">
                        <p className="font-medium text-navy">{it.description}</p>
                        <div className="num mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {it.karat} · {it.metalColour}
                          </span>
                          <span>Net wt: {it.netWeight} g</span>
                          <span>Fine 999: {it.fineGram} g</span>
                          <span>Metal: {formatMoney(it.metalValue)}</span>
                          <span>Making: {formatMoney(it.makingValue)}</span>
                          <span>Stones: {formatMoney(it.stoneValue)}</span>
                        </div>
                        {it.stones.length ? (
                          <ul className="num mt-2 space-y-1 text-[11px] text-muted-foreground">
                            {it.stones.map((s) => (
                              <li key={s.id} className="truncate">
                                {s.stoneType} {s.size} · {s.carat} ct × {formatMoney(s.rate)} ={" "}
                                {formatMoney(s.value)}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <p className="num mt-2 text-sm font-semibold text-navy">
                          Item total {formatMoney(it.total)}
                        </p>
                      </div>
                    ))}
                    {!(inv.jewelryItems ?? []).length ? (
                      <p className="py-4 text-center text-muted-foreground">
                        No jewelry items recorded.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className="hidden overflow-hidden rounded-xl border border-border sm:block">
                      <table className="w-full table-fixed text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                            <th className="w-[12%] px-3 py-2 font-medium">Sr</th>
                            <th className="w-[38%] px-3 py-2 font-medium">Description</th>
                            <th className="px-3 py-2 text-right font-medium">Carat</th>
                            <th className="px-3 py-2 text-right font-medium">Price/CT</th>
                            <th className="px-3 py-2 text-right font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(inv.lines ?? []).map((l, i) => (
                            <tr key={l.id} className="border-b border-border/70 last:border-0">
                              <td className="px-3 py-2">{i + 1}</td>
                              <td className="truncate px-3 py-2">{l.description}</td>
                              <td className="num px-3 py-2 text-right">{l.carat || "—"}</td>
                              <td className="num px-3 py-2 text-right">{formatMoney(l.rate)}</td>
                              <td className="num px-3 py-2 text-right">
                                {formatMoney(round2((l.carat || l.quantity) * l.rate))}
                              </td>
                            </tr>
                          ))}
                          {!(inv.lines ?? []).length ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-3 py-3 text-center text-muted-foreground"
                              >
                                No item rows recorded for this invoice.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                    <div className="space-y-2 sm:hidden">
                      {(inv.lines ?? []).map((l) => (
                        <div key={l.id} className="rounded-xl border border-border p-3">
                          <p className="font-medium text-navy">{l.description}</p>
                          <div className="num mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>Carat: {l.carat || "—"}</span>
                            <span>Price/CT: {formatMoney(l.rate)}</span>
                            <span className="font-semibold text-navy">
                              Total: {formatMoney(round2((l.carat || l.quantity) * l.rate))}
                            </span>
                          </div>
                        </div>
                      ))}
                      {!(inv.lines ?? []).length ? (
                        <p className="py-4 text-center text-muted-foreground">
                          No item rows recorded.
                        </p>
                      ) : null}
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="payments" className="mt-3">
                <div className="hidden overflow-hidden rounded-xl border border-border sm:block">
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="w-[30%] px-3 py-2 font-medium">Account</th>
                        <th className="px-3 py-2 font-medium">Reference</th>
                        <th className="w-[30%] px-3 py-2 font-medium">Source &amp; Status</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.payments.map((p) => (
                        <tr key={p.payment.id} className="border-b border-border/70 last:border-0">
                          <td className="whitespace-nowrap px-3 py-2">
                            {formatDate(p.payment.date)}
                          </td>
                          <td className="truncate px-3 py-2">{p.payment.account}</td>
                          <td className="truncate px-3 py-2">{p.payment.reference}</td>
                          <td className="px-3 py-2"></td>
                          <td className="num px-3 py-2 text-right text-sl-paid">
                            {formatMoney(p.amount)}
                          </td>
                        </tr>
                      ))}
                      {!view.payments.length ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-3 text-center text-muted-foreground">
                            No payments allocated yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2 sm:hidden">
                  {view.payments.map((p) => (
                    <div key={p.payment.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-navy">{formatDate(p.payment.date)}</p>
                        <p className="num font-semibold text-sl-paid">{formatMoney(p.amount)}</p>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {p.payment.account} · {p.payment.reference}
                      </p>
                    </div>
                  ))}
                  {!view.payments.length ? (
                    <p className="py-4 text-center text-muted-foreground">
                      No payments allocated yet.
                    </p>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="summary" className="mt-3">
                <div className="num space-y-2 rounded-xl border border-border p-4">
                  <Row label="Subtotal" value={formatMoney(inv.subtotal ?? inv.total)} />
                  <Row label="Discount" value={formatMoney(inv.discount ?? 0)} />
                  <Row label="Shipping / Other" value={formatMoney(inv.shipping ?? 0)} />
                  {inv.currency && inv.currency !== "INR" ? (
                    <>
                      <Row
                        label={`Grand Total (${inv.currency})`}
                        value={`${inv.currency} ${(inv.foreignTotal ?? 0).toFixed(2)}`}
                      />
                      <Row label="Exchange rate" value={String(inv.exchangeRate ?? 1)} />
                    </>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-sl-total-bg px-3 py-2.5 font-semibold text-sl-total">
                    <span>Final Total (INR)</span>
                    <span className="text-base">{formatMoney(inv.total)}</span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : null}

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-card px-5 py-4">
          {inv ? (
            <>
              <Button variant="outline" onClick={() => onEdit(inv.id)}>
                Edit
              </Button>
              <Button variant="outline" onClick={() => onAddPayment(inv.partyId)}>
                Add Payment
              </Button>
              <Button variant="outline" onClick={() => onPreviewPdf(inv.id)}>
                <FileText className="size-4" /> Preview PDF
              </Button>

              <Button
                variant="outline"
                className="border-neg/40 text-neg hover:bg-neg/10 hover:text-neg sm:ml-auto"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Delete invoice ${inv.number}? It will be removed from all balances, reports and totals.`,
                    )
                  )
                    return;
                  store.voidSalesInvoice(inv.id);
                  toast.success("Invoice deleted.");
                  onClose();
                }}
              >
                Delete
              </Button>
            </>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDialog({
  customer,
  payments,
  periodLabelText,
  onClose,
  onOpenInvoice,
}: {
  customer: CustomerView | undefined;
  payments: ReturnType<typeof buildSalesModel>["payments"];
  periodLabelText: string;
  onClose: () => void;
  onOpenInvoice: (id: string) => void;
}) {
  const rows = customer ? customerLedger(customer, payments) : [];
  const closing = rows.at(-1)?.balance ?? 0;
  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={MODAL_CLASS}>
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-navy">{customer?.party.name ?? "Customer"}</DialogTitle>
            {customer ? (
              <span
                className={cn(
                  "inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium",
                  STATUS_CLASS[customer.status],
                )}
              >
                {customer.status === "settled" ? "Settled" : STATUS_LABEL[customer.status]}
              </span>
            ) : null}
          </div>
          <DialogDescription>
            {[
              customer?.party.company,
              customer?.party.phone,
              customer?.party.email,
              customer?.party.gstin && `GSTIN ${customer.party.gstin}`,
              customer?.party.city,
              customer?.party.country,
            ]
              .filter(Boolean)
              .join(" · ") || "No contact details recorded."}
          </DialogDescription>
        </DialogHeader>

        {customer ? (
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 text-sm">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Total Sales" value={formatMoney(customer.totalSales)} tone="total" />
              <Stat label="Received" value={formatMoney(customer.received)} tone="paid" />
              <Stat label="Advance" value={formatMoney(customer.advance)} tone="advance" />
              <Stat label="Pending" value={formatMoney(customer.pending)} tone="pending" />
            </div>

            <div
              className={cn(
                "mt-4 rounded-xl px-4 py-3 text-sm font-semibold",
                closing > 0
                  ? "bg-sl-pending-bg text-sl-pending"
                  : closing < 0
                    ? "bg-sl-advance-bg text-sl-advance"
                    : "bg-sl-paid-bg text-sl-paid",
              )}
            >
              {closing > 0
                ? `Customer Has to Pay ${formatMoney(closing)}`
                : closing < 0
                  ? `Advance Available ${formatMoney(Math.abs(closing))}`
                  : "Settled"}
            </div>

            <Tabs defaultValue="ledger" className="mt-4">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="ledger">Account Ledger</TabsTrigger>
                <TabsTrigger value="invoices">Invoices</TabsTrigger>
              </TabsList>

              <TabsContent value="ledger" className="mt-3">
                <div className="hidden overflow-hidden rounded-xl border border-border sm:block">
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Reference</th>
                        <th className="px-3 py-2 text-right font-medium">Debit</th>
                        <th className="px-3 py-2 text-right font-medium">Credit</th>
                        <th className="px-3 py-2 text-right font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-b border-border/70 last:border-0">
                          <td className="whitespace-nowrap px-3 py-2">{formatDate(r.date)}</td>
                          <td className="truncate px-3 py-2">{r.type}</td>
                          <td className="truncate px-3 py-2">{r.reference}</td>
                          <td className="num px-3 py-2 text-right">
                            {r.debit ? formatMoney(r.debit) : "—"}
                          </td>
                          <td className="num px-3 py-2 text-right text-sl-paid">
                            {r.credit ? formatMoney(r.credit) : "—"}
                          </td>
                          <td className="num px-3 py-2 text-right">{formatMoney(r.balance)}</td>
                        </tr>
                      ))}
                      {!rows.length ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-3 text-center text-muted-foreground">
                            No ledger entries yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2 sm:hidden">
                  {rows.map((r) => (
                    <div key={r.id} className="rounded-xl border border-border p-3">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <p className="truncate font-medium text-navy">{r.type}</p>
                        <p className="num shrink-0 text-xs">{formatDate(r.date)}</p>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{r.particulars}</p>
                      <div className="num mt-1 grid grid-cols-3 gap-1 text-xs">
                        <span>Dr {r.debit ? formatMoney(r.debit) : "—"}</span>
                        <span className="text-sl-paid">
                          Cr {r.credit ? formatMoney(r.credit) : "—"}
                        </span>
                        <span>Bal {formatMoney(r.balance)}</span>
                      </div>
                    </div>
                  ))}
                  {!rows.length ? (
                    <p className="py-4 text-center text-muted-foreground">No ledger entries yet.</p>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="invoices" className="mt-3">
                <InvoiceTable rows={customer.invoices} onOpen={onOpenInvoice} />
              </TabsContent>
            </Tabs>
          </div>
        ) : null}

        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-card px-5 py-4">
          {customer ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  downloadSalesExcel({ kind: "ledger", customer, rows }, periodLabelText);
                  toast.success("Excel statement downloaded.");
                }}
              >
                <Download className="size-4" /> Excel Statement
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (!downloadSalesPdf({ kind: "ledger", customer, rows }, periodLabelText))
                    toast.error("Allow pop-ups to print the statement.");
                }}
              >
                <FileText className="size-4" /> PDF Statement
              </Button>
            </>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
