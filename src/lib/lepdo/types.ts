export type SourceType = "bank" | "cash";
export type Direction = "in" | "out";
export type TxStatus = "classified" | "unclassified" | "reconciled" | "void";

/** Where an entry originated from. */
export type EntrySource =
  "manual" | "sales" | "purchase" | "expense" | "transfer" | "opening_balance" | "imported";

/** Approval state — only "approved" entries affect balances and reports. */
export type EntryStatus = "pending" | "approved" | "rejected";

export interface EntryChange {
  at: string;
  by: string;
  action: string;
  detail: string;
  reason?: string | undefined;
}

export type CategoryId =
  | "sale_payment"
  | "purchase_payment"
  | "expense"
  | "uchhina_given"
  | "uchhina_received"
  | "uchhina_money_given"
  | "uchhina_money_received_back"
  | "owner_investment"
  | "owner_drawing"
  | "opening_balance"
  | "bank_transfer"
  | "bank_to_cash"
  | "cash_to_bank"
  | "cash_transfer"
  | "customer_refund"
  | "supplier_refund"
  | "loan_emi"
  | "bank_charges"
  | "interest"
  | "other";

export interface BankAccount {
  id: string;
  bankName: string;
  nickname: string;
  last4: string;
  openingBalance: number;
  active: boolean;
}

export interface CashLocation {
  id: string;
  name: string;
  openingBalance: number;
  active: boolean;
}

export type PartyType = "customer" | "supplier" | "founder" | "other";

export interface Party {
  id: string;
  name: string;
  type: PartyType;
  phone?: string | undefined;
  email?: string | undefined;
  gstin?: string | undefined;
  billingAddress?: string | undefined;
  country?: string | undefined;
  company?: string | undefined;
  city?: string | undefined;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  carat: number;
  rate: number;
  /** purchase-side manually entered line total */
  total?: number | undefined;
  /** number of pieces */
  pcs?: number | undefined;
  /** purchase only — price per carat in USD (optional) */
  rateUsd?: number | undefined;
  /** HSN / tariff code printed on the invoice PDF */
  hsnCode?: string | undefined;
}

/** Jewelry making bill line (purchase side) — fully manual fields. */
export interface MakingLine {
  id: string;
  description: string;
  quantity: number;
  grossWeight: number;
  netWeight: number;
  diamondWeight: number;
  makingRate: number;
  total: number;
  /** manual fields (new) */
  sku?: string | undefined;
  stoneWeight?: number | undefined;
  stoneAmount?: number | undefined;
  makingRatePerGram?: number | undefined;
  totalMaking?: number | undefined;
}

export type GstType = "igst" | "cgst_sgst" | "non_gst";
export type SaleType = "domestic" | "export" | "ue" | "ui" | "gst_inr";
export type InvoiceKind = "diamond" | "jewelry";
export type DiscountMode = "fixed" | "percent";
export type SupplyLocation = "inside" | "outside";
export type PurchaseType = "gst" | "non_gst" | "import";

export interface StoneLine {
  id: string;
  stoneType: string;
  size: string;
  carat: number;
  rate: number;
  value: number;
  /** optional stone size in mm */
  sizeMm?: string | undefined;
  /** directly entered stone total (overrides carat × rate when set) */
  totalAmount?: number | undefined;
}

export interface JewelryItem {
  id: string;
  description: string;
  karat: string;
  metalColour: string;
  netWeight: number;
  finePercent: number;
  fineGram: number;
  metalRate: number;
  metalValue: number;
  makingRate: number;
  makingValue: number;
  stones: StoneLine[];
  stoneValue: number;
  total: number;
  /** manual fields (new) */
  metal?: string | undefined;
  category?: string | undefined;
  grossWeight?: number | undefined;
  stoneWeight?: number | undefined;
  fineWeight24k?: number | undefined;
  metalRatePerGram?: number | undefined;
  makingRatePerGram?: number | undefined;
}

export interface Invoice {
  id: string;
  number: string;
  partyId: string;
  date: string;
  total: number;
  paid: number;
  dueDate?: string | undefined;
  voided?: boolean | undefined;
  sellerName?: string | undefined;
  platform?: string | undefined;
  invoiceKind?: InvoiceKind | undefined;
  jewelryItems?: JewelryItem[] | undefined;
  /** grand total in the original invoice currency */
  foreignTotal?: number | undefined;
  saleType?: SaleType | undefined;
  currency?: string | undefined;
  exchangeRate?: number | undefined;
  gstType?: GstType | undefined;
  gstRate?: number | undefined;
  lines?: InvoiceLine[] | undefined;
  subtotal?: number | undefined;
  discount?: number | undefined;
  taxableAmount?: number | undefined;
  taxAmount?: number | undefined;
  shipping?: number | undefined;
  roundOff?: number | undefined;
  notes?: string | undefined;
  /** manually typed payment due days — dueDate = date + dueDays */
  dueDays?: number | undefined;
  /** discount entry mode + typed value */
  discountMode?: DiscountMode | undefined;
  discountValue?: number | undefined;
  /** GST supply location — decides CGST/SGST vs IGST */
  supplyLocation?: SupplyLocation | undefined;
  cgstAmount?: number | undefined;
  sgstAmount?: number | undefined;
  igstAmount?: number | undefined;
  /** seller incentive % — internal only, never printed on the invoice */
  sellerIncentivePercent?: number | undefined;
  /** purchase side GST toggle */
  purchaseType?: PurchaseType | undefined;

  /* ---- purchase-side fields ---- */
  /** "diamond" = diamond purchase invoice, "jewelry_making" = jewelry making bill */
  billKind?: "diamond" | "jewelry_making" | undefined;
  brokerName?: string | undefined;
  supplierInvoiceNumber?: string | undefined;
  paymentTermsDays?: number | undefined;
  usdRate?: number | undefined;
  makingLines?: MakingLine[] | undefined;
  createdAt?: string | undefined;

  updatedAt?: string | undefined;
}

export interface Allocation {
  invoiceId: string;
  amount: number;
}

export interface Transaction {
  id: string;
  code: string;
  date: string;
  sourceType: SourceType;
  accountId: string;
  direction: Direction;
  amount: number;
  category: CategoryId | null;
  partyId: string | null;
  particulars: string;
  reference?: string | undefined;
  paymentMethod?: string | undefined;
  notes?: string | undefined;
  attachmentName?: string | undefined;
  transferGroupId?: string | undefined;
  allocations?: Allocation[] | undefined;
  advanceAmount?: number | undefined;
  uchhinaReturnDate?: string | undefined;
  drawingCategory?: string | undefined;
  /** expense head, e.g. "Office Expenses" */
  expenseCategory?: string | undefined;
  /** false = recorded but not yet paid (no bank/cash effect) */
  expensePaid?: boolean | undefined;
  /** true when the entry was recorded through Bank Entry / Cash Entry
   * (owned by the Bank Ledger / Cash Book, regardless of its category label) */
  ledger?: boolean | undefined;
  /** where this entry came from (manual, sales, transfer, …) */
  entrySource?: EntrySource | undefined;
  /** approval state — only "approved" affects balances and reports */
  status?: EntryStatus | undefined;
  /** reason captured when editing / rejecting / deleting an approved entry */
  statusReason?: string | undefined;
  approvedBy?: string | undefined;
  approvedAt?: string | undefined;
  /** full change history for this entry */
  history?: EntryChange[] | undefined;
  reconciled: boolean;
  voided: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: string;
  entity: string;
  detail: string;
  by: string;
}

export type ContactKind = "broker" | "seller";

/** Broker (purchase side) or seller / salesperson (sales side) master record. */
export interface Contact {
  id: string;
  kind: ContactKind;
  name: string;
  phone?: string | undefined;
  /** broker only */
  company?: string | undefined;
  /** seller only */
  role?: string | undefined;
  /** commission (broker) / incentive (seller) type */
  rateType: "percent" | "fixed";
  rate?: number | undefined;
  notes?: string | undefined;
}

/* ---------------- Liabilities ---------------- */

export type LiabilityKind =
  "friends_family" | "gold_loan" | "credit_card" | "bank_loan" | "business_loan" | "other";

export interface Liability {
  id: string;
  kind: LiabilityKind;
  name: string;
  lender: string;
  originalAmount: number;
  interestRate?: number | undefined;
  emi?: number | undefined;
  nextDueDate?: string | undefined;
  notes?: string | undefined;
  closed?: boolean | undefined;
  /** deleted records are excluded from every calculation, list and report */
  voided?: boolean | undefined;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export type LiabilityEntryType =
  "received" | "principal_repaid" | "interest_paid" | "additional_borrowing" | "adjustment";

export interface LiabilityEntry {
  id: string;
  liabilityId: string;
  date: string;
  type: LiabilityEntryType;
  particulars: string;
  principal: number;
  interest: number;
  paidFrom?: string | undefined;
  sourceModule: string;
  sourceTxId?: string | undefined;
  voided: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/* ---------------- Stock ---------------- */

export interface StockEntry {
  id: string;
  stock: "diamond" | "gold";
  date: string;
  description: string;
  category?: string | undefined;
  karat?: string | undefined;
  colour?: string | undefined;
  qtyIn: number;
  qtyOut: number;
  rate: number;
  reason?: string | undefined;
  /** manual adjustment audit — value before / after the change */
  adjustment?: boolean | undefined;
  prevQty?: number | undefined;
  newQty?: number | undefined;

  sourceModule: string;
  sourceTxId?: string | undefined;
  voided: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/* ---------------- Team ---------------- */

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  monthlySalary: number;
  incentiveType?: "percent" | "fixed" | undefined;
  incentiveRate?: number | undefined;
  active: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export type TeamPaymentType =
  "salary" | "incentive" | "bonus" | "reimbursement" | "deduction" | "advance";

export interface TeamPayment {
  id: string;
  memberId: string;
  date: string;
  type: TeamPaymentType;
  month: string;
  particulars: string;
  amount: number;
  paid: boolean;
  paidFrom?: string | undefined;
  sourceModule: string;
  sourceTxId?: string | undefined;
  voided: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/* ---------------- Goals ---------------- */

export interface Goal {
  id: string;
  scope: "overall" | "seller" | "platform";
  target: string;
  period: "yearly" | "monthly" | "weekly" | "daily";
  periodKey: string;
  amount: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/* ---------------- Settings ---------------- */

/** Page-wise permission flags for one app user. */
export interface UserPermission {
  page: string;
  view: boolean;
  add: boolean;
  edit: boolean;
  void: boolean;
  download: boolean;
  settings: boolean;
}

export interface AppUser {
  id: string;
  name: string;
  username: string;
  role: string;
  active: boolean;
  /** only ever a hashed/masked marker — never a plain-text password */
  passwordSet: boolean;
  permissions: UserPermission[];
}

export interface AppSettings {
  business: {
    name: string;
    legalName: string;
    gstin: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    state: string;
    financialYearStart: string;
    currency: string;
    /** Import Export Code */
    iec?: string | undefined;
    /** USA office address */
    usaAddress?: string | undefined;
  };
  branding: {
    primary: string;
    accent: string;
    font: string;
    invoiceHeader: string;
    invoiceFooter: string;
    /** soft pastel background colour used on cards */
    pastel?: string | undefined;
    /** uploaded logo as a data URL */
    logoDataUrl?: string | undefined;
  };
  invoice: {
    salesPrefix: string;
    salesStart: number;
    purchasePrefix: string;
    purchaseStart: number;
    diamondFormat: string;
    jewelryFormat: string;
    defaultDueDays: number;
    defaultTaxRate: number;
    defaultDiscount: number;
    shipping: number;
    roundOff: boolean;
    terms: string;
    bankDetails: string;
    signature: string;
    /** printed document title */
    title?: string | undefined;
    /** print the platform name on the invoice PDF (off by default) */
    showPlatform?: boolean | undefined;
    /** print the due date on the invoice PDF (off by default) */
    showDueDate?: boolean | undefined;
  };
  rules: {
    duplicateProtection: boolean;
    autoAllocateOldest: boolean;
    allowEditAfterPayment: boolean;
    voidInsteadOfDelete: boolean;
    monthlyLockDate: string;
  };
  security: {
    role: string;
    twoPersonVoid: boolean;
    users?: AppUser[] | undefined;
    /** minutes of inactivity before the session is auto-logged-out; 0 = disabled */
    idleTimeoutMinutes?: number | undefined;
  };
}

export interface LepdoData {
  /** Server-issued reset marker; prevents stale browser snapshots restoring cleared records. */
  accountingResetAt?: string | undefined;
  /** Permanent deletion markers so stale devices cannot restore removed contacts. */
  deletedPartyIds?: Record<string, string> | undefined;
  bankAccounts: BankAccount[];
  cashLocations: CashLocation[];
  parties: Party[];
  brokers: Contact[];
  sellers: Contact[];
  salesInvoices: Invoice[];
  purchaseBills: Invoice[];
  transactions: Transaction[];
  auditLogs: AuditEntry[];
  liabilities: Liability[];
  liabilityEntries: LiabilityEntry[];
  stockEntries: StockEntry[];
  teamMembers: TeamMember[];
  teamPayments: TeamPayment[];
  goals: Goal[];
  emiPlans: EmiPlan[];
  emiPayments: EmiPayment[];
  /** reusable master lists keyed by master id (see lib/lepdo/masters.ts) */
  masters: Record<string, MasterValue[]>;
  settings: AppSettings;
}

/* ---------------- EMI Tracker ---------------- */

export interface EmiPlan {
  id: string;
  name: string;
  amount: number;
  /** day of month the EMI is debited (1-31) */
  dueDay: number;
  paidFromType?: SourceType | undefined;
  paidFromId?: string | undefined;
  startDate: string;
  endDate?: string | undefined;
  installments?: number | undefined;
  notes?: string | undefined;
  closed?: boolean | undefined;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** One paid instalment of an EMI plan (month key "YYYY-MM"). */
export interface EmiPayment {
  id: string;
  planId: string;
  month: string;
  date: string;
  amount: number;
  notes?: string | undefined;
  voided: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/* ---------------- Master data ---------------- */

export interface MasterValue {
  id: string;
  name: string;
  active: boolean;
}
