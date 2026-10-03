import { isPosted } from "@/lib/lepdo/entry";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  Clock,
  Coins,
  FileBarChart,
  Gem,
  HandCoins,
  Landmark,
  PiggyBank,
  Radio,
  Receipt,
  ScrollText,
  ShoppingBag,
  ShoppingCart,
  Store,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney, round2, todayISO } from "@/lib/lepdo/format";
import { partyName, useLepdo } from "@/lib/lepdo/store";
import { PRESETS, type Preset } from "@/lib/lepdo/period";
import { useShell } from "@/components/lepdo/shell-context";
import {
  STATUS_LABEL,
  buildSalesModel,
  matchInvoice,
  platformGroups,
  sellerGroups,
  type InvoiceStatus,
  type InvoiceView,
} from "@/lib/lepdo/sales";
import { buildPurchaseModel, matchBill, type BillView } from "@/lib/lepdo/purchase";
import { expenseHead } from "@/lib/lepdo/expense";
import { accountLabel, isUchhina, buildPersonLedgers, uchhinaTypeLabel } from "@/lib/lepdo/uchhina";
import {
  buildCapitalViews,
  buildLiabilityView,
  buildStockView,
  liabilityKindLabel,
  teamTypeLabel,
  type Tone,
} from "@/lib/lepdo/extras";
import type { ExportTable } from "@/lib/lepdo/exportTable";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Chip,
  DownloadMenu,
  ModalShell,
  Pager,
  ProgressBar,
  StatCard,
  usePaged,
} from "@/components/lepdo/shared";
import type { Transaction } from "@/lib/lepdo/types";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports & Analysis — LEPDO Accounting" },
      {
        name: "description",
        content:
          "Every LEPDO report in one place — sales, purchases, expenses, P&L, ledgers, outstanding, stock and team reports with instant filters, on-screen view and Excel/PDF/CSV downloads.",
      },
      { property: "og:title", content: "Reports & Analysis — LEPDO Accounting" },
      {
        property: "og:description",
        content: "Report Centre and business Analysis, built live from your ledger data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

const STATUS_OPTIONS: { value: "all" | InvoiceStatus; label: string }[] = [
  { value: "all", label: "All Status" },
  { value: "paid", label: "Paid" },
  { value: "part", label: "Part Paid" },
  { value: "pending", label: "Pending" },
  { value: "overdue", label: "Overdue" },
];

function fyOption(offset: number, todayIso: string) {
  const d = new Date(todayIso);
  const y0 = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  const y = y0 - offset;
  return {
    id: `${y}`,
    label: `FY ${y}-${String(y + 1).slice(2)}`,
    from: `${y}-04-01`,
    to: `${y + 1}-03-31`,
  };
}

function textIncludes(hay: (string | number | null | undefined)[], q: string) {
  if (!q) return true;
  return hay
    .map((v) => String(v ?? ""))
    .join(" ")
    .toLowerCase()
    .includes(q.toLowerCase());
}

interface ReportDef {
  key: string;
  label: string;
  icon: typeof ShoppingCart;
  tone: Tone;
  link?: string;
  headline: string;
  hint?: string;
  build: () => ExportTable;
}

function ReportsPage() {
  const store = useLepdo();
  const shell = useShell();
  const today = todayISO();
  const [tab, setTab] = useState<"centre" | "analysis">("centre");
  const [accountFilter, setAccountFilter] = useState("all");
  const [partyFilter, setPartyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>("all");
  const [search, setSearch] = useState("");
  const [viewKey, setViewKey] = useState<string | null>(null);

  const { from, to } = shell;

  const accounts = useMemo(
    () => [
      ...store.bankAccounts.map((b) => ({ id: b.id, label: b.nickname || b.bankName })),
      ...store.cashLocations.map((c) => ({ id: c.id, label: c.name })),
    ],
    [store.bankAccounts, store.cashLocations],
  );

  const fyOptions = useMemo(
    () => [fyOption(0, today), fyOption(1, today), fyOption(2, today)],
    [today],
  );

  function clearAll() {
    setAccountFilter("all");
    setPartyFilter("all");
    setStatusFilter("all");
    setSearch("");
  }

  const inRange = (d: string) => d >= from && d <= to;

  /* ---------------- base filtered models ---------------- */

  const salesModel = useMemo(
    () =>
      buildSalesModel({
        invoices: store.salesInvoices,
        transactions: store.transactions,
        parties: store.parties,
        banks: store.bankAccounts,
        cash: store.cashLocations,
      }),
    [
      store.salesInvoices,
      store.transactions,
      store.parties,
      store.bankAccounts,
      store.cashLocations,
    ],
  );

  const purchaseModel = useMemo(
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

  const salesRows = useMemo(
    () =>
      salesModel.invoices.filter(
        (v) =>
          inRange(v.invoice.date) &&
          (partyFilter === "all" || v.invoice.partyId === partyFilter) &&
          (statusFilter === "all" || v.status === statusFilter) &&
          matchInvoice(v, search),
      ),
    [salesModel, from, to, partyFilter, statusFilter, search],
  );

  const purchaseRows = useMemo(
    () =>
      purchaseModel.bills.filter(
        (v) =>
          inRange(v.bill.date) &&
          (partyFilter === "all" || v.bill.partyId === partyFilter) &&
          (statusFilter === "all" || v.status === statusFilter) &&
          matchBill(v, search),
      ),
    [purchaseModel, from, to, partyFilter, statusFilter, search],
  );

  const baseTx = useMemo(
    () =>
      store.transactions.filter(
        (t) =>
          isPosted(t) &&
          inRange(t.date) &&
          (accountFilter === "all" || t.accountId === accountFilter) &&
          (partyFilter === "all" || t.partyId === partyFilter) &&
          textIncludes(
            [t.particulars, t.reference, t.code, partyName(store.parties, t.partyId)],
            search,
          ),
      ),
    [store.transactions, store.parties, from, to, accountFilter, partyFilter, search],
  );

  const expenseTx = useMemo(() => baseTx.filter((t) => t.category === "expense"), [baseTx]);
  const bankTx = useMemo(() => baseTx.filter((t) => t.sourceType === "bank"), [baseTx]);
  const cashTx = useMemo(() => baseTx.filter((t) => t.sourceType === "cash"), [baseTx]);
  const drawingTx = useMemo(() => baseTx.filter((t) => t.category === "owner_drawing"), [baseTx]);
  const capitalTx = useMemo(
    () => baseTx.filter((t) => t.category === "owner_investment" || t.category === "owner_drawing"),
    [baseTx],
  );

  const uchhinaLedgers = useMemo(
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
  const uchhinaFilteredRows = useMemo(
    () =>
      uchhinaLedgers
        .filter((l) => partyFilter === "all" || l.personId === partyFilter)
        .flatMap((l) =>
          l.rows
            .filter((r) => accountFilter === "all" || r.account === accountFilter)
            .map((r) => ({ ...r, person: l.name }))
            .filter((r) => textIncludes([r.particulars, r.code, r.person], search)),
        ),
    [uchhinaLedgers, partyFilter, accountFilter, search, store.bankAccounts, store.cashLocations],
  );

  const stockDiamond = useMemo(
    () => buildStockView(store.stockEntries, "diamond"),
    [store.stockEntries],
  );
  const stockGold = useMemo(() => buildStockView(store.stockEntries, "gold"), [store.stockEntries]);

  const liabilityViews = useMemo(
    () => store.liabilities.map((l) => buildLiabilityView(l, store.liabilityEntries)),
    [store.liabilities, store.liabilityEntries],
  );
  const capitalViews = useMemo(
    () => buildCapitalViews(store.transactions, (id) => partyName(store.parties, id)),
    [store.transactions, store.parties],
  );

  const sellerGroupsData = useMemo(() => sellerGroups(salesRows), [salesRows]);
  const platformGroupsData = useMemo(() => platformGroups(salesRows), [salesRows]);

  const teamRows = useMemo(
    () =>
      store.teamPayments
        .filter(
          (p) => !p.voided && inRange(p.date) && textIncludes([p.particulars, p.month], search),
        )
        .map((p) => ({
          ...p,
          memberName: store.teamMembers.find((m) => m.id === p.memberId)?.name ?? "—",
        })),
    [store.teamPayments, store.teamMembers, from, to, search],
  );

  const plModel = useMemo(() => {
    const revenue = salesRows.reduce((s, v) => s + v.invoice.total, 0);
    const purchases = purchaseRows.reduce((s, v) => s + v.bill.total, 0);
    const expenses = expenseTx.reduce((s, t) => s + t.amount, 0);
    const gross = revenue - purchases;
    const net = gross - expenses;
    return { revenue, purchases, expenses, gross, net };
  }, [salesRows, purchaseRows, expenseTx]);

  /* ---------------- report builders ---------------- */

  const reports: ReportDef[] = useMemo(() => {
    const invoiceCols = [
      { key: "date", label: "Date", date: true },
      { key: "number", label: "Number" },
      { key: "party", label: "Party" },
      { key: "total", label: "Total", money: true },
      { key: "settled", label: "Received/Paid", money: true },
      { key: "pending", label: "Pending", money: true },
      { key: "status", label: "Status" },
    ];
    const txCols = [
      { key: "date", label: "Date", date: true },
      { key: "code", label: "Code" },
      { key: "account", label: "Account" },
      { key: "category", label: "Category" },
      { key: "party", label: "Party" },
      { key: "particulars", label: "Particulars" },
      { key: "amount", label: "Amount", money: true },
    ];

    const txRow = (t: Transaction) => ({
      date: t.date,
      code: t.code,
      account: accountLabel(t, store.bankAccounts, store.cashLocations),
      category: t.category ?? "—",
      party: partyName(store.parties, t.partyId),
      particulars: t.particulars,
      amount: t.direction === "in" ? t.amount : -t.amount,
    });

    const salesTotal = salesRows.reduce((s, v) => s + v.invoice.total, 0);
    const purchasesTotal = purchaseRows.reduce((s, v) => s + v.bill.total, 0);
    const expensesTotal = expenseTx.reduce((s, t) => s + t.amount, 0);
    const bankTotal = bankTx.reduce((s, t) => s + (t.direction === "in" ? t.amount : -t.amount), 0);
    const cashTotal = cashTx.reduce((s, t) => s + (t.direction === "in" ? t.amount : -t.amount), 0);
    const custOutstandingRows = groupOutstanding(salesRows, store.parties, "customer");
    const suppOutstandingRows = groupOutstanding(purchaseRows, store.parties, "supplier");
    const custOutstandingTotal = custOutstandingRows.reduce((s, r) => s + r.pending, 0);
    const suppOutstandingTotal = suppOutstandingRows.reduce((s, r) => s + r.pending, 0);
    const pendingRows = [
      ...salesRows.filter((v) => v.pending > 0),
      ...purchaseRows.filter((v) => v.pending > 0),
    ];
    const pendingTotal = pendingRows.reduce(
      (s, v: any) => s + ("invoice" in v ? v.pending : v.pending),
      0,
    );
    const advancePayRows = [
      ...salesModel.payments.filter(
        (p) =>
          p.advance > 0 && inRange(p.date) && (partyFilter === "all" || p.partyId === partyFilter),
      ),
      ...purchaseModel.payments.filter(
        (p) =>
          p.advance > 0 && inRange(p.date) && (partyFilter === "all" || p.partyId === partyFilter),
      ),
    ];
    const advanceTotal = advancePayRows.reduce((s, p) => s + p.advance, 0);
    const uchhinaTotal = uchhinaFilteredRows.reduce((s, r) => s + r.amount, 0);
    const drawingsTotal = drawingTx.reduce((s, t) => s + t.amount, 0);
    const liabilityOutstanding = liabilityViews.reduce((s, v) => s + v.outstanding, 0);
    const capitalBalance = capitalViews.reduce((s, v) => s + v.balance, 0);
    const stockValue = stockDiamond.totalValue + stockGold.totalValue;
    const sellerTop = sellerGroupsData[0];
    const platformTop = platformGroupsData[0];
    const teamPaid = teamRows.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0);

    const sumBy = <T,>(rows: T[], keyFn: (r: T) => string, valFn: (r: T) => number) => {
      const map = new Map<string, number>();
      for (const r of rows) {
        const k = keyFn(r) || "Unknown";
        map.set(k, (map.get(k) ?? 0) + valFn(r));
      }
      return [...map.entries()]
        .map(([label, value]) => ({ label, value: round2(value) }))
        .sort((a, b) => b.value - a.value);
    };
    const topCustomersData = sumBy(
      salesRows,
      (v) => v.customer?.name ?? "Unknown",
      (v) => v.invoice.total,
    ).slice(0, 8);
    const customerCountryData = sumBy(
      salesRows,
      (v) => v.customer?.country?.trim() || "Unknown",
      (v) => v.invoice.total,
    );
    const diamondVsJewelryData = sumBy(
      salesRows,
      (v) => (v.invoice.invoiceKind === "jewelry" ? "Jewellery" : "Diamond"),
      (v) => v.invoice.total,
    );
    const goodsMap = new Map<string, { qty: number; value: number }>();
    for (const v of salesRows) {
      for (const l of v.invoice.lines ?? []) {
        const key = l.description?.trim() || "Diamond item";
        const entry = goodsMap.get(key) ?? { qty: 0, value: 0 };
        entry.qty += l.quantity || l.pcs || 0;
        entry.value += (l.carat || l.quantity || 1) * (l.rate || 0);
        goodsMap.set(key, entry);
      }
      for (const j of v.invoice.jewelryItems ?? []) {
        const key = j.description?.trim() || "Jewelry item";
        const entry = goodsMap.get(key) ?? { qty: 0, value: 0 };
        entry.qty += 1;
        entry.value += j.total || 0;
        goodsMap.set(key, entry);
      }
    }
    const mostSoldGoodsData = [...goodsMap.entries()]
      .map(([label, v]) => ({ label, qty: round2(v.qty), value: round2(v.value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const list: ReportDef[] = [
      {
        key: "sales",
        label: "Sales",
        icon: ShoppingCart,
        tone: "blue",
        link: "/sales",
        headline: formatMoney(salesTotal),
        hint: `${salesRows.length} invoices`,
        build: () => ({
          title: "Sales Report",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: invoiceCols,
          rows: salesRows.map((v) => ({
            date: v.invoice.date,
            number: v.invoice.number,
            party: v.customer?.name ?? "—",
            total: v.invoice.total,
            settled: v.received,
            pending: v.pending,
            status: STATUS_LABEL[v.status as InvoiceStatus],
          })),
          totals: {
            total: salesTotal,
            settled: salesRows.reduce((s, v) => s + v.received, 0),
            pending: salesRows.reduce((s, v) => s + v.pending, 0),
          },
        }),
      },
      {
        key: "purchases",
        label: "Purchases",
        icon: ShoppingBag,
        tone: "orange",
        link: "/purchase",
        headline: formatMoney(purchasesTotal),
        hint: `${purchaseRows.length} bills`,
        build: () => ({
          title: "Purchase Report",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: invoiceCols,
          rows: purchaseRows.map((v) => ({
            date: v.bill.date,
            number: v.bill.number,
            party: v.supplier?.name ?? "—",
            total: v.bill.total,
            settled: v.paid,
            pending: v.pending,
            status: STATUS_LABEL[v.status as InvoiceStatus],
          })),
          totals: {
            total: purchasesTotal,
            settled: purchaseRows.reduce((s, v) => s + v.paid, 0),
            pending: purchaseRows.reduce((s, v) => s + v.pending, 0),
          },
        }),
      },
      {
        key: "expenses",
        label: "Expenses",
        icon: Receipt,
        tone: "red",
        link: "/expense",
        headline: formatMoney(expensesTotal),
        hint: `${expenseTx.length} entries`,
        build: () => ({
          title: "Expense Report",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: [
            { key: "date", label: "Date", date: true },
            { key: "category", label: "Head" },
            { key: "particulars", label: "Particulars" },
            { key: "account", label: "Paid From" },
            { key: "amount", label: "Amount", money: true },
          ],
          rows: expenseTx.map((t) => ({
            date: t.date,
            category: expenseHead(t.expenseCategory),
            particulars: t.particulars,
            account: accountLabel(t, store.bankAccounts, store.cashLocations),
            amount: t.amount,
          })),
          totals: { amount: expensesTotal },
        }),
      },
      {
        key: "pl",
        label: "P&L",
        icon: FileBarChart,
        tone: "navy",
        link: "/pl",
        headline: formatMoney(plModel.net),
        hint: "Net profit",
        build: () => ({
          title: "Profit & Loss",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: [
            { key: "label", label: "Particulars" },
            { key: "amount", label: "Amount", money: true },
          ],
          rows: [
            { label: "Sales Revenue", amount: plModel.revenue },
            { label: "Purchases", amount: plModel.purchases },
            { label: "Gross Profit", amount: plModel.gross },
            { label: "Operating Expenses", amount: plModel.expenses },
            { label: "Net Profit", amount: plModel.net },
          ],
        }),
      },
      {
        key: "bankLedger",
        label: "Bank Ledger",
        icon: Landmark,
        tone: "blue",
        link: "/bank-ledger",
        headline: formatMoney(bankTotal),
        hint: `${bankTx.length} entries`,
        build: () => ({
          title: "Bank Ledger",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: txCols,
          rows: bankTx.map(txRow),
          totals: { amount: bankTotal },
        }),
      },
      {
        key: "cashBook",
        label: "Cash Book",
        icon: Wallet,
        tone: "green",
        link: "/cash-book",
        headline: formatMoney(cashTotal),
        hint: `${cashTx.length} entries`,
        build: () => ({
          title: "Cash Book",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: txCols,
          rows: cashTx.map(txRow),
          totals: { amount: cashTotal },
        }),
      },
      {
        key: "custOutstanding",
        label: "Customer Outstanding",
        icon: Users,
        tone: "purple",
        headline: formatMoney(custOutstandingTotal),
        hint: `${custOutstandingRows.length} customers`,
        build: () => ({
          title: "Customer Outstanding",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: [
            { key: "name", label: "Customer" },
            { key: "invoices", label: "Invoices" },
            { key: "total", label: "Total Sales", money: true },
            { key: "received", label: "Received", money: true },
            { key: "pending", label: "Pending", money: true },
          ],
          rows: custOutstandingRows.map((r) => ({
            name: r.name,
            invoices: r.count,
            total: r.total,
            received: r.settled,
            pending: r.pending,
          })),
          totals: { pending: custOutstandingTotal },
        }),
      },
      {
        key: "suppOutstanding",
        label: "Supplier Outstanding",
        icon: Truck,
        tone: "orange",
        headline: formatMoney(suppOutstandingTotal),
        hint: `${suppOutstandingRows.length} suppliers`,
        build: () => ({
          title: "Supplier Outstanding",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: [
            { key: "name", label: "Supplier" },
            { key: "invoices", label: "Bills" },
            { key: "total", label: "Total Purchases", money: true },
            { key: "received", label: "Paid", money: true },
            { key: "pending", label: "Pending", money: true },
          ],
          rows: suppOutstandingRows.map((r) => ({
            name: r.name,
            invoices: r.count,
            total: r.total,
            received: r.settled,
            pending: r.pending,
          })),
          totals: { pending: suppOutstandingTotal },
        }),
      },
      {
        key: "pending",
        label: "Pending Payments",
        icon: Clock,
        tone: "red",
        headline: formatMoney(pendingTotal),
        hint: `${pendingRows.length} open`,
        build: () => ({
          title: "Pending Payments",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: [
            { key: "kind", label: "Type" },
            { key: "date", label: "Date", date: true },
            { key: "number", label: "Number" },
            { key: "party", label: "Party" },
            { key: "pending", label: "Pending", money: true },
            { key: "status", label: "Status" },
          ],
          rows: pendingRows.map((v: any) =>
            "invoice" in v
              ? {
                  kind: "Sales",
                  date: v.invoice.date,
                  number: v.invoice.number,
                  party: v.customer?.name ?? "—",
                  pending: v.pending,
                  status: STATUS_LABEL[v.status as InvoiceStatus],
                }
              : {
                  kind: "Purchase",
                  date: v.bill.date,
                  number: v.bill.number,
                  party: v.supplier?.name ?? "—",
                  pending: v.pending,
                  status: STATUS_LABEL[v.status as InvoiceStatus],
                },
          ),
          totals: { pending: pendingTotal },
        }),
      },
      {
        key: "advance",
        label: "Advance Payments",
        icon: HandCoins,
        tone: "yellow",
        headline: formatMoney(advanceTotal),
        hint: `${advancePayRows.length} entries`,
        build: () => ({
          title: "Advance Payments",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: [
            { key: "date", label: "Date", date: true },
            { key: "party", label: "Party" },
            { key: "account", label: "Account" },
            { key: "advance", label: "Advance", money: true },
          ],
          rows: advancePayRows.map((p) => ({
            date: p.date,
            party: partyName(store.parties, p.partyId),
            account: p.account,
            advance: p.advance,
          })),
          totals: { advance: advanceTotal },
        }),
      },
      {
        key: "uchhina",
        label: "Uchhina",
        icon: Coins,
        tone: "grey",
        link: "/uchhina",
        headline: formatMoney(uchhinaTotal),
        hint: `${uchhinaFilteredRows.length} entries`,
        build: () => ({
          title: "Uchhina Report",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: [
            { key: "date", label: "Date", date: true },
            { key: "person", label: "Person" },
            { key: "type", label: "Type" },
            { key: "account", label: "Account" },
            { key: "amount", label: "Amount", money: true },
          ],
          rows: uchhinaFilteredRows.map((r) => ({
            date: r.date,
            person: r.person,
            type: uchhinaTypeLabel(r.category),
            account: r.account,
            amount: r.amount,
          })),
          totals: { amount: uchhinaTotal },
        }),
      },
      {
        key: "drawings",
        label: "Drawings",
        icon: PiggyBank,
        tone: "purple",
        link: "/drawings",
        headline: formatMoney(drawingsTotal),
        hint: `${drawingTx.length} entries`,
        build: () => ({
          title: "Drawings Report",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: txCols,
          rows: drawingTx.map(txRow),
          totals: { amount: drawingsTotal },
        }),
      },
      {
        key: "capital",
        label: "Capital & Liabilities",
        icon: Landmark,
        tone: "orange",
        headline: formatMoney(capitalBalance - liabilityOutstanding),
        hint: "Net capital position",
        build: () => ({
          title: "Capital & Liabilities",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: [
            { key: "name", label: "Name" },
            { key: "type", label: "Type" },
            { key: "in", label: "Invested/Borrowed", money: true },
            { key: "out", label: "Withdrawn/Repaid", money: true },
            { key: "balance", label: "Balance", money: true },
          ],
          rows: [
            ...capitalViews.map((v) => ({
              name: v.label,
              type: "Capital",
              in: v.invested,
              out: v.withdrawn,
              balance: v.balance,
            })),
            ...liabilityViews.map((v) => ({
              name: v.liability.name,
              type: liabilityKindLabel(v.liability.kind),
              in: v.borrowed,
              out: v.repaid,
              balance: v.outstanding,
            })),
          ],
        }),
      },
      {
        key: "stock",
        label: "Stock",
        icon: Boxes,
        tone: "green",
        headline: formatMoney(stockValue),
        hint: `${stockDiamond.totalQty + stockGold.totalQty} balance qty`,
        build: () => ({
          title: "Stock Report",
          subtitle: `Diamond & Gold`,
          columns: [
            { key: "stock", label: "Stock" },
            { key: "date", label: "Date", date: true },
            { key: "description", label: "Description" },
            { key: "qtyIn", label: "In", align: "right" },
            { key: "qtyOut", label: "Out", align: "right" },
            { key: "balance", label: "Balance", align: "right" },
            { key: "value", label: "Value", money: true },
          ],
          rows: [
            ...stockDiamond.rows.map((r) => ({
              stock: "Diamond",
              date: r.date,
              description: r.description,
              qtyIn: r.qtyIn,
              qtyOut: r.qtyOut,
              balance: r.balance,
              value: r.value,
            })),
            ...stockGold.rows.map((r) => ({
              stock: "Gold",
              date: r.date,
              description: r.description,
              qtyIn: r.qtyIn,
              qtyOut: r.qtyOut,
              balance: r.balance,
              value: r.value,
            })),
          ],
          totals: { value: stockValue },
        }),
      },
      {
        key: "sellerWise",
        label: "Seller-Wise Sales",
        icon: Store,
        tone: "blue",
        headline: sellerTop ? formatMoney(sellerTop.sales) : formatMoney(0),
        hint: sellerTop ? sellerTop.label : "No sales yet",
        build: () => ({
          title: "Seller-Wise Sales",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: [
            { key: "label", label: "Seller" },
            { key: "count", label: "Invoices" },
            { key: "sales", label: "Sales", money: true },
            { key: "received", label: "Received", money: true },
            { key: "pending", label: "Pending", money: true },
          ],
          rows: sellerGroupsData.map((g) => ({
            label: g.label,
            count: g.count,
            sales: g.sales,
            received: g.received,
            pending: g.pending,
          })),
        }),
      },
      {
        key: "platformWise",
        label: "Platform-Wise Sales",
        icon: Radio,
        tone: "yellow",
        headline: platformTop ? formatMoney(platformTop.sales) : formatMoney(0),
        hint: platformTop ? platformTop.label : "No sales yet",
        build: () => ({
          title: "Platform-Wise Sales",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: [
            { key: "label", label: "Platform" },
            { key: "count", label: "Invoices" },
            { key: "sales", label: "Sales", money: true },
            { key: "received", label: "Received", money: true },
            { key: "pending", label: "Pending", money: true },
          ],
          rows: platformGroupsData.map((g) => ({
            label: g.label,
            count: g.count,
            sales: g.sales,
            received: g.received,
            pending: g.pending,
          })),
        }),
      },
      {
        key: "topCustomers",
        label: "Top Customers",
        icon: Users,
        tone: "purple",
        headline: topCustomersData[0] ? formatMoney(topCustomersData[0].value) : formatMoney(0),
        hint: topCustomersData[0]?.label ?? "No sales yet",
        build: () => ({
          title: "Top Customers",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: [
            { key: "label", label: "Customer" },
            { key: "value", label: "Sales", money: true },
          ],
          rows: topCustomersData.map((r) => ({ label: r.label, value: r.value })),
          totals: { value: topCustomersData.reduce((s, r) => s + r.value, 0) },
        }),
      },
      {
        key: "customerCountry",
        label: "Customer Value by Country",
        icon: Users,
        tone: "blue",
        headline: customerCountryData[0] ? formatMoney(customerCountryData[0].value) : formatMoney(0),
        hint: customerCountryData[0]?.label ?? "No sales yet",
        build: () => ({
          title: "Customer Value by Country",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: [
            { key: "label", label: "Country" },
            { key: "value", label: "Sales", money: true },
          ],
          rows: customerCountryData.map((r) => ({ label: r.label, value: r.value })),
          totals: { value: customerCountryData.reduce((s, r) => s + r.value, 0) },
        }),
      },
      {
        key: "mostSoldGoods",
        label: "Most-Sold Goods",
        icon: Gem,
        tone: "yellow",
        headline: mostSoldGoodsData[0] ? formatMoney(mostSoldGoodsData[0].value) : formatMoney(0),
        hint: mostSoldGoodsData[0]?.label ?? "No sales yet",
        build: () => ({
          title: "Most-Sold Goods",
          subtitle: `${formatDate(from)} – ${formatDate(to)} (approx. value)`,
          columns: [
            { key: "label", label: "Item" },
            { key: "qty", label: "Qty", align: "right" },
            { key: "value", label: "Value", money: true },
          ],
          rows: mostSoldGoodsData.map((r) => ({ label: r.label, qty: r.qty, value: r.value })),
          totals: { value: mostSoldGoodsData.reduce((s, r) => s + r.value, 0) },
        }),
      },
      {
        key: "diamondVsJewelry",
        label: "Diamond vs Jewellery Share",
        icon: Gem,
        tone: "navy",
        headline: diamondVsJewelryData[0] ? formatMoney(diamondVsJewelryData[0].value) : formatMoney(0),
        hint: diamondVsJewelryData[0]?.label ?? "No sales yet",
        build: () => ({
          title: "Diamond vs Jewellery Share",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: [
            { key: "label", label: "Kind" },
            { key: "value", label: "Sales", money: true },
          ],
          rows: diamondVsJewelryData.map((r) => ({ label: r.label, value: r.value })),
          totals: { value: diamondVsJewelryData.reduce((s, r) => s + r.value, 0) },
        }),
      },
      {
        key: "salary",
        label: "Salary & Incentives",
        icon: ScrollText,
        tone: "navy",
        headline: formatMoney(teamPaid),
        hint: `${teamRows.length} payments`,
        build: () => ({
          title: "Salary & Incentives",
          subtitle: `${formatDate(from)} – ${formatDate(to)}`,
          columns: [
            { key: "date", label: "Date", date: true },
            { key: "memberName", label: "Member" },
            { key: "type", label: "Type" },
            { key: "amount", label: "Amount", money: true },
            { key: "paid", label: "Paid" },
          ],
          rows: teamRows.map((p) => ({
            date: p.date,
            memberName: p.memberName,
            type: teamTypeLabel(p.type),
            amount: p.amount,
            paid: p.paid ? "Yes" : "No",
          })),
          totals: { amount: teamRows.reduce((s, p) => s + p.amount, 0) },
        }),
      },
    ];
    return list;
  }, [
    salesRows,
    purchaseRows,
    expenseTx,
    bankTx,
    cashTx,
    drawingTx,
    uchhinaFilteredRows,
    liabilityViews,
    capitalViews,
    stockDiamond,
    stockGold,
    sellerGroupsData,
    platformGroupsData,
    teamRows,
    plModel,
    salesModel.payments,
    purchaseModel.payments,
    store.bankAccounts,
    store.cashLocations,
    store.parties,
    from,
    to,
    partyFilter,
  ]);

  const active = reports.find((r) => r.key === viewKey) ?? null;
  const activeTable = active ? active.build() : null;

  const filtersActive =
    accountFilter !== "all" || partyFilter !== "all" || statusFilter !== "all" || !!search;

  return (
    <div className="w-full max-w-full space-y-4 overflow-x-hidden pb-8">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-bold text-navy sm:text-xl lg:text-2xl">
          Reports &amp; Analysis
        </h1>
      </div>

      <FilterBar
        from={from}
        to={to}
        preset={shell.preset}
        setPreset={shell.setPreset}
        customFrom={shell.customFrom}
        customTo={shell.customTo}
        setCustomFrom={shell.setCustomFrom}
        setCustomTo={shell.setCustomTo}
        fyOptions={fyOptions}
        accounts={accounts}
        accountFilter={accountFilter}
        setAccountFilter={setAccountFilter}
        parties={store.parties}
        partyFilter={partyFilter}
        setPartyFilter={setPartyFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        search={search}
        setSearch={setSearch}
        clearAll={clearAll}
        filtersActive={filtersActive}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "centre" | "analysis")}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:flex sm:h-9 sm:w-auto sm:flex-wrap">
          <TabsTrigger value="centre" className="text-xs sm:text-sm">
            Report Centre
          </TabsTrigger>
          <TabsTrigger value="analysis" className="text-xs sm:text-sm">
            Analysis
          </TabsTrigger>
        </TabsList>
        <TabsContent value="centre">
          {tab === "centre" ? <ReportCentre reports={reports} onView={setViewKey} /> : null}
        </TabsContent>
        <TabsContent value="analysis">
          {tab === "analysis" ? (
            <Analysis
              plModel={plModel}
              salesRows={salesRows}
              purchaseRows={purchaseRows}
              expenseTx={expenseTx}
              sellerGroupsData={sellerGroupsData}
              platformGroupsData={platformGroupsData}
              stockDiamond={stockDiamond}
              stockGold={stockGold}
              today={today}
              from={from}
              to={to}
              onView={setViewKey}
            />
          ) : null}
        </TabsContent>
      </Tabs>

      {active && activeTable ? (
        <ModalShell
          open={!!active}
          onClose={() => setViewKey(null)}
          title={activeTable.title}
          subtitle={activeTable.subtitle}
          width="max-w-[1100px]"
          footer={<DownloadMenu build={() => activeTable} label="Download" />}
        >
          <ReportTable table={activeTable} />
        </ModalShell>
      ) : null}
    </div>
  );
}

/* ---------------- filter bar ---------------- */

function FilterBar(props: {
  from: string;
  to: string;
  preset: Preset;
  setPreset: (p: Preset) => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (v: string) => void;
  setCustomTo: (v: string) => void;
  fyOptions: { id: string; label: string; from: string; to: string }[];
  accounts: { id: string; label: string }[];
  accountFilter: string;
  setAccountFilter: (v: string) => void;
  parties: { id: string; name: string }[];
  partyFilter: string;
  setPartyFilter: (v: string) => void;
  statusFilter: "all" | InvoiceStatus;
  setStatusFilter: (v: "all" | InvoiceStatus) => void;
  search: string;
  setSearch: (v: string) => void;
  clearAll: () => void;
  filtersActive: boolean;
}) {
  const {
    from,
    to,
    preset,
    setPreset,
    customFrom,
    customTo,
    setCustomFrom,
    setCustomTo,
    fyOptions,
    accounts,
    accountFilter,
    setAccountFilter,
    parties,
    partyFilter,
    setPartyFilter,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    clearAll,
    filtersActive,
  } = props;

  const accountLabelOf = accounts.find((a) => a.id === accountFilter)?.label;
  const partyLabelOf = parties.find((p) => p.id === partyFilter)?.name;

  return (
    <div className="w-full max-w-full space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="relative min-w-0 sm:hidden">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="h-9 w-full text-xs"
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
          <SelectTrigger aria-label="Date period" className="h-9 w-full text-xs sm:w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {preset === "custom" ? (
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-9 w-full text-xs sm:w-[130px]"
            />
            <span className="shrink-0 text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-9 w-full text-xs sm:w-[130px]"
            />
          </div>
        ) : null}
        <Select
          value="_fy"
          onValueChange={(id) => {
            const fy = fyOptions.find((f) => f.id === id);
            if (!fy) return;
            setCustomFrom(fy.from);
            setCustomTo(fy.to);
            setPreset("custom");
          }}
        >
          <SelectTrigger aria-label="Financial year" className="h-9 w-full text-xs sm:w-[130px]">
            <SelectValue placeholder="Financial Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_fy" disabled>
              Financial Year
            </SelectItem>
            {fyOptions.map((fy) => (
              <SelectItem key={fy.id} value={fy.id}>
                {fy.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger aria-label="Account" className="h-9 w-full text-xs sm:w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={partyFilter} onValueChange={setPartyFilter}>
          <SelectTrigger aria-label="Customer / Supplier" className="h-9 w-full text-xs sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Parties</SelectItem>
            {parties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | InvoiceStatus)}
        >
          <SelectTrigger aria-label="Status" className="h-9 w-full text-xs sm:w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="hidden h-9 text-xs sm:block sm:w-[200px]"
        />
      </div>
      {filtersActive || accountLabelOf || partyLabelOf ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {formatDate(from)} – {formatDate(to)}
          </span>
          {accountFilter !== "all" && accountLabelOf ? (
            <RemovableChip onRemove={() => setAccountFilter("all")}>{accountLabelOf}</RemovableChip>
          ) : null}
          {partyFilter !== "all" && partyLabelOf ? (
            <RemovableChip onRemove={() => setPartyFilter("all")}>{partyLabelOf}</RemovableChip>
          ) : null}
          {statusFilter !== "all" ? (
            <RemovableChip onRemove={() => setStatusFilter("all")}>
              {STATUS_OPTIONS.find((s) => s.value === statusFilter)?.label}
            </RemovableChip>
          ) : null}
          {search ? <RemovableChip onRemove={() => setSearch("")}>"{search}"</RemovableChip> : null}
          {filtersActive ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] font-medium text-navy underline"
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RemovableChip({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-sl-total-bg px-2 py-0.5 text-[11px] font-medium text-sl-total">
      {children}
      <button type="button" onClick={onRemove} aria-label="Remove filter">
        <X className="size-3" />
      </button>
    </span>
  );
}

/* ---------------- report centre ---------------- */

function ReportCentre({
  reports,
  onView,
}: {
  reports: ReportDef[];
  onView: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-3">
      {reports.map((r) => {
        const Icon = r.icon;
        return (
          <div key={r.key} className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <StatCard
              label={r.label}
              value={r.headline}
              hint={r.hint}
              tone={r.tone}
              icon={<Icon className="size-4" />}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onView(r.key)}
                className="text-xs font-semibold text-navy underline"
              >
                View
              </button>
              <DownloadMenu build={r.build} label="" size="sm" />
              {r.link ? (
                <Link to={r.link} className="text-[11px] text-muted-foreground underline">
                  Full page
                </Link>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- table renderer ---------------- */

function ReportTable({ table }: { table: ExportTable }) {
  const paged = usePaged(table.rows, 25);
  if (!table.rows.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No data for the selected filters.
      </p>
    );
  }
  const cell = (col: ExportTable["columns"][number], row: Record<string, unknown>) => {
    const v = row[col.key];
    if (v === undefined || v === null || v === "") return "—";
    if (col.money) return formatMoney(Number(v));
    if (col.date) return formatDate(String(v));
    return String(v);
  };
  return (
    <div>
      {table.summary?.length ? (
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {table.summary.map((s) => (
            <span key={s.label}>
              <b className="text-navy">{s.label}:</b> {s.value}
            </span>
          ))}
        </div>
      ) : null}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {table.columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-3 py-2 text-left font-semibold",
                    (c.align === "right" || c.money) && "text-right",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.slice.map((row, i) => (
              <tr key={i} className="border-t border-border">
                {table.columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-2",
                      (c.align === "right" || c.money) && "num text-right",
                    )}
                  >
                    {cell(c, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {table.totals ? (
            <tfoot>
              <tr className="border-t-2 border-gold bg-muted/40 font-semibold">
                {table.columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-2",
                      (c.align === "right" || c.money) && "num text-right",
                    )}
                  >
                    {table.totals?.[c.key] !== undefined
                      ? cell(c, table.totals as Record<string, unknown>)
                      : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <div className="space-y-2 sm:hidden">
        {paged.slice.map((row, i) => (
          <div key={i} className="rounded-lg border border-border bg-muted/20 p-2.5">
            {table.columns.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-2 py-0.5 text-xs">
                <span className="text-muted-foreground">{c.label}</span>
                <span className={cn("text-right font-medium text-navy", c.money && "num")}>
                  {cell(c, row)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <Pager
        page={paged.page}
        pages={paged.pages}
        total={paged.total}
        next={paged.next}
        prev={paged.prev}
      />
    </div>
  );
}

/* ---------------- outstanding grouping helper ---------------- */

function groupOutstanding(
  rows: {
    pending: number;
    received?: number;
    paid?: number;
    invoice?: { partyId: string; total: number };
    bill?: { partyId: string; total: number };
  }[],
  parties: { id: string; name: string }[],
  _kind: "customer" | "supplier",
) {
  const map = new Map<
    string,
    { name: string; count: number; total: number; settled: number; pending: number }
  >();
  for (const r of rows as any[]) {
    const partyId: string = r.invoice ? r.invoice.partyId : r.bill.partyId;
    const total: number = r.invoice ? r.invoice.total : r.bill.total;
    const settled: number = r.invoice ? r.received : r.paid;
    const entry = map.get(partyId) ?? {
      name: parties.find((p) => p.id === partyId)?.name ?? "Unknown",
      count: 0,
      total: 0,
      settled: 0,
      pending: 0,
    };
    entry.count += 1;
    entry.total += total;
    entry.settled += settled ?? 0;
    entry.pending += r.pending;
    map.set(partyId, entry);
  }
  return [...map.values()].filter((r) => r.pending > 0).sort((a, b) => b.pending - a.pending);
}

/* ---------------- analysis tab ---------------- */

const PIE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "#8fb4e3",
  "#c9a7e8",
  "#f2b8c6",
];

function sumByLabel<T>(rows: T[], keyFn: (r: T) => string, valFn: (r: T) => number) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = keyFn(r) || "Unknown";
    map.set(k, (map.get(k) ?? 0) + valFn(r));
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value: round2(value) }))
    .sort((a, b) => b.value - a.value);
}

function Analysis({
  plModel,
  salesRows,
  purchaseRows,
  expenseTx,
  sellerGroupsData,
  platformGroupsData,
  stockDiamond,
  stockGold,
  today,
  onView,
}: {
  plModel: { revenue: number; purchases: number; expenses: number; gross: number; net: number };
  salesRows: InvoiceView[];
  purchaseRows: BillView[];
  expenseTx: Transaction[];
  sellerGroupsData: ReturnType<typeof sellerGroups>;
  platformGroupsData: ReturnType<typeof platformGroups>;
  stockDiamond: ReturnType<typeof buildStockView>;
  stockGold: ReturnType<typeof buildStockView>;
  today: string;
  from?: string;
  to?: string;
  onView: (key: string) => void;
}) {
  const salesTotal = salesRows.reduce((s, v) => s + v.invoice.total, 0);
  const purchasesTotal = purchaseRows.reduce((s, v) => s + v.bill.total, 0);
  const receivedTotal = salesRows.reduce((s, v) => s + v.received, 0);
  const pendingTotal = salesRows.reduce((s, v) => s + v.pending, 0);
  const maxSP = Math.max(salesTotal, purchasesTotal, 1);

  const aging = { b0: 0, b30: 0, b60: 0, b90: 0 };
  for (const v of [...salesRows, ...purchaseRows]) {
    const pending = v.pending;
    if (pending <= 0) continue;
    const due = "invoice" in v ? v.invoice.dueDate : (v as any).bill.dueDate;
    const days = due
      ? Math.floor((new Date(today).getTime() - new Date(due).getTime()) / 86400000)
      : 0;
    if (days <= 30) aging.b0 += pending;
    else if (days <= 60) aging.b30 += pending;
    else if (days <= 90) aging.b60 += pending;
    else aging.b90 += pending;
  }
  const agingMax = Math.max(aging.b0, aging.b30, aging.b60, aging.b90, 1);

  const expenseByHead = new Map<string, number>();
  for (const t of expenseTx) {
    const head = expenseHead(t.expenseCategory);
    expenseByHead.set(head, (expenseByHead.get(head) ?? 0) + t.amount);
  }
  const topExpenses = [...expenseByHead.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topExpenseMax = Math.max(...topExpenses.map(([, v]) => v), 1);

  const stockValue = stockDiamond.totalValue + stockGold.totalValue;

  const monthMap = new Map<string, { sales: number; purchases: number; expenses: number }>();
  const bucket = (d: string) => {
    const key = d.slice(0, 7);
    const entry = monthMap.get(key) ?? { sales: 0, purchases: 0, expenses: 0 };
    monthMap.set(key, entry);
    return entry;
  };
  for (const v of salesRows) bucket(v.invoice.date).sales += v.invoice.total;
  for (const v of purchaseRows) bucket(v.bill.date).purchases += v.bill.total;
  for (const t of expenseTx) bucket(t.date).expenses += t.amount;
  const trendData = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, v]) => ({
      label: key,
      sales: round2(v.sales),
      purchases: round2(v.purchases),
      profit: round2(v.sales - v.purchases - v.expenses),
    }));

  const topCustomers = sumByLabel(
    salesRows,
    (v) => v.customer?.name ?? "Unknown",
    (v) => v.invoice.total,
  ).slice(0, 8);
  const customerCountry = sumByLabel(
    salesRows,
    (v) => v.customer?.country?.trim() || "Unknown",
    (v) => v.invoice.total,
  );
  const diamondVsJewelry = sumByLabel(
    salesRows,
    (v) => (v.invoice.invoiceKind === "jewelry" ? "Jewellery" : "Diamond"),
    (v) => v.invoice.total,
  );
  const goodsAgg = new Map<string, number>();
  for (const v of salesRows) {
    for (const l of v.invoice.lines ?? []) {
      const key = l.description?.trim() || "Diamond item";
      goodsAgg.set(key, (goodsAgg.get(key) ?? 0) + (l.carat || l.quantity || 1) * (l.rate || 0));
    }
    for (const j of v.invoice.jewelryItems ?? []) {
      const key = j.description?.trim() || "Jewelry item";
      goodsAgg.set(key, (goodsAgg.get(key) ?? 0) + (j.total || 0));
    }
  }
  const mostSoldGoods = [...goodsAgg.entries()]
    .map(([label, value]) => ({ label, value: round2(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-3">
      <AnalysisCard title="Sales vs Purchases" onClick={() => onView("sales")}>
        <BarRow label="Sales" value={salesTotal} max={maxSP} tone="blue" />
        <BarRow label="Purchases" value={purchasesTotal} max={maxSP} tone="orange" />
      </AnalysisCard>

      <AnalysisCard title="Gross & Net Profit" onClick={() => onView("pl")}>
        <BarRow
          label="Gross Profit"
          value={plModel.gross}
          max={Math.max(Math.abs(plModel.gross), Math.abs(plModel.net), 1)}
          tone="green"
        />
        <BarRow
          label="Net Profit"
          value={plModel.net}
          max={Math.max(Math.abs(plModel.gross), Math.abs(plModel.net), 1)}
          tone="navy"
        />
      </AnalysisCard>

      <AnalysisCard title="Income vs Expenses" onClick={() => onView("expenses")}>
        <BarRow
          label="Income"
          value={salesTotal}
          max={Math.max(salesTotal, plModel.expenses, 1)}
          tone="blue"
        />
        <BarRow
          label="Expenses"
          value={plModel.expenses}
          max={Math.max(salesTotal, plModel.expenses, 1)}
          tone="red"
        />
      </AnalysisCard>

      <AnalysisCard title="Sales — Paid vs Pending" onClick={() => onView("sales")}>
        <BarRow
          label="Received"
          value={receivedTotal}
          max={Math.max(receivedTotal, pendingTotal, 1)}
          tone="green"
        />
        <BarRow
          label="Pending"
          value={pendingTotal}
          max={Math.max(receivedTotal, pendingTotal, 1)}
          tone="red"
        />
      </AnalysisCard>

      <AnalysisCard title="Customer / Supplier Aging" onClick={() => onView("pending")}>
        <BarRow label="0-30 days" value={aging.b0} max={agingMax} tone="green" />
        <BarRow label="31-60 days" value={aging.b30} max={agingMax} tone="yellow" />
        <BarRow label="61-90 days" value={aging.b60} max={agingMax} tone="orange" />
        <BarRow label="90+ days" value={aging.b90} max={agingMax} tone="red" />
      </AnalysisCard>

      <AnalysisCard title="Seller Performance" onClick={() => onView("sellerWise")}>
        {sellerGroupsData.slice(0, 5).map((g) => (
          <BarRow
            key={g.key}
            label={g.label}
            value={g.sales}
            max={sellerGroupsData[0]?.sales || 1}
            tone="blue"
          />
        ))}
        {!sellerGroupsData.length ? (
          <p className="text-xs text-muted-foreground">No data.</p>
        ) : null}
      </AnalysisCard>

      <AnalysisCard title="Platform Performance" onClick={() => onView("platformWise")}>
        {platformGroupsData
          .filter((g) => g.sales > 0)
          .slice(0, 5)
          .map((g) => (
            <BarRow
              key={g.key}
              label={g.label}
              value={g.sales}
              max={platformGroupsData[0]?.sales || 1}
              tone="purple"
            />
          ))}
        {!platformGroupsData.some((g) => g.sales > 0) ? (
          <p className="text-xs text-muted-foreground">No data.</p>
        ) : null}
      </AnalysisCard>

      <AnalysisCard title="Highest Expense Categories" onClick={() => onView("expenses")}>
        {topExpenses.map(([label, value]) => (
          <BarRow key={label} label={label} value={value} max={topExpenseMax} tone="red" />
        ))}
        {!topExpenses.length ? <p className="text-xs text-muted-foreground">No expenses.</p> : null}
      </AnalysisCard>

      <AnalysisCard title="Stock Value" onClick={() => onView("stock")}>
        <BarRow
          label="Diamond"
          value={stockDiamond.totalValue}
          max={Math.max(stockValue, 1)}
          tone="blue"
        />
        <BarRow
          label="Gold"
          value={stockGold.totalValue}
          max={Math.max(stockValue, 1)}
          tone="yellow"
        />
      </AnalysisCard>

      <AnalysisCard title="Sales & Profit Trend" onClick={() => onView("sales")} wide>
        {trendData.length ? (
          <div className="h-48 w-full sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <RTooltip formatter={(v: number) => formatMoney(v)} />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  dot={{ r: 2, onClick: () => onView("sales") }}
                  name="Sales"
                />
                <Line
                  type="monotone"
                  dataKey="purchases"
                  stroke="var(--color-chart-4)"
                  strokeWidth={2}
                  dot={{ r: 2, onClick: () => onView("purchases") }}
                  name="Purchases"
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke="var(--color-chart-3)"
                  strokeWidth={2}
                  dot={{ r: 2, onClick: () => onView("pl") }}
                  name="Net Profit"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No data for the selected period.</p>
        )}
      </AnalysisCard>

      <AnalysisCard title="Top Customers" onClick={() => onView("topCustomers")}>
        {topCustomers.length ? (
          <div className="h-44 w-full sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topCustomers}
                layout="vertical"
                margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 10 }} hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={90}
                  tick={{ fontSize: 10 }}
                  interval={0}
                />
                <RTooltip formatter={(v: number) => formatMoney(v)} />
                <Bar
                  dataKey="value"
                  radius={[0, 4, 4, 0]}
                  onClick={() => onView("topCustomers")}
                  cursor="pointer"
                >
                  {topCustomers.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No sales yet.</p>
        )}
      </AnalysisCard>

      <AnalysisCard title="Customer Value by Country" onClick={() => onView("customerCountry")}>
        {customerCountry.length ? (
          <div className="h-44 w-full sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={customerCountry}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  onClick={() => onView("customerCountry")}
                  cursor="pointer"
                  label={({ label }: { label: string }) => label}
                  labelLine={false}
                >
                  {customerCountry.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip formatter={(v: number) => formatMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No sales yet.</p>
        )}
      </AnalysisCard>

      <AnalysisCard title="Most-Sold Goods" onClick={() => onView("mostSoldGoods")}>
        {mostSoldGoods.length ? (
          <div className="h-44 w-full sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={mostSoldGoods}
                layout="vertical"
                margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 10 }} hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={90}
                  tick={{ fontSize: 10 }}
                  interval={0}
                />
                <RTooltip formatter={(v: number) => formatMoney(v)} />
                <Bar
                  dataKey="value"
                  radius={[0, 4, 4, 0]}
                  onClick={() => onView("mostSoldGoods")}
                  cursor="pointer"
                >
                  {mostSoldGoods.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No sales yet.</p>
        )}
      </AnalysisCard>

      <AnalysisCard title="Diamond vs Jewellery Share" onClick={() => onView("diamondVsJewelry")}>
        {diamondVsJewelry.some((d) => d.value > 0) ? (
          <div className="h-44 w-full sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={diamondVsJewelry}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={70}
                  onClick={() => onView("diamondVsJewelry")}
                  cursor="pointer"
                  label={({ label }: { label: string }) => label}
                  labelLine={false}
                >
                  {diamondVsJewelry.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip formatter={(v: number) => formatMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No sales yet.</p>
        )}
      </AnalysisCard>
    </div>
  );
}

function AnalysisCard({
  title,
  children,
  onClick,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border bg-card p-3 text-left shadow-sm transition hover:shadow-md",
        wide ? "sm:col-span-2 xl:col-span-3" : "",
      )}
    >
      <p className="mb-2 text-xs font-semibold text-navy">{title}</p>
      <div className="space-y-2">{children}</div>
    </button>
  );
}

function BarRow({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: Tone;
}) {
  const pct = max > 0 ? (Math.abs(value) / max) * 100 : 0;
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[11px]">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="num font-medium text-navy">{formatMoney(value)}</span>
      </div>
      <ProgressBar percent={pct} tone={tone} />
    </div>
  );
}
