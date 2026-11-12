import { z } from "zod";
import { bankFixedDirection, resolveTransferCategory, resolveUchhinaCategory, uiCategoryFromCategoryId, type BankUiCategory } from "./bank";
import type { BankAccount, MasterValue, Party, Transaction } from "./types";
import type { NewEntryInput } from "./store";

export const IMPORT_FIELDS = ["date", "bank", "category", "partyName", "particulars", "credit", "debit", "amount", "direction", "statementClosingBalance", "reference", "notes", "expenseCategory", "destination", "customCategory"] as const;
export type ImportField = typeof IMPORT_FIELDS[number];
export type ColumnMapping = Partial<Record<ImportField, number>>;
export type Extraction = Partial<Record<ImportField, { start: string; end: string }>>;
export interface ImportRow {
  id: string; rowNumber: number; date: string; accountId: string; category: BankUiCategory | "";
  customCategory: string; partyName: string; particulars: string; credit: string; debit: string;
  reference: string; notes: string; expenseCategory: string; destination: string;
  statementClosingBalance: string;
}
const aliases: Record<ImportField, string[]> = {
  date: ["date", "transactiondate", "txndate", "postingdate", "valuedate"],
  bank: ["bank", "bankname", "bankaccount", "account", "accountnumber", "accountno"],
  category: ["category", "transactioncategory"], partyName: ["party", "partyname", "customer", "supplier", "beneficiary"],
  particulars: ["narration", "particulars", "description", "transactiondetails", "remarks"],
  credit: ["credit", "creditamount", "creditamt", "deposit", "deposits", "depositamount", "depositamt", "cr", "cramount"],
  debit: ["debit", "debitamount", "debitamt", "withdrawal", "withdrawals", "withdrawalamount", "withdrawalamt", "dr", "dramount"],
  amount: ["amount", "transactionamount", "txnamount"], direction: ["direction", "type", "drcr", "crdr", "transactiontype"],
  reference: ["reference", "referenceutr", "referencenumber", "utr", "transactionid", "refno", "chequeno", "chequerefno", "chqrefno"],
  statementClosingBalance: ["balance", "closingbalance", "runningbalance", "availablebalance", "balanceamount", "statementclosingbalance"],
  notes: ["notes", "otherdetails"], expenseCategory: ["expensecategory", "expensehead"],
  destination: ["destination", "transferdestination"], customCategory: ["customcategory"],
};
export const normalized = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function detectStatementBank(cells: unknown[], banks: BankAccount[]): string | undefined {
  const active = banks.filter(b => b.active);
  const texts = cells.map(normalized).filter(Boolean);
  const identities = ["hdfc", "indusind", "kotak", "sbi", "icici", "axis", "idfc", "yesbank", "bankofbaroda", "punjabnationalbank", "statebankofindia"];
  const bankIdentity = (value: string) => {
    const text = normalized(value);
    return identities.filter(key => text.includes(key)).map(key => key === "statebankofindia" ? "sbi" : key);
  };
  const named = active.filter(b => texts.some(text => [b.id, b.nickname, b.bankName].some(value => {
    const key = normalized(value);
    return (key.length >= 3 && text.includes(key)) || bankIdentity(value).some(identity => bankIdentity(text).includes(identity));
  })));
  // Account suffixes are evidence only in account metadata, never narration.
  const accountCells = cells.flatMap((v,i) => /account|a\/c/i.test(String(v ?? "")) ? [String(v ?? ""), String(cells[i+1] ?? "")] : []);
  const suffixes = active.filter(b => /^\d{4}$/.test(b.last4) && accountCells.some(v => v.replace(/[^0-9]/g, "").endsWith(b.last4)));
  const candidates = suffixes.length ? suffixes.filter(b => !named.length || named.some(n => n.id === b.id)) : named;
  if (candidates.length === 1) return candidates[0]?.id;
  return named.length || suffixes.length ? "" : undefined;
}
export function detectColumns(headers: string[]): ColumnMapping {
  const result: ColumnMapping = {};
  for (const field of IMPORT_FIELDS) {
    const index = headers.findIndex(h => aliases[field].includes(normalized(h.replace(/\([^)]*\)/g, ""))));
    if (index >= 0) result[field] = index;
  }
  return result;
}
export function detectHeader(rows: unknown[][]): number {
  let best = -1, score = 1;
  rows.slice(0, 60).forEach((row, i) => {
    const mapping = detectColumns(row.map(String));
    const n = Object.keys(mapping).length;
    if (mapping.date !== undefined && n > score) { best = i; score = n; }
  });
  return best;
}
export function importDate(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 0 && value < 100000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const dmy = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
  if (dmy) return `${dmy[3]?.length === 2 ? "20" : ""}${dmy[3]}-${dmy[2]?.padStart(2, "0")}-${dmy[1]?.padStart(2, "0")}`;
  if (/^\d{1,2}[- ](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[- ]\d{2,4}$/i.test(text)) {
    const date = new Date(text); if (Number.isFinite(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return text;
}
export function importAmount(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text === "—") return "";
  const clean = text.replace(/[,₹$\s]/g, "").replace(/(?:INR|Rs\.?|CR|DR)/gi, "");
  const n = Number(clean.replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? String(Math.round(Math.abs(n) * 100) / 100) : text;
}
export function extractReference(narration: string): string {
  return narration.match(/(?:UTR|REF(?:ERENCE)?|NEFT|IMPS|RTGS)[\s:/-]+([a-z0-9]{6,})/i)?.[1]
    ?? narration.match(/(?:UPI)[/-](\d{8,})/i)?.[1] ?? "";
}
export function importStatementBalance(value: unknown): string {
  const text = String(value ?? "").trim();
  const amount = importAmount(value);
  if (!amount || !Number.isFinite(Number(amount))) return amount;
  return String((/^\s*-|^\s*\(|DR\s*$/i.test(text) ? -1 : 1) * Number(amount));
}
export function inferImportCategory(row: ImportRow, context: {
  transactions?: Transaction[]; parties: Party[]; categories: {value:string;label:string}[]; masters: Record<string,MasterValue[]>;
}): Pick<ImportRow,"category"|"customCategory"|"expenseCategory"|"partyName"> {
  const direction=Number(row.credit)>0?"in":"out";
  const text=normalized(row.particulars);
  const words=(value:string)=>value.toLowerCase().split(/[^a-z]+/).filter(w=>w.length>=4&&!['neft','rtgs','imps','credit','debit','payment','transfer'].includes(w));
  const tokens=new Set(words(row.particulars));
  const matches=(context.transactions??[]).filter(t=>!t.voided&&t.sourceType==="bank"&&t.accountId===row.accountId&&t.direction===direction&&t.category).filter(t=>{
    if(text.length>=4&&text===normalized(t.particulars)) return true;
    const previous=new Set(words(t.particulars));const common=[...tokens].filter(w=>previous.has(w)).length;
    return common>=2&&common/Math.max(tokens.size,previous.size)>=0.8;
  });
  const signatures=new Set(matches.map(t=>`${uiCategoryFromCategoryId(t.category)}|${t.customCategory??""}|${t.expenseCategory??""}`));
  const prior=signatures.size===1?matches[0]:undefined;
  const party=context.parties.find(p=>normalized(row.partyName).length>0&&normalized(p.name)===normalized(row.partyName))??context.parties.slice().sort((a,b)=>b.name.length-a.name.length).find(p=>normalized(p.name).length>=4&&text.includes(normalized(p.name)))??context.parties.find(p=>p.id===prior?.partyId);
  const expense=(context.masters["expenseCategories"]??[]).find(c=>c.active&&c.name.length>=4&&text.includes(normalized(c.name)))?.name;
  const option=context.categories.filter(c=>normalized(c.label).length>=5&&normalized(c.label)!=="other"&&text.includes(normalized(c.label))).sort((a,b)=>b.label.length-a.label.length).find(c=>!bankFixedDirection(c.value as BankUiCategory)||bankFixedDirection(c.value as BankUiCategory)===direction);
  const value=prior?uiCategoryFromCategoryId(prior.category):party?.type==="customer"&&direction==="in"?"sale_payment":party?.type==="supplier"&&direction==="out"?"purchase_payment":expense&&direction==="out"?"expense":option?.value??"other";
  return {category:value.startsWith("custom:")?"other":value as BankUiCategory,customCategory:prior?.customCategory??(value.startsWith("custom:")?value.slice(7):""),expenseCategory:prior?.expenseCategory??expense??row.expenseCategory,partyName:party?.name??row.partyName};
}
export function canSubmitImport(kinds: string[], readyCount: number): boolean {
  return readyCount>0&&kinds.includes("ready");
}
export function importSubmitIds(rows: ImportRow[], kinds: Map<string, {kind:string}>, selected: Set<string>): string[] {
  const ready=rows.filter(row=>kinds.get(row.id)?.kind==="ready");
  const chosen=ready.filter(row=>selected.has(row.id));
  return (chosen.length?chosen:ready).map(row=>row.id);
}
export function mapImportRows(raw: unknown[][], mapping: ColumnMapping, extraction: Extraction, context: {
  bankId: string; banks: BankAccount[]; parties: Party[]; categories: { value: string; label: string }[];
  masters: Record<string, MasterValue[]>; headerRow: number; transactions?: Transaction[];
}): ImportRow[] {
  return raw.map((cells, index) => {
    const get = (field: ImportField): unknown => {
      const col = mapping[field]; if (col === undefined) return "";
      const v = cells[col]; const range = extraction[field];
      return range && (range.start || range.end) ? String(v ?? "").slice(Number(range.start) || 0, range.end ? Number(range.end) : undefined) : v;
    };
    const particulars = String(get("particulars") ?? "").trim();
    const summaryLabel = /^(?:(?:grand|sub|overall|transaction|statement)\s*totals?|totals?|summary|summaries|(?:opening|closing|available|brought forward|carried forward)\s*balance)(?:\s*(?:amount|credit|debit|balance|cr|dr))?\s*[:\-]?\s*(?:[₹$,\d.()\s-]+(?:cr|dr)?)?$/i;
    const rawDate=get("date");
    // Numeric balances in shifted footer cells are not modern Excel date serials.
    if(typeof rawDate==="number"&&(rawDate<25569||rawDate>=100000)) return null;
    if(cells.some(cell=>typeof cell==="string"&&summaryLabel.test(cell.trim()))) return null;
    if(!particulars&&!String(get("credit")??"").trim()&&!String(get("debit")??"").trim()&&!String(get("amount")??"").trim()) return null;
    let credit = importAmount(get("credit")), debit = importAmount(get("debit"));
    if (!credit && !debit && mapping.amount !== undefined) {
      const amt = importAmount(get("amount")); const dir = String(get("direction")).toLowerCase();
      if (/^(cr|credit|in|deposit)/.test(dir)) credit = amt;
      else if (/^(dr|debit|out|withdrawal)/.test(dir) || Number(get("amount")) < 0) debit = amt;
    }
    const partyName = String(get("partyName") || context.parties.slice().sort((a,b) => b.name.length-a.name.length).find(p => p.name.length >= 4 && normalized(particulars).includes(normalized(p.name)))?.name || "");
    const categoryText = String(get("category"));
    const option = context.categories.find(c => normalized(c.label) === normalized(categoryText) || c.value === categoryText);
    const party = context.parties.find(p => normalized(p.name) === normalized(partyName));
    const category = option?.value ?? (party && Number(credit) > 0 && party.type === "customer" ? "sale_payment" : party && Number(debit) > 0 && party.type === "supplier" ? "purchase_payment" : "other");
    const bankText = String(get("bank") ?? "").trim();
    const bank = bankText ? detectStatementBank([`Bank account: ${bankText}`], context.banks) : undefined;
    const expense = String(get("expenseCategory") || (context.masters["expenseCategories"] ?? []).find(c => c.active && c.name.length >= 4 && normalized(particulars).includes(normalized(c.name)))?.name || "");
    const row: ImportRow = { id: `row-${index}`, rowNumber: context.headerRow + index + 2, date: importDate(get("date")), accountId: bank ?? (bankText ? "" : context.bankId),
      category: category.startsWith("custom:") ? "other" : category as BankUiCategory,
      customCategory: category.startsWith("custom:") ? category.slice(7) : String(get("customCategory")),
      partyName, particulars, credit, debit, reference: String(get("reference") || extractReference(particulars)), notes: String(get("notes")),
      expenseCategory: expense, destination: String(get("destination")), statementClosingBalance: importStatementBalance(get("statementClosingBalance")) };
    return option?row:{...row,...inferImportCategory(row,context)};
  }).filter((r): r is ImportRow => r!==null && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(new Date(`${r.date}T00:00:00Z`).getTime()) && new Date(`${r.date}T00:00:00Z`).toISOString().slice(0, 10) === r.date);
}
const rowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A valid date is required").refine(v => { const d = new Date(`${v}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === v; }, "Invalid calendar date"),
  particulars: z.string().trim().min(1, "Particulars are required").max(2000), reference: z.string().max(500), notes: z.string().max(5000),
});
export function validateImportRow(row: ImportRow, bankIds: string[], destinations: string[]): string | null {
  const parsed = rowSchema.safeParse(row); if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid row";
  if (!bankIds.includes(row.accountId)) return "Select a bank account";
  if (!row.statementClosingBalance.trim() || !Number.isFinite(Number(row.statementClosingBalance))) return "Enter the statement closing balance";
  const cr = Number(row.credit), dr = Number(row.debit);
  if (!Number.isFinite(cr) || !Number.isFinite(dr) || cr < 0 || dr < 0 || (cr > 0) === (dr > 0)) return "Enter either a positive credit or debit, not both";
  if (!row.category) return "Select a category";
  const fixed = bankFixedDirection(row.category); if (fixed && fixed !== (cr > 0 ? "in" : "out")) return "Amount direction does not match category";
  if (["sale_payment", "purchase_payment"].includes(row.category) && !row.partyName.trim()) return "Customer / supplier is required";
  if (row.category === "expense" && !row.expenseCategory.trim()) return "Expense category is required";
  if (row.category === "bank_transfer" && (!destinations.includes(row.destination) || row.destination === `bank:${row.accountId}`)) return "Select a different transfer destination";
  return null;
}
export function importInput(row: ImportRow, partyId: string | null): NewEntryInput {
  const direction = Number(row.credit) > 0 ? "in" : "out";
  const [kind, id] = row.destination.split(":");
  return { date: row.date, sourceType: "bank", accountId: row.accountId, direction,
    statementClosingBalance: row.statementClosingBalance.trim() && Number.isFinite(Number(row.statementClosingBalance)) ? Number(row.statementClosingBalance) : undefined,
    amount: Number(direction === "in" ? row.credit : row.debit),
    category: row.category === "uchhina" ? resolveUchhinaCategory(direction) : row.category === "bank_transfer" ? resolveTransferCategory(kind === "cash" ? "cash" : "bank") : row.category || null,
    partyId, particulars: row.particulars, reference: row.reference.trim() || undefined, notes: row.notes.trim() || undefined,
    ledger: true, customCategory: row.category === "other" ? row.customCategory || undefined : undefined,
    ...(row.category === "expense" ? { expenseCategory: row.expenseCategory, expensePaid: true } : {}),
    ...(row.category === "bank_transfer" ? { destinationType: kind === "cash" ? "cash" as const : "bank" as const, destinationId: id } : {}),
  };
}
type DuplicateInput = Pick<NewEntryInput,"accountId"|"date"|"amount"|"direction"|"statementClosingBalance"|"reference"|"particulars">;
export function sameBankImportBase(a: DuplicateInput, b: DuplicateInput): boolean {
  return a.accountId === b.accountId && a.date === b.date && a.direction === b.direction && Math.round(a.amount*100) === Math.round(b.amount*100);
}
export function sameBankImport(a: DuplicateInput, b: DuplicateInput): boolean {
  return sameBankImportBase(a,b) && typeof a.statementClosingBalance === "number" && typeof b.statementClosingBalance === "number" && Number.isFinite(a.statementClosingBalance) && Number.isFinite(b.statementClosingBalance) && Math.round(a.statementClosingBalance*100) === Math.round(b.statementClosingBalance*100);
}
export function findImportReview(row: ImportRow, transactions: Transaction[]): Transaction | undefined {
  return transactions.find(t => !t.voided && t.sourceType === "bank" && t.statementClosingBalance == null && sameBankImportBase(importInput(row,null),t));
}
export function findImportDuplicate(row: ImportRow, transactions: Transaction[]): Transaction | undefined {
  return transactions.find(t => !t.voided && t.sourceType === "bank" && sameBankImport(importInput(row,null),t));
}