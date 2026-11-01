import { buildSalesModel, matchInvoice, statusOf, STATUS_LABEL, type BuildInput, type InvoiceView } from './sales';
import { round2 } from './format';
import { isoWeekKey } from './period';
import type { ExportColumn, ExportRow, ExportTable } from './exportTable';

export type ReportKind = 'invoices' | 'payments' | 'advances' | 'customers' | 'platforms' | 'sellers' | 'aging' | 'items' | 'tax' | 'trend' | 'comparison' | 'financial';
export const REPORT_KINDS: { id: ReportKind; label: string }[] = [
  { id: 'invoices', label: 'Invoice Register' }, { id: 'payments', label: 'Payment Receipts' },
  { id: 'advances', label: 'Customer Advances' }, { id: 'customers', label: 'Customer Analysis' },
  { id: 'platforms', label: 'Platform Performance' }, { id: 'sellers', label: 'Seller Performance' },
  { id: 'aging', label: 'Outstanding & Aging' }, { id: 'items', label: 'Item & Carat Analysis' },
  { id: 'tax', label: 'Tax & Adjustments' }, { id: 'trend', label: 'Date-Wise Sales' },
  { id: 'comparison', label: 'Period Comparison' }, { id: 'financial', label: 'Sales Financial Summary' },
];
export interface ReportFilters {
  from: string; to: string; customer: string; platform: string; seller: string;
  status: string; saleType: string; search: string; min: string; max: string;
  group: 'day' | 'week' | 'month';
}
const sum = (rows: ExportRow[], key: string) => round2(rows.reduce((s, r) => s + Number(r[key] ?? 0), 0));
const col = (key: string, label: string, money = false): ExportColumn => ({ key, label, money });
const monetary = [col('sales', 'Sales (INR)', true), col('received', 'Allocated received (INR)', true), col('pending', 'Outstanding (INR)', true)];
const dayMs = 86400000;
export function comparisonRange(from: string, to: string, mode: 'previous' | 'year'): [string, string] {
  const a = new Date(`${from}T00:00:00Z`), b = new Date(`${to}T00:00:00Z`);
  if (mode === 'year') {
    const back = (d: Date) => {
      const year = d.getUTCFullYear() - 1, month = d.getUTCMonth();
      return new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate()))).toISOString().slice(0, 10);
    };
    return [back(a), back(b)];
  }
  const days = Math.round((b.getTime() - a.getTime()) / dayMs) + 1;
  return [new Date(a.getTime() - days * dayMs).toISOString().slice(0, 10), new Date(a.getTime() - dayMs).toISOString().slice(0, 10)];
}
export function buildAdvancedSalesReports(input: BuildInput, f: ReportFilters) {
  const model = buildSalesModel({ ...input, asOf: f.to });
  for (const view of model.invoices) view.status = statusOf(view.invoice, view.received, f.to);
  const matches = (v: InvoiceView) =>
    (f.customer === 'all' || v.invoice.partyId === f.customer) &&
    (f.platform === 'all' || (v.invoice.platform?.trim() || 'Pure Sale/Direct') === f.platform) &&
    (f.seller === 'all' || (v.invoice.sellerName?.trim() || 'Unassigned') === f.seller) &&
    (f.status === 'all' || v.status === f.status) &&
    (f.saleType === 'all' || v.invoice.saleType === f.saleType) &&
    (!f.min || v.invoice.total >= Number(f.min)) && (!f.max || v.invoice.total <= Number(f.max)) &&
    matchInvoice(v, f.search.trim().toLowerCase());
  const views = model.invoices.filter(v => v.invoice.date >= f.from && matches(v));
  const invoiceIds = new Set(views.map(v => v.invoice.id));
  const narrowInvoice = f.platform !== 'all' || f.seller !== 'all' || f.status !== 'all' || f.saleType !== 'all' || Boolean(f.min || f.max);
  // Receipt reports follow receipt date, not invoice date. Unallocated money has no platform/seller attribution.
  const attributableIds = new Set(model.invoices.filter(matches).map(v => v.invoice.id));
  const payments = model.payments.filter(p => p.date >= f.from && (f.customer === 'all' || p.partyId === f.customer) &&
    (!narrowInvoice || input.transactions.find(t => t.id === p.id)?.allocations?.some(a => attributableIds.has(a.invoiceId))) &&
    (!f.search.trim() || `${p.code} ${p.reference} ${p.account} ${input.parties.find(c => c.id === p.partyId)?.name ?? ''} ${p.amount} ${(input.transactions.find(t => t.id === p.id)?.allocations ?? []).map(a => model.byId.get(a.invoiceId)?.invoice.number ?? '').join(' ')}`.toLowerCase().includes(f.search.trim().toLowerCase())));
  const paymentRows: ExportRow[] = payments.map(p => ({ date: p.date, code: p.code, customer: input.parties.find(c => c.id === p.partyId)?.name ?? 'Unknown customer', account: p.account, reference: p.reference,
    invoices: (input.transactions.find(t => t.id === p.id)?.allocations ?? []).map(a => model.byId.get(a.invoiceId)?.invoice.number).filter(Boolean).join(', '),
    amount: narrowInvoice ? round2((input.transactions.find(t => t.id === p.id)?.allocations ?? []).filter(a => attributableIds.has(a.invoiceId)).reduce((s, a) => s + a.amount, 0)) : p.amount, allocated: narrowInvoice ? round2((input.transactions.find(t => t.id === p.id)?.allocations ?? []).filter(a => attributableIds.has(a.invoiceId)).reduce((s, a) => s + a.amount, 0)) : p.allocated, advance: narrowInvoice ? 0 : p.advance }));
  const advanceRows = narrowInvoice ? [] : paymentRows.filter(p => Number(p['advance']) > 0);
  const invoiceRows: ExportRow[] = views.map(v => ({ id: v.invoice.id, date: v.invoice.date, number: v.invoice.number, customer: v.customer?.name ?? 'Unknown customer', platform: v.invoice.platform?.trim() || 'Pure Sale/Direct', seller: v.invoice.sellerName || 'Unassigned', type: v.invoice.saleType ?? '', due: v.invoice.dueDate ?? '', sales: v.invoice.total, received: v.received, pending: v.pending, status: STATUS_LABEL[v.status] }));
  function grouped(pick: (v: InvoiceView) => string) {
    const groups = new Map<string, InvoiceView[]>();
    for (const v of views) { const key = pick(v); groups.set(key, [...(groups.get(key) ?? []), v]); }
    return [...groups].map(([name, list]): ExportRow => {
      const sales = round2(list.reduce((s, v) => s + v.invoice.total, 0));
      const received = round2(list.reduce((s, v) => s + v.received, 0));
      return { name, count: list.length, customers: new Set(list.map(v => v.invoice.partyId)).size, sales, received, pending: round2(list.reduce((s, v) => s + v.pending, 0)), average: round2(sales / list.length), collection: sales > 0 ? round2(received / sales * 100) : 0 };
    }).sort((a, b) => Number(b['sales']) - Number(a['sales']));
  }
  const platforms = grouped(v => v.invoice.platform?.trim() || 'Pure Sale/Direct');
  const sellers = grouped(v => v.invoice.sellerName?.trim() || 'Unassigned');
  const customerIds = new Set([...views.map(v => v.invoice.partyId), ...payments.filter(p => !narrowInvoice && p.advance > 0).map(p => p.partyId).filter((id): id is string => Boolean(id))]);
  const customers: ExportRow[] = [...customerIds].map(id => {
    const list = views.filter(v => v.invoice.partyId === id), party = input.parties.find(p => p.id === id);
    const sales = round2(list.reduce((s, v) => s + v.invoice.total, 0));
    return { name: party?.name ?? 'Unknown customer', country: party?.country ?? '', city: party?.city ?? '', count: list.length, sales, received: round2(list.reduce((s, v) => s + v.received, 0)), pending: round2(list.reduce((s, v) => s + v.pending, 0)), advance: narrowInvoice ? 0 : round2(payments.filter(p => p.partyId === id).reduce((s, p) => s + p.advance, 0)), average: list.length ? round2(sales / list.length) : 0, repeat: list.length > 1 ? 'Repeat' : list.length ? 'Single invoice' : 'Advance only' };
  }).sort((a, b) => Number(b['sales']) - Number(a['sales']));
  const aging: ExportRow[] = views.filter(v => v.pending > 0).map(v => {
    const days = v.invoice.dueDate ? Math.max(0, Math.floor((new Date(f.to).getTime() - new Date(v.invoice.dueDate).getTime()) / dayMs)) : 0;
    return { number: v.invoice.number, customer: v.customer?.name ?? 'Unknown customer', date: v.invoice.date, due: v.invoice.dueDate ?? '', days, bucket: !v.invoice.dueDate ? 'No due date' : days === 0 ? 'Not overdue' : days <= 30 ? '1–30 days' : days <= 60 ? '31–60 days' : days <= 90 ? '61–90 days' : '90+ days', pending: v.pending };
  });
  const items: ExportRow[] = views.flatMap(v => [
    ...(v.invoice.lines ?? []).map(l => ({ number: v.invoice.number, customer: v.customer?.name ?? '', description: l.description, kind: 'Diamond', quantity: l.quantity, carats: l.carat, amount: l.total ?? l.carat * l.rate, currency: v.invoice.currency ?? 'INR' })),
    ...(v.invoice.jewelryItems ?? []).map(l => ({ number: v.invoice.number, customer: v.customer?.name ?? '', description: l.description, kind: 'Jewelry', quantity: 1, carats: round2(l.stones.reduce((s, st) => s + st.carat, 0)), amount: l.total, currency: v.invoice.currency ?? 'INR' })),
  ]);
  const tax: ExportRow[] = views.map(v => ({ number: v.invoice.number, date: v.invoice.date, customer: v.customer?.name ?? '', gst: v.invoice.gstType ?? 'non_gst', rate: v.invoice.gstRate ?? 0, subtotal: v.invoice.subtotal ?? 0, discount: v.invoice.discount ?? 0, taxable: v.invoice.taxableAmount ?? 0, tax: v.invoice.taxAmount ?? 0, shipping: v.invoice.shipping ?? 0, roundOff: v.invoice.roundOff ?? 0, sales: v.invoice.total }));
  const trend = grouped(v => f.group === 'day' ? v.invoice.date : f.group === 'week' ? isoWeekKey(v.invoice.date) : v.invoice.date.slice(0, 7)).sort((a, b) => String(a['name']).localeCompare(String(b['name'])));
  const summary = { sales: sum(invoiceRows, 'sales'), received: sum(invoiceRows, 'received'), pending: sum(invoiceRows, 'pending'), receipts: sum(paymentRows, 'amount'), advance: sum(advanceRows, 'advance'), count: views.length, customers: new Set(views.map(v => v.invoice.partyId)).size, carats: sum(items, 'carats') };
  const financial: ExportRow[] = [
    { metric: 'Sales invoice total', amount: summary.sales }, { metric: 'Allocated receipts on selected invoices', amount: summary.received }, { metric: 'Outstanding on selected invoices', amount: summary.pending },
    { metric: 'Receipts by payment date', amount: summary.receipts }, { metric: 'Unallocated receipts by payment date', amount: summary.advance },
    { metric: 'Discounts (INR)', amount: sum(tax, 'discount') }, { metric: 'Tax (INR)', amount: sum(tax, 'tax') }, { metric: 'Shipping (INR)', amount: sum(tax, 'shipping') }, { metric: 'Round-off (INR)', amount: sum(tax, 'roundOff') },
  ];
  const groupColumns = [col('name', 'Name'), col('count', 'Invoices'), col('customers', 'Customers'), ...monetary, col('average', 'Avg invoice (INR)', true), col('collection', 'Collection %')];
  const tables: Partial<Record<ReportKind, ExportTable>> = {
    invoices: { title: 'Invoice Register', columns: [col('date', 'Date'), col('number', 'Invoice'), col('customer', 'Customer'), col('platform', 'Platform'), col('seller', 'Seller'), col('type', 'Sale type'), col('due', 'Due date'), ...monetary, col('status', 'Status')], rows: invoiceRows },
    payments: { title: 'Payment Receipts', columns: [col('date', 'Payment date'), col('code', 'Payment'), col('customer', 'Customer'), col('account', 'Account'), col('reference', 'Reference'), col('invoices', 'Linked invoices'), col('amount', 'Receipt (INR)', true), col('allocated', 'Allocated (INR)', true), col('advance', 'Advance (INR)', true)], rows: paymentRows },
    advances: { title: 'Customer Advances', columns: [col('date', 'Payment date'), col('code', 'Payment'), col('customer', 'Customer'), col('account', 'Account'), col('reference', 'Reference'), col('advance', 'Advance (INR)', true)], rows: advanceRows },
    customers: { title: 'Customer Analysis', columns: [col('name', 'Customer'), col('country', 'Country'), col('city', 'City'), col('count', 'Invoices'), ...monetary, col('advance', 'Period advance (INR)', true), col('average', 'Avg invoice (INR)', true), col('repeat', 'Purchase frequency')], rows: customers },
    platforms: { title: 'Platform Performance', columns: groupColumns, rows: platforms }, sellers: { title: 'Seller Performance', columns: groupColumns, rows: sellers },
    aging: { title: 'Outstanding & Aging', columns: [col('number', 'Invoice'), col('customer', 'Customer'), col('date', 'Invoice date'), col('due', 'Due date'), col('days', 'Days past due'), col('bucket', 'Aging'), col('pending', 'Outstanding (INR)', true)], rows: aging },
    items: { title: 'Item & Carat Analysis', columns: [col('number', 'Invoice'), col('customer', 'Customer'), col('description', 'Item'), col('kind', 'Kind'), col('quantity', 'Quantity'), col('carats', 'Carats'), col('amount', 'Item amount (invoice currency)'), col('currency', 'Currency')], rows: items },
    tax: { title: 'Tax & Adjustments', columns: [col('number', 'Invoice'), col('date', 'Date'), col('customer', 'Customer'), col('gst', 'GST type'), col('rate', 'GST %'), ...['subtotal', 'discount', 'taxable', 'tax', 'shipping', 'roundOff', 'sales'].map(k => col(k, `${k} (INR)`, true))], rows: tax },
    trend: { title: 'Date-Wise Sales', columns: groupColumns, rows: trend }, financial: { title: 'Sales Financial Summary', columns: [col('metric', 'Metric'), col('amount', 'Amount (INR)', true)], rows: financial },
  };
  return { summary, tables, trend, platforms, aging, views, invoiceIds };
}