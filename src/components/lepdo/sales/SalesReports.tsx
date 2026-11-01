import { useMemo, useState } from 'react';
import { BarChart, Bar, CartesianGrid, Legend, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, FileText, Search, RotateCcw, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLepdo } from '@/lib/lepdo/store';
import { useShell } from '@/components/lepdo/shell-context';
import { formatDate, formatMoney, todayISO, round2 } from '@/lib/lepdo/format';
import { rangeFor, PRESETS, type Preset } from '@/lib/lepdo/period';
import { buildAdvancedSalesReports, comparisonRange, REPORT_KINDS, type ReportFilters, type ReportKind } from '@/lib/lepdo/advancedSalesReports';
import { exportAdvancedReport } from '@/lib/lepdo/advancedReportExport';
import type { ExportRow, ExportTable } from '@/lib/lepdo/exportTable';
import { Stat } from './ui';

function Choice({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <div className="min-w-0 space-y-1"><Label className="text-xs">{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>;
}
const opts = (names: string[], label: string) => [{ value: 'all', label }, ...[...new Set(names)].sort().map(n => ({ value: n, label: n }))];
const pretty = (n: number) => n >= 10000000 ? `${round2(n / 10000000)}Cr` : n >= 100000 ? `${round2(n / 100000)}L` : n >= 1000 ? `${round2(n / 1000)}K` : String(n);

export function SalesReports({ onOpenInvoice }: { onOpenInvoice: (id: string) => void }) {
  const store = useLepdo(), shell = useShell();
  const today = todayISO();
  const [preset, setPreset] = useState('header');
  const [customFrom, setCustomFrom] = useState(today), [customTo, setCustomTo] = useState(today);
  const [filters, setFilters] = useState({ customer: 'all', platform: 'all', seller: 'all', status: 'all', saleType: 'all', search: '', min: '', max: '' });
  const [group, setGroup] = useState<ReportFilters['group']>('month');
  const [compare, setCompare] = useState('previous');
  const [compareFrom, setCompareFrom] = useState(today), [compareTo, setCompareTo] = useState(today);
  const [kind, setKind] = useState<ReportKind>('invoices');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: '', desc: false });
  const [exporting, setExporting] = useState(false);
  let [from, to] = preset === 'header' ? [shell.from, shell.to] : rangeFor(preset as Preset, today, customFrom, customTo);
  // All Time uses actual observed boundaries instead of sentinel dates for comparison math.
  if (from === '0000-01-01') from = [...store.salesInvoices.filter(i => !i.voided).map(i => i.date), ...store.transactions.filter(t => !t.voided).map(t => t.date)].sort()[0] ?? today;
  if (to === '9999-12-31') to = today;
  const validRange = from <= to;
  const input = useMemo(() => ({ invoices: store.salesInvoices, transactions: store.transactions, parties: store.parties, banks: store.bankAccounts, cash: store.cashLocations }), [store.salesInvoices, store.transactions, store.parties, store.bankAccounts, store.cashLocations]);
  const reportFilters: ReportFilters = { ...filters, from, to, group };
  const current = useMemo(() => buildAdvancedSalesReports(input, reportFilters), [input, from, to, filters, group]);
  const [previousFrom, previousTo] = compare === 'custom' ? [compareFrom, compareTo] : comparisonRange(from, validRange ? to : from, compare === 'year' ? 'year' : 'previous');
  const previous = useMemo(() => buildAdvancedSalesReports(input, { ...reportFilters, from: previousFrom, to: previousTo }), [input, previousFrom, previousTo, filters, group]);
  const comparisonRows: ExportRow[] = (['sales', 'received', 'pending', 'receipts', 'advance', 'count', 'customers', 'carats'] as const).map(key => ({
    metric: { sales: 'Sales (INR)', received: 'Allocated received (INR)', pending: 'Outstanding (INR)', receipts: 'Receipts by payment date (INR)', advance: 'Period advance (INR)', count: 'Invoices', customers: 'Customers', carats: 'Carats' }[key],
    current: current.summary[key], previous: previous.summary[key], change: round2(current.summary[key] - previous.summary[key]), percent: previous.summary[key] ? `${round2((current.summary[key] - previous.summary[key]) / previous.summary[key] * 100)}%` : current.summary[key] ? 'N/A (no baseline)' : '0%',
  }));
  const table: ExportTable = kind === 'comparison' ? { title: 'Period Comparison', columns: [{ key: 'metric', label: 'Metric' }, { key: 'current', label: 'Selected period' }, { key: 'previous', label: 'Comparison period' }, { key: 'change', label: 'Change' }, { key: 'percent', label: 'Change %' }], rows: comparisonRows } : current.tables[kind] ?? { title: 'Reports', columns: [], rows: [] };
  const rows = useMemo(() => [...table.rows].sort((a, b) => {
    if (!sort.key) return 0;
    const x = a[sort.key], y = b[sort.key];
    const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
    return sort.desc ? -order : order;
  }), [table.rows, sort]);
  const maxPage = Math.max(0, Math.ceil(rows.length / 25) - 1), safePage = Math.min(page, maxPage);
  const visibleRows = rows.slice(safePage * 25, (safePage + 1) * 25);
  const change = previous.summary.sales ? `${round2((current.summary.sales - previous.summary.sales) / previous.summary.sales * 100)}% vs comparison` : 'No comparison sales';
  const update = (key: keyof typeof filters, value: string) => { setFilters(f => ({ ...f, [key]: value })); setPage(0); };
  const reset = () => { setFilters({ customer: 'all', platform: 'all', seller: 'all', status: 'all', saleType: 'all', search: '', min: '', max: '' }); setPreset('header'); setCompare('previous'); setPage(0); };
  const exportReport = async (format: 'excel' | 'pdf') => {
    if (!rows.length) { toast.error('No records match these filters.'); return; }
    setExporting(true);
    try {
      const active = Object.entries(filters).filter(([, v]) => v && v !== 'all').map(([k, v]) => `${k}: ${k === 'customer' ? store.parties.find(p => p.id === v)?.name ?? v : v}`).join(' · ');
      await exportAdvancedReport({ ...table, rows, subtitle: `${from} to ${to} | As of ${to}${kind === 'comparison' ? ` | Comparison: ${previousFrom} to ${previousTo}` : ''}${active ? ` | ${active}` : ''}`, summary: [{ label: 'Sales (INR)', value: formatMoney(current.summary.sales) }, { label: 'Outstanding (INR)', value: formatMoney(current.summary.pending) }, { label: 'Invoices', value: String(current.summary.count) }] }, format);
      toast.success(`${format === 'excel' ? 'Excel' : 'PDF'} report downloaded.`);
    } catch { toast.error('Could not download the report. Please try again.'); }
    finally { setExporting(false); }
  };
  const agingBars = [...new Set(current.aging.map(r => String(r['bucket'])))].map(name => ({ name, pending: round2(current.aging.filter(r => r['bucket'] === name).reduce((s, r) => s + Number(r['pending']), 0)) }));
  return <div className="min-w-0 space-y-5" aria-label="Sales Reports">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-navy">Reports</h2><p className="text-xs text-muted-foreground">{formatDate(from)} – {formatDate(to)} · Balances as of {formatDate(to)}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={reset}><RotateCcw className="size-4" />Reset filters</Button><Button variant="outline" size="sm" disabled={exporting || !validRange} onClick={() => void exportReport('excel')}><Download className="size-4" />Excel</Button><Button size="sm" disabled={exporting || !validRange} onClick={() => void exportReport('pdf')}><FileText className="size-4" />PDF</Button></div></header>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
      <Choice label="Report period" value={preset} onChange={v => { setPreset(v); setPage(0); }} options={[{ value: 'header', label: 'Selected month / period' }, ...PRESETS.map(p => ({ value: p.id, label: p.label }))]} />
      <Choice label="Customer" value={filters.customer} onChange={v => update('customer', v)} options={[{ value: 'all', label: 'All customers' }, ...store.parties.filter(p => p.type === 'customer' || store.salesInvoices.some(i => i.partyId === p.id)).map(p => ({ value: p.id, label: p.name }))]} />
      <Choice label="Platform" value={filters.platform} onChange={v => update('platform', v)} options={opts(store.salesInvoices.filter(i => !i.voided).map(i => i.platform?.trim() || 'Pure Sale/Direct'), 'All platforms')} />
      <Choice label="Seller" value={filters.seller} onChange={v => update('seller', v)} options={opts(store.salesInvoices.filter(i => !i.voided).map(i => i.sellerName?.trim() || 'Unassigned'), 'All sellers')} />
      <Choice label="Payment status" value={filters.status} onChange={v => update('status', v)} options={[{ value: 'all', label: 'All statuses' }, { value: 'paid', label: 'Paid' }, { value: 'part', label: 'Part paid' }, { value: 'pending', label: 'Pending' }, { value: 'overdue', label: 'Overdue' }]} />
      <Choice label="Sale type" value={filters.saleType} onChange={v => update('saleType', v)} options={opts(store.salesInvoices.map(i => i.saleType ?? '').filter(Boolean), 'All types')} />
      {preset === 'custom' ? <><div><Label htmlFor="report-from" className="text-xs">From</Label><Input id="report-from" type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value || today)} /></div><div><Label htmlFor="report-to" className="text-xs">To</Label><Input id="report-to" type="date" value={customTo} onChange={e => setCustomTo(e.target.value || today)} /></div></> : null}
      <div><Label htmlFor="report-min" className="text-xs">Min invoice amount (₹)</Label><Input id="report-min" type="number" min="0" value={filters.min} onChange={e => update('min', e.target.value)} placeholder="Any amount" /></div>
      <div><Label htmlFor="report-max" className="text-xs">Max invoice amount (₹)</Label><Input id="report-max" type="number" min="0" value={filters.max} onChange={e => update('max', e.target.value)} placeholder="Any amount" /></div>
      <Choice label="Compare with" value={compare} onChange={setCompare} options={[{ value: 'previous', label: 'Previous equal period' }, { value: 'year', label: 'Previous year' }, { value: 'custom', label: 'Custom period' }]} />
      <Choice label="Chart interval" value={group} onChange={v => setGroup(v as ReportFilters['group'])} options={[{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} />
      <div className="col-span-2"><Label htmlFor="report-search" className="text-xs">Search records</Label><div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input id="report-search" value={filters.search} onChange={e => update('search', e.target.value)} placeholder="Invoice, customer, reference, platform…" className="pl-9" /></div></div>
      {compare === 'custom' ? <><div><Label htmlFor="compare-from" className="text-xs">Compare from</Label><Input id="compare-from" type="date" value={compareFrom} onChange={e => setCompareFrom(e.target.value || today)} /></div><div><Label htmlFor="compare-to" className="text-xs">Compare to</Label><Input id="compare-to" type="date" value={compareTo} onChange={e => setCompareTo(e.target.value || today)} /></div></> : null}
    </div>
    {!validRange || previousFrom > previousTo ? <p role="alert" className="text-sm text-neg">The start date must be on or before the end date.</p> : null}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Sales (INR)" value={formatMoney(current.summary.sales)} tone="total" hint={change} />
      <Stat label="Allocated Received" value={formatMoney(current.summary.received)} tone="paid" hint="Selected invoices · as of end date" />
      <Stat label="Outstanding" value={formatMoney(current.summary.pending)} tone="pending" hint="Selected invoices · as of end date" />
      <Stat label="Receipts in Period" value={formatMoney(current.summary.receipts)} tone="advance" hint="Payment date · filtered allocations if attributed" />
      <Stat label="Unallocated in Period" value={formatMoney(current.summary.advance)} tone="advance" hint="Payment date · no platform attribution" />
      <Stat label="Invoices" value={String(current.summary.count)} tone="settled" />
      <Stat label="Customers" value={String(current.summary.customers)} tone="customer" />
      <Stat label="Total Carats" value={`${current.summary.carats.toFixed(2)} ct`} tone="gold" />
    </div>
    <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
      <section className="min-w-0"><h3 className="mb-3 text-sm font-semibold text-navy">Sales & Collections</h3>{current.trend.length ? <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={current.trend} margin={{ left: 5, right: 16, top: 10, bottom: 5 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={11} /><YAxis tickFormatter={pretty} fontSize={11} width={55} /><Tooltip formatter={value => formatMoney(Number(value))} /><Legend /><Line name="Sales (INR)" dataKey="sales" stroke="var(--sl-total)" strokeWidth={2} dot={false} /><Line name="Allocated received (INR)" dataKey="received" stroke="var(--sl-paid)" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div> : <EmptyChart />}</section>
      <section className="min-w-0"><h3 className="mb-3 text-sm font-semibold text-navy">Top Platforms</h3>{current.platforms.length ? <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={current.platforms.slice(0, 8)} margin={{ left: 5, right: 16, bottom: 20 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={10} interval={0} angle={-15} textAnchor="end" /><YAxis tickFormatter={pretty} fontSize={11} width={55} /><Tooltip formatter={value => formatMoney(Number(value))} /><Bar name="Sales (INR)" dataKey="sales" fill="var(--sl-total)" /></BarChart></ResponsiveContainer></div> : <EmptyChart />}</section>
      <section className="min-w-0"><h3 className="mb-3 text-sm font-semibold text-navy">Outstanding Aging · {formatDate(to)}</h3>{agingBars.length ? <div className="h-56 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={agingBars}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={10} /><YAxis tickFormatter={pretty} fontSize={11} width={55} /><Tooltip formatter={value => formatMoney(Number(value))} /><Bar dataKey="pending" name="Outstanding (INR)" fill="var(--sl-pending)" /></BarChart></ResponsiveContainer></div> : <EmptyChart />}</section>
      <section className="min-w-0"><h3 className="mb-3 text-sm font-semibold text-navy">Sales Comparison</h3><p className="mb-2 text-xs text-muted-foreground">{formatDate(previousFrom)} – {formatDate(previousTo)}</p><div className="h-48 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={[{ name: 'Comparison', sales: previous.summary.sales }, { name: 'Selected', sales: current.summary.sales }]}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={11} /><YAxis tickFormatter={pretty} fontSize={11} width={55} /><Tooltip formatter={value => formatMoney(Number(value))} /><Bar dataKey="sales" name="Sales (INR)" fill="var(--gold)" /></BarChart></ResponsiveContainer></div></section>
    </div>
    <section className="min-w-0 space-y-3 border-t border-border pt-4"><div className="flex flex-wrap items-end justify-between gap-3"><div className="w-full sm:w-72"><Choice label="Report" value={kind} onChange={v => { setKind(v as ReportKind); setPage(0); setSort({ key: '', desc: false }); }} options={REPORT_KINDS.map(r => ({ value: r['id'], label: r.label }))} /></div><span className="text-xs text-muted-foreground">{rows.length} records · exports include all matching rows</span></div>
      <div className="hidden max-w-full overflow-x-auto rounded-lg border border-border sm:block"><table className="w-full text-left text-xs"><thead className="bg-muted"><tr>{table.columns.map(c => <th key={c.key} className="whitespace-nowrap p-2"><Button variant="ghost" size="sm" className="h-auto gap-1 px-0 py-1 text-xs" onClick={() => setSort(s => ({ key: c.key, desc: s.key === c.key ? !s.desc : false }))}>{c.label}<ArrowUpDown className="size-3" /></Button></th>)}</tr></thead><tbody>{visibleRows.map((r, i) => <tr key={i} className="border-t border-border">{table.columns.map(c => <td key={c.key} className="max-w-64 break-words p-2">{c.key === 'number' && r['id'] ? <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onOpenInvoice(String(r['id']))}>{String(r[c.key])}</Button> : c.money ? formatMoney(Number(r[c.key] ?? 0)) : String(r[c.key] ?? '—')}</td>)}</tr>)}</tbody></table></div>
      <div className="space-y-3 sm:hidden">{visibleRows.map((r, i) => <div key={i} className="rounded-lg border border-border bg-card p-3"><dl className="space-y-1.5">{table.columns.map(c => <div key={c.key} className="grid grid-cols-2 gap-3 text-xs"><dt className="text-muted-foreground">{c.label}</dt><dd className="min-w-0 break-words text-right font-medium">{c.key === 'number' && r['id'] ? <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onOpenInvoice(String(r['id']))}>{String(r[c.key])}</Button> : c.money ? formatMoney(Number(r[c.key] ?? 0)) : String(r[c.key] ?? '—')}</dd></div>)}</dl></div>)}</div>
      {!rows.length ? <p className="py-8 text-center text-sm text-muted-foreground">No records match these filters.</p> : null}
      <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Page {safePage + 1} of {maxPage + 1}</p><div className="flex gap-1"><Button variant="outline" size="icon" aria-label="Previous report page" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft className="size-4" /></Button><Button variant="outline" size="icon" aria-label="Next report page" disabled={safePage === maxPage} onClick={() => setPage(safePage + 1)}><ChevronRight className="size-4" /></Button></div></div>
    </section>
  </div>;
}
function EmptyChart() { return <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No data for this period.</div>; }