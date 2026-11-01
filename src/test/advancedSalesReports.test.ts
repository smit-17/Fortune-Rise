import { describe, expect, it } from 'vitest';
import { buildAdvancedSalesReports, comparisonRange, type ReportFilters } from '../lib/lepdo/advancedSalesReports';
import type { BuildInput } from '../lib/lepdo/sales';
import type { Transaction } from '../lib/lepdo/types';

const filters: ReportFilters = { from: '2026-10-01', to: '2026-10-31', customer: 'all', platform: 'all', seller: 'all', saleType: 'all', status: 'all', min: '', max: '', search: '', group: 'month' };
const payment = (id: string, date: string, amount: number, invoiceId?: string): Transaction => ({ id, code: id, date, amount, sourceType: 'bank', accountId: 'bank', category: 'sale_payment', partyId: 'a', direction: 'in', particulars: 'Receipt', allocations: invoiceId ? [{ invoiceId, amount }] : [], voided: false, reconciled: false, createdAt: date, updatedAt: date, createdBy: 'test' });
const input: BuildInput = {
  invoices: [{ id: 'oct', number: 'SALE-1', partyId: 'a', date: '2026-10-01', total: 9800, paid: 0, platform: 'Etsy', dueDate: '2026-10-20', lines: [{ id: 'line', description: 'Diamond', quantity: 1, carat: 2, rate: 4900 }] }, { id: 'sep', number: 'SALE-2', partyId: 'a', date: '2026-09-01', total: 15100, paid: 0, platform: 'Direct' }],
  transactions: [payment('p1', '2026-10-10', 5300, 'oct'), payment('p2', '2026-11-01', 4500, 'oct'), payment('p3', '2026-10-15', 15100, 'sep'), payment('advance', '2026-10-16', 277482.47)],
  parties: [{ id: 'a', name: 'Customer', type: 'customer' }], banks: [], cash: [],
};
describe('Read-only advanced Sales reports', () => {
  it('uses saved invoice totals without changing source records', () => {
    const before = JSON.stringify(input);
    const r = buildAdvancedSalesReports(input, filters);
    expect(r.summary.sales).toBe(9800);
    expect(r.summary.carats).toBe(2);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('excludes post-period receipts from received and outstanding as of the end date', () => {
    const r = buildAdvancedSalesReports(input, filters);
    expect(r.summary.received).toBe(5300);
    expect(r.summary.pending).toBe(4500);
  });
  it('uses payment dates even when the linked invoice is outside the invoice date range', () => {
    const r = buildAdvancedSalesReports(input, filters);
    expect(r.summary.receipts).toBe(297882.47);
    expect(r.tables.payments?.rows).toHaveLength(3);
  });
  it('keeps an unallocated advance separate from invoice outstanding', () => {
    const r = buildAdvancedSalesReports(input, filters);
    expect(r.summary.advance).toBe(277482.47);
    expect(r.summary.pending).toBe(4500);
  });
  it('does not attribute advances or other-platform receipts to a selected platform', () => {
    const r = buildAdvancedSalesReports(input, { ...filters, platform: 'Etsy' });
    expect(r.summary.receipts).toBe(5300);
    expect(r.summary.advance).toBe(0);
  });
  it('finds linked receipts by the current saved invoice number', () => {
    const r = buildAdvancedSalesReports(input, { ...filters, search: 'SALE-1' });
    expect(r.tables.payments?.rows).toHaveLength(1);
    expect(r.summary.receipts).toBe(5300);
  });
  it('only counts the matching allocation of a multi-platform receipt', () => {
    const mixed = { ...payment('mixed', '2026-10-20', 6000), allocations: [{ invoiceId: 'oct', amount: 1000 }, { invoiceId: 'sep', amount: 3000 }] };
    const r = buildAdvancedSalesReports({ ...input, transactions: [mixed] }, { ...filters, platform: 'Etsy' });
    expect(r.summary.receipts).toBe(1000);
    expect(r.summary.advance).toBe(0);
  });
  it('excludes voided invoices and voided receipts', () => {
    const r = buildAdvancedSalesReports({ ...input, invoices: input.invoices.map(i => ({ ...i, voided: true })), transactions: input.transactions.map(p => ({ ...p, voided: true })) }, filters);
    expect(r.summary.sales).toBe(0);
    expect(r.summary.receipts).toBe(0);
  });
  it('ages outstanding and evaluates status at the selected end date', () => {
    const r = buildAdvancedSalesReports(input, { ...filters, to: '2026-10-15', status: 'part' });
    expect(r.summary.pending).toBe(4500);
    expect(r.aging[0]?.['days']).toBe(0);
    expect(r.aging[0]?.['bucket']).toBe('Not overdue');
  });
  it('builds an equal-length inclusive previous period and clamps leap day in year comparisons', () => {
    expect(comparisonRange('2026-10-01', '2026-10-31', 'previous')).toEqual(['2026-08-31', '2026-09-30']);
    expect(comparisonRange('2024-02-29', '2024-02-29', 'year')).toEqual(['2023-02-28', '2023-02-28']);
  });
});