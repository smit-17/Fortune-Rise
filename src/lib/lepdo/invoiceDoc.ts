import logoAsset from "@/assets/lepdo-logo.png.asset.json";
import { formatDate, round2 } from "./format";
import type { AppSettings, Invoice, Party } from "./types";

export const DEFAULT_HSN = "71049120";

const esc = (v: string) =>
  String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => inr.format(round2(n || 0));
const qty = (n: number) => (n || 0).toFixed(2);

function absoluteUrl(url: string): string {
  if (/^https?:/i.test(url)) return url;
  if (typeof window === "undefined") return url;
  return `${window.location.origin}${url}`;
}

/* ------------------------------- amount in words ------------------------------ */

const ONES = [
  "",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
  "TEN",
  "ELEVEN",
  "TWELVE",
  "THIRTEEN",
  "FOURTEEN",
  "FIFTEEN",
  "SIXTEEN",
  "SEVENTEEN",
  "EIGHTEEN",
  "NINETEEN",
];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const t = TENS[Math.floor(n / 10)] ?? "";
  const o = ONES[n % 10] ?? "";
  return o ? `${t} ${o}` : t;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} HUNDRED`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/** Indian numbering system, e.g. 6998.43 -> "SIX THOUSAND NINE HUNDRED NINETY EIGHT AND FORTY THREE PAISE ONLY" */
export function amountInWords(amount: number, currency = "INR"): string {
  const value = round2(Math.abs(amount || 0));
  let whole = Math.floor(value);
  const frac = Math.round((value - whole) * 100);
  if (whole === 0 && frac === 0) return "ZERO ONLY";

  const groups: { div: number; label: string }[] = [
    { div: 1e7, label: "CRORE" },
    { div: 1e5, label: "LAKH" },
    { div: 1e3, label: "THOUSAND" },
  ];
  const words: string[] = [];
  for (const g of groups) {
    const c = Math.floor(whole / g.div);
    if (c) {
      words.push(`${c > 99 ? threeDigits(c) : twoDigits(c)} ${g.label}`);
      whole %= g.div;
    }
  }
  if (whole) words.push(threeDigits(whole));

  const major = currency === "INR" ? "RUPEES" : currency.toUpperCase();
  const minor = currency === "INR" ? "PAISE" : "CENTS";
  const head = words.length ? `${major} ${words.join(" ")}` : `${major} ZERO`;
  const tail = frac ? ` AND ${twoDigits(frac)} ${minor}` : "";
  return `${head}${tail} ONLY`;
}

/* --------------------------------- validation -------------------------------- */

export interface InvoiceRow {
  sr: number;
  description: string;
  hsn: string;
  pcs: number;
  carat: number;
  rate: number;
  total: number;
}

export function invoiceRows(invoice: Invoice): InvoiceRow[] {
  if (invoice.invoiceKind === "jewelry") {
    return (invoice.jewelryItems ?? []).map((it, i) => {
      const carat = it.stones.reduce((s, st) => s + (st.carat || 0), 0);
      return {
        sr: i + 1,
        description: [it.description, it.karat, it.metalColour].filter(Boolean).join(" / "),
        hsn: DEFAULT_HSN,
        pcs: 1,
        carat: round2(carat),
        rate: carat ? round2(it.stoneValue / carat) : 0,
        total: round2(it.total),
      };
    });
  }
  const lines = invoice.lines ?? [];
  if (!lines.length && !(invoice.jewelryItems ?? []).length) {
    // legacy / imported invoice saved without item rows — print one summary row
    return [
      {
        sr: 1,
        description: "Sale as per invoice",
        hsn: DEFAULT_HSN,
        pcs: 1,
        carat: 0,
        rate: 0,
        total: round2(invoice.subtotal ?? invoice.foreignTotal ?? invoice.total),
      },
    ];
  }
  return lines.map((l, i) => ({
    sr: i + 1,
    description: l.description,
    hsn: l.hsnCode?.trim() || DEFAULT_HSN,

    pcs: l.quantity || 0,
    carat: l.carat || 0,
    rate: l.rate || 0,
    total: round2((l.carat || 0) * (l.rate || 0)),
  }));
}

export interface InvoiceTotals {
  rows: InvoiceRow[];
  pcs: number;
  carat: number;
  rowsTotal: number;
  subtotal: number;
  discount: number;
  shipping: number;
  taxableAmount: number;
  taxAmount: number;
  grandTotal: number;
  received: number;
  pending: number;
}

export function invoiceTotals(invoice: Invoice, received?: number): InvoiceTotals {
  const rows = invoiceRows(invoice);
  const rowsTotal = round2(rows.reduce((s, r) => s + r.total, 0));
  const subtotal = round2(invoice.subtotal ?? rowsTotal);
  const discount = round2(invoice.discount ?? 0);
  const shipping = round2(invoice.shipping ?? 0);
  const taxableAmount = round2(invoice.taxableAmount ?? subtotal - discount + shipping);
  const taxAmount = round2(invoice.taxAmount ?? 0);
  const grandTotal = round2(invoice.foreignTotal ?? invoice.total);
  const rec = round2(received ?? invoice.paid ?? 0);
  return {
    rows,
    pcs: round2(rows.reduce((s, r) => s + r.pcs, 0)),
    carat: round2(rows.reduce((s, r) => s + r.carat, 0)),
    rowsTotal,
    subtotal,
    discount,
    shipping,
    taxableAmount,
    taxAmount,
    grandTotal,
    received: rec,
    pending: round2(grandTotal - rec),
  };
}

/** Returns a list of human-readable mismatches; empty means the saved invoice is consistent. */
export function validateInvoice(invoice: Invoice, received?: number): string[] {
  const t = invoiceTotals(invoice, received);
  const errs: string[] = [];
  const near = (a: number, b: number) => Math.abs(round2(a) - round2(b)) <= 0.05;

  if (!t.rows.length) errs.push("Invoice has no item rows.");
  if (!near(t.rowsTotal, t.subtotal))
    errs.push(
      `Row totals (${money(t.rowsTotal)}) do not match the saved subtotal (${money(t.subtotal)}).`,
    );
  if (!near(t.subtotal - t.discount + t.shipping, t.taxableAmount))
    errs.push("Subtotal minus discount plus shipping does not match the saved taxable amount.");
  const expected = round2(t.taxableAmount + t.taxAmount);
  if (!near(expected, t.grandTotal))
    errs.push(
      `Taxable amount plus GST (${money(expected)}) does not match the grand total (${money(t.grandTotal)}).`,
    );
  const cur = invoice.currency ?? "INR";
  if (cur !== "INR") {
    const rate = invoice.exchangeRate ?? 0;
    if (!rate) errs.push("Foreign-currency invoice has no exchange rate.");
    else if (!near(round2((invoice.foreignTotal ?? 0) * rate), invoice.total))
      errs.push("Converted INR total does not match grand total × exchange rate.");
  }
  if (t.received < -0.05) errs.push("Received amount is negative.");
  if (t.received - t.grandTotal > 0.05 && t.grandTotal > 0)
    errs.push("Received amount is greater than the invoice grand total.");
  return errs;
}

/* ----------------------------------- html ----------------------------------- */

export function invoiceTitle(invoice: Invoice): string {
  const st = invoice.saleType ?? "domestic";
  return st === "gst_inr" || st === "domestic" ? "TAX INVOICE" : "PROFORMA INVOICE";
}

export interface InvoiceDocInput {
  invoice: Invoice;
  customer?: Party | undefined;
  settings: AppSettings;
  received?: number | undefined;
}

const IEC = "NACPS0875L";
const HEAD_GSTIN = "24NACPS0875L1Z2";
const HEAD_PHONE = "+91 9638551535";
const HEAD_ADDRESS = "B-902 Pragati IT PARK - SURAT, INDIA / Elmwood Park, New Jersey, USA";

export function buildInvoiceDocHtml({
  invoice,
  customer,
  settings,
  received,
}: InvoiceDocInput): string {
  const t = invoiceTotals(invoice, received);
  const cur = invoice.currency ?? "INR";
  const sym = cur === "INR" ? "₹" : `${cur} `;
  const amt = (n: number) => `${sym}${money(n)}`;
  const b = settings.business;
  const thanks =
    settings.branding.invoiceFooter?.trim() ||
    "Thank you for choosing LEPDO. We are grateful to have you as a part of this journey.";

  const custAddress = [customer?.billingAddress, customer?.city, customer?.country]
    .filter(Boolean)
    .join(", ");
  const detail = (label: string, value: string) =>
    value
      ? `<div class="drow"><span class="dk">${esc(label)}</span><span class="dv">${esc(value)}</span></div>`
      : "";

  const rowsHtml = t.rows
    .map(
      (r) => `<tr>
      <td class="c">${r.sr}</td>
      <td class="desc">${esc(r.description)}</td>
      <td class="c">${esc(r.hsn)}</td>
      <td class="c">${r.pcs}</td>
      <td class="r n">${r.carat ? qty(r.carat) : "—"}</td>
      <td class="r n">${r.rate ? amt(r.rate) : "—"}</td>
      <td class="r n">${amt(r.total)}</td>
    </tr>`,
    )
    .join("");

  const sumRow = (label: string, value: string) =>
    `<div class="srow"><span>${esc(label)}</span><span class="n">${value}</span></div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(invoice.number)} — ${esc(invoiceTitle(invoice))}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #eef0f5; }
  body { font-family: "Times New Roman", Georgia, serif; color: #1b1b2b; font-size: 10.5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; }
  table.doc { width: 100%; height: 297mm; border-collapse: collapse; table-layout: fixed; }
  table.doc > thead { display: table-header-group; }
  table.doc > tfoot { display: table-footer-group; }
  table.doc > thead > tr > td, table.doc > tbody > tr > td, table.doc > tfoot > tr > td { padding: 0; border: 0; }
  table.doc > tbody > tr > td { vertical-align: top; }

  /* ---------- header ---------- */
  .band { background: #2D2D61; color: #fff; padding: 9mm 12mm 7mm; }
  .band .in { display: flex; justify-content: space-between; align-items: center; gap: 14mm; }
  .band img { height: 76px; width: auto; display: block; }
  .meta { text-align: right; font-size: 10px; line-height: 1.7; letter-spacing: .2px; }
  .meta .k { color: #E2AE40; letter-spacing: 1px; font-size: 8.5px; text-transform: uppercase; }
  .meta .v { color: #fff; }
  .meta .addr { margin-top: 4px; color: #d9dae6; font-size: 9px; line-height: 1.5; max-width: 78mm; margin-left: auto; }
  .rule { height: 2px; background: #E2AE40; }

  .titlewrap { text-align: center; padding: 7mm 12mm 0; }
  .titlewrap h1 { margin: 0; font-size: 16px; letter-spacing: 6px; font-weight: 400; color: #2D2D61; text-transform: uppercase; }
  .titlewrap .sub { margin-top: 3px; font-size: 8.5px; letter-spacing: 3px; color: #8b8ba3; text-transform: uppercase; }
  .titlewrap .orn { width: 26mm; height: 1px; background: #E2AE40; margin: 4mm auto 0; }

  .pad { padding: 0 12mm; }

  /* ---------- parties ---------- */
  .parties { display: flex; gap: 12mm; margin-top: 6mm; }
  .parties > div { flex: 1 1 0; min-width: 0; }
  .cap { font-size: 8px; letter-spacing: 2.2px; text-transform: uppercase; color: #E2AE40; padding-bottom: 2mm; border-bottom: 1px solid #e4d9bd; margin-bottom: 2.5mm; }
  .pname { font-size: 12.5px; color: #2D2D61; letter-spacing: .3px; margin-bottom: 1.5mm; }
  .pline { font-size: 10px; color: #40405c; line-height: 1.6; word-break: break-word; }
  .drow { display: flex; gap: 6px; font-size: 10px; line-height: 1.75; }
  .drow .dk { width: 26mm; color: #7d7d96; flex: none; }
  .drow .dv { color: #1f1f38; word-break: break-word; }

  /* ---------- items ---------- */
  table.items { width: 100%; border-collapse: collapse; margin-top: 7mm; }
  table.items thead { display: table-header-group; }
  table.items thead th { background: #2D2D61; color: #fff; font-size: 8px; letter-spacing: 1.1px; text-transform: uppercase; font-weight: 400; padding: 3mm 2.5mm; text-align: left; }
  table.items thead th.c { text-align: center; }
  table.items thead th.r { text-align: right; }
  table.items tbody td { padding: 2.8mm 2.5mm; border-bottom: 1px solid #ecebf2; font-size: 10.5px; vertical-align: top; color: #23233b; }
  table.items tbody tr:nth-child(even) td { background: #fafafd; }
  table.items td.desc { word-break: break-word; }
  table.items tfoot td { padding: 3mm 2.5mm; border-top: 1px solid #E2AE40; font-size: 10px; color: #2D2D61; }
  .c { text-align: center; }
  .r { text-align: right; }
  .n { font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr { page-break-inside: avoid; break-inside: avoid; }

  /* ---------- totals ---------- */
  .totals { display: flex; justify-content: flex-end; margin-top: 5mm; page-break-inside: avoid; break-inside: avoid; }
  .totals .box { width: 82mm; }
  .srow { display: flex; justify-content: space-between; gap: 8mm; font-size: 10.5px; padding: 1.8mm 0; color: #40405c; border-bottom: 1px solid #f0eef6; }
  .grand { display: flex; justify-content: space-between; gap: 8mm; align-items: baseline; background: #2D2D61; color: #fff; padding: 3.2mm 4mm; margin-top: 2.5mm; border-bottom: 2px solid #E2AE40; }
  .grand .lbl { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #E2AE40; }
  .grand .val { font-size: 14px; letter-spacing: .5px; }
  .eqv { text-align: right; font-size: 9px; color: #7d7d96; margin-top: 1.5mm; }

  .words { margin-top: 6mm; padding: 3.5mm 4mm; border-top: 1px solid #E2AE40; border-bottom: 1px solid #E2AE40; background: #fdfbf6; page-break-inside: avoid; }
  .words .cap2 { font-size: 8px; letter-spacing: 2.2px; text-transform: uppercase; color: #a08442; }
  .words b { display: block; margin-top: 1.5mm; font-size: 10.5px; letter-spacing: .4px; color: #2D2D61; font-weight: 700; }

  .notes { margin-top: 6mm; font-size: 9.5px; color: #4a4a63; line-height: 1.65; }
  .notes .t { color: #2D2D61; }
  .notes p { margin: 0 0 1.5mm; white-space: pre-wrap; }

  /* ---------- closing ---------- */
  .closing { display: flex; justify-content: space-between; align-items: flex-end; gap: 14mm; padding: 0 12mm 6mm; page-break-inside: avoid; break-inside: avoid; }
  .thanks { max-width: 96mm; font-size: 10px; color: #4a4a63; line-height: 1.6; font-style: italic; }
  .sign { width: 58mm; text-align: center; }
  .sign .sp { height: 16mm; }
  .sign .line { border-top: 1px solid #2D2D61; padding-top: 2mm; font-size: 10.5px; color: #2D2D61; }
  .sign .cp { font-size: 8px; letter-spacing: 1.4px; text-transform: uppercase; color: #8b8ba3; margin-top: 1mm; }
  .site { background: #2D2D61; color: #E2AE40; text-align: center; letter-spacing: 5px; font-size: 9.5px; padding: 4mm; border-top: 2px solid #E2AE40; }
  @media print { html, body { background: #fff; } .sheet { width: auto; min-height: 0; margin: 0; } }
</style></head>
<body>
<div class="sheet">
<table class="doc">
  <thead><tr><td>
    <div class="band">
      <div class="in">
        <img src="${esc(settings.branding.logoDataUrl?.trim() || absoluteUrl(logoAsset.url))}" alt="LEPDO" />
        <div class="meta">
          <div><span class="k">IEC</span> <span class="v">${esc(IEC)}</span></div>
          <div><span class="k">GSTIN</span> <span class="v">${esc(b.gstin || HEAD_GSTIN)}</span></div>
          <div><span class="k">Mobile</span> <span class="v">${esc(b.phone || HEAD_PHONE)}</span></div>
          <div class="addr">${esc(HEAD_ADDRESS)}</div>
        </div>
      </div>
    </div>
    <div class="rule"></div>
  </td></tr></thead>

  <tfoot><tr><td>
    <div class="closing">
      <div class="thanks">${esc(thanks)}</div>
      <div class="sign">
        <div class="sp"></div>
        <div class="line">${esc(settings.invoice.signature || "For LEPDO")}</div>
        <div class="cp">Authorised Signatory &amp; Stamp</div>
      </div>
    </div>
    <div class="site">WWW.LEPDO.COM</div>
  </td></tr></tfoot>

  <tbody><tr><td>
    <div class="titlewrap">
      <h1>${esc(invoiceTitle(invoice))}</h1>
      <div class="sub">Diamonds &amp; Fine Jewellery</div>
      <div class="orn"></div>
    </div>

    <div class="pad">
      <div class="parties">
        <div>
          <div class="cap">Billed To</div>
          <div class="pname">${esc(customer?.name || "—")}</div>
          ${custAddress ? `<div class="pline">${esc(custAddress)}</div>` : ""}
          ${customer?.phone ? `<div class="pline">Mobile ${esc(customer.phone)}</div>` : ""}
          ${customer?.gstin ? `<div class="pline">GSTIN ${esc(customer.gstin)}</div>` : ""}
        </div>
        <div>
          <div class="cap">Invoice Details</div>
          ${detail("Invoice No.", invoice.number)}
          ${detail("Date", formatDate(invoice.date))}
          ${detail("Seller", invoice.sellerName || "")}
          ${settings.invoice.showPlatform && invoice.platform ? detail("Platform", invoice.platform) : ""}
          ${settings.invoice.showDueDate && invoice.dueDate ? detail("Due Date", formatDate(invoice.dueDate)) : ""}
          ${cur !== "INR" ? detail("Currency", `${cur} @ ${invoice.exchangeRate ?? 1}`) : ""}
        </div>
      </div>

      <table class="items">
        <thead>
          <tr>
            <th class="c" style="width:11mm">Sr.</th>
            <th>Description</th>
            <th class="c" style="width:19mm">HSN</th>
            <th class="c" style="width:11mm">Pcs</th>
            <th class="r" style="width:20mm">Carats</th>
            <th class="r" style="width:23mm">Price / Ct</th>
            <th class="r" style="width:27mm">Amount</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" class="r">Total</td>
            <td class="c">${t.pcs}</td>
            <td class="r n">${qty(t.carat)}</td>
            <td></td>
            <td class="r n">${amt(t.rowsTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="totals">
        <div class="box">
          ${sumRow("Items Total", amt(t.subtotal))}
          ${t.discount ? sumRow("Discount", `- ${amt(t.discount)}`) : ""}
          ${t.shipping ? sumRow("Shipping Charges", amt(t.shipping)) : ""}
          ${t.taxAmount ? sumRow(`GST ${invoice.gstRate ?? 0}%`, amt(t.taxAmount)) : ""}
          <div class="grand"><span class="lbl">Total Amount</span><span class="val n">${amt(t.grandTotal)}</span></div>
          ${cur !== "INR" ? `<div class="eqv">INR Equivalent ₹${money(invoice.total)}</div>` : ""}
        </div>
      </div>

      <div class="words">
        <div class="cap2">Amount Chargeable (in words)</div>
        <b>${esc(amountInWords(t.grandTotal, cur))}</b>
      </div>

      ${
        settings.invoice.terms?.trim() ||
        settings.invoice.bankDetails?.trim() ||
        invoice.notes?.trim()
          ? `<div class="notes">
              ${settings.invoice.terms?.trim() ? `<p><span class="t">Payment Terms:</span> ${esc(settings.invoice.terms.trim())}</p>` : ""}
              ${settings.invoice.bankDetails?.trim() ? `<p><span class="t">Bank Details:</span> ${esc(settings.invoice.bankDetails.trim())}</p>` : ""}
              ${invoice.notes?.trim() ? `<p>${esc(invoice.notes.trim())}</p>` : ""}
            </div>`
          : ""
      }
    </div>
  </td></tr></tbody>
</table>
</div>
</body></html>`;
}

/** Opens the exact same document in a new window and triggers the browser print / save-as-PDF dialog. */
export function printInvoiceDoc(html: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(
    html.replace(
      "</body>",
      `<script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body>`,
    ),
  );
  w.document.close();
  return true;
}
