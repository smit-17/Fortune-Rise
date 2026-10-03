import { formatDate, formatDateTime, formatMoney } from "./format";
import { uchhinaTypeLabel } from "./uchhina";
import type { PersonLedger } from "./uchhina";

export interface UchhinaReportMeta {
  personLabel: string;
  periodLabel: string;
  given: number;
  stillToReceive: number;
  taken: number;
  stillToPay: number;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = formatMoney;

function download(content: BlobPart, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function body(ledgers: PersonLedger[], meta: UchhinaReportMeta): string {
  const person = ledgers
    .map(
      (p) => `<h3>${esc(p.name)}</h3>
<table border="1" cellspacing="0" cellpadding="6">
  <thead><tr><th>Date</th><th>Entry Type</th><th>Particulars</th><th>Account</th><th align="right">Amount</th><th align="right">Receivable</th><th align="right">Payable</th></tr></thead>
  <tbody>${
    [...p.rows]
      .reverse()
      .map(
        (r) =>
          `<tr><td>${esc(formatDate(r.date))}</td><td>${esc(uchhinaTypeLabel(r.category))}</td><td>${esc(r.particulars)}</td><td>${esc(r.account)}</td><td align="right">${num(r.amount)}</td><td align="right">${num(r.receivable)}</td><td align="right">${num(r.payable)}</td></tr>`,
      )
      .join("") || `<tr><td colspan="7">No entries in this period.</td></tr>`
  }</tbody>
  <tfoot>
    <tr><th colspan="4" align="right">Given</th><th colspan="3" align="right">${num(p.given)}</th></tr>
    <tr><th colspan="4" align="right">Received Back</th><th colspan="3" align="right">${num(p.receivedBack)}</th></tr>
    <tr><th colspan="4" align="right">Still to Receive</th><th colspan="3" align="right">${num(p.stillToReceive)}</th></tr>
    <tr><th colspan="4" align="right">Taken</th><th colspan="3" align="right">${num(p.taken)}</th></tr>
    <tr><th colspan="4" align="right">Returned</th><th colspan="3" align="right">${num(p.returned)}</th></tr>
    <tr><th colspan="4" align="right">Still to Pay</th><th colspan="3" align="right">${num(p.stillToPay)}</th></tr>
  </tfoot>
</table>`,
    )
    .join("");

  return `<h1>LEPDO — Uchhina Statement</h1>
<p>Person: <strong>${esc(meta.personLabel)}</strong><br />Period: ${esc(meta.periodLabel)}<br />Generated: ${esc(formatDateTime(new Date().toISOString()))}</p>
<table border="1" cellspacing="0" cellpadding="6">
  <thead><tr><th>Total Money Given</th><th>Still to Receive</th><th>Total Money Taken</th><th>Still to Pay</th></tr></thead>
  <tbody><tr><td align="right">${num(meta.given)}</td><td align="right">${num(meta.stillToReceive)}</td><td align="right">${num(meta.taken)}</td><td align="right">${num(meta.stillToPay)}</td></tr></tbody>
</table>
${person || "<p>No uchhina entries for the selected filters.</p>"}`;
}

function fileName(meta: UchhinaReportMeta, ext: string) {
  const slug = meta.personLabel.replace(/[^a-z0-9]+/gi, "-");
  return `LEPDO-Uchhina-${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

export function downloadUchhinaExcel(ledgers: PersonLedger[], meta: UchhinaReportMeta) {
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8" /></head><body>${body(ledgers, meta)}</body></html>`;
  download(doc, fileName(meta, "xls"), "application/vnd.ms-excel");
}

export function downloadUchhinaPdf(ledgers: PersonLedger[], meta: UchhinaReportMeta): boolean {
  const doc = `<!doctype html><html><head><meta charset="utf-8" /><title>LEPDO Uchhina</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#2D2D61;padding:24px;font-size:12px}
  h1{font-size:18px;margin:0 0 8px}
  h3{font-size:13px;margin:18px 0 6px}
  table{width:100%;border-collapse:collapse;margin-bottom:10px}
  th,td{border:1px solid #E7E8EE;padding:6px 8px;text-align:left;vertical-align:top}
  thead th{background:#F1EAFE}
  tfoot th{background:#FFF3DD}
  td[align="right"],th[align="right"]{text-align:right}
</style></head><body>${body(ledgers, meta)}
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(doc);
  w.document.close();
  return true;
}
