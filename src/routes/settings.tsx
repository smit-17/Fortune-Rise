import { useEffect, useMemo, useRef, useState } from "react";
import lepdoLogo from "@/assets/lepdo-logo.png.asset.json";
import { createFileRoute } from "@tanstack/react-router";
import {
  Eye,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
  Download,
  ShieldAlert,
} from "lucide-react";
import { emailBackup } from "@/lib/lepdo/emailBackup.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeading } from "@/components/lepdo/bits";
import { NumInput } from "@/components/lepdo/numeric";
import {
  DownloadMenu,
  EmptyState,
  Field,
  ModalShell,
  SectionCard,
  StatCard,
  TextField,
} from "@/components/lepdo/shared";
import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney, uid } from "@/lib/lepdo/format";
import { useLepdo } from "@/lib/lepdo/store";
import { DEFAULT_SETTINGS } from "@/lib/lepdo/extras";
import { MASTERS } from "@/lib/lepdo/masters";
import type { AppSettings, AppUser, Contact, MasterValue, UserPermission } from "@/lib/lepdo/types";
import { UserManagement } from "@/components/lepdo/UserManagement";
import { resetAccountingData } from "@/lib/auth/adminApi";
import { useAuth } from "@/lib/auth/auth";
import { TIMEOUT_OPTIONS } from "@/lib/auth/permissions";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — LEPDO Accounting" },
      {
        name: "description",
        content:
          "Business profile, branding, invoice numbering, master data, accounting rules and security settings for LEPDO Accounting.",
      },
      { property: "og:title", content: "Settings — LEPDO Accounting" },
      {
        property: "og:description",
        content: "Configure business profile, branding, invoices, masters and accounting rules.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

type TabId = "business" | "branding" | "invoice" | "masters" | "rules" | "security";

const TABS: { id: TabId; label: string }[] = [
  { id: "business", label: "Business Profile" },
  { id: "branding", label: "Branding" },
  { id: "invoice", label: "Invoice Settings" },
  { id: "masters", label: "Master Data" },
  { id: "rules", label: "Accounting Rules" },
  { id: "security", label: "Users & Security" },
];

const INVOICE_TITLES = ["Invoice", "Tax Invoice", "Proforma Invoice", "Purchase Bill"];

const PERMISSION_PAGES = [
  "Dashboard",
  "Sales",
  "Purchase",
  "Expense",
  "Bank Ledger",
  "Cash Book",
  "Uchhina",
  "Drawings",
  "Capital",
  "Stock",
  "Team",
  "Goals",
  "Reports",
  "P&L",
  "Settings",
];

const PERMISSION_KEYS: (keyof Omit<UserPermission, "page">)[] = [
  "view",
  "add",
  "edit",
  "void",
  "download",
  "settings",
];

function defaultPermissions(): UserPermission[] {
  return PERMISSION_PAGES.map((page) => ({
    page,
    view: false,
    add: false,
    edit: false,
    void: false,
    download: false,
    settings: false,
  }));
}

function Settings() {
  const store = useLepdo();
  const [tab, setTab] = useState<TabId>("business");
  const [draft, setDraft] = useState<AppSettings>(store.settings);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState(false);

  // Keep the form in step with the shared cloud copy (first load and any live
  // update from another browser) unless the user has unsaved changes here.
  useEffect(() => {
    if (!dirty) setDraft(store.settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.settings, dirty]);

  const patch = <K extends keyof AppSettings>(key: K, value: Partial<AppSettings[K]>) => {
    setDraft((prev) => ({ ...prev, [key]: { ...prev[key], ...value } }));
    setDirty(true);
  };

  const save = () => {
    if (saving) return;
    setSaving(true);
    try {
      store.saveSettings(draft);
      setDirty(false);
      toast.success("Settings saved. Historical records are unchanged.");
    } catch {
      toast.error("Could not save settings.");
    } finally {
      setConfirmOpen(false);
      setTimeout(() => setSaving(false), 300);
    }
  };

  const reset = () => {
    setDraft(store.settings);
    setDirty(false);
    toast.message("Unsaved changes discarded.");
  };

  if (!store.ready) {
    return <p className="p-2 text-sm text-muted-foreground">Loading settings…</p>;
  }

  return (
    <div className="space-y-4">
      <PageHeading title="Settings" breadcrumb="LEPDO Accounting / Settings">
        <div className="flex flex-wrap items-center gap-2">
          <ResetDatasetAction />
          <Button variant="outline" size="sm" onClick={() => setPreview(true)}>
            <Eye className="size-4" /> Preview
          </Button>
          <Button variant="outline" size="sm" onClick={reset} disabled={!dirty}>
            <RotateCcw className="size-4" /> Reset
          </Button>
          <Button size="sm" disabled={!dirty || saving} onClick={() => setConfirmOpen(true)}>
            <Save className="size-4" /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </PageHeading>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="text-xs sm:text-sm">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "business" ? (
        <SectionCard title="Business details">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <TextField
              label="Business name"
              value={draft.business.name}
              onChange={(v) => patch("business", { name: v })}
            />
            <TextField
              label="Legal / registered name"
              value={draft.business.legalName}
              onChange={(v) => patch("business", { legalName: v })}
            />
            <TextField
              label="GSTIN"
              value={draft.business.gstin}
              onChange={(v) => patch("business", { gstin: v })}
            />
            <TextField
              label="IEC number"
              value={draft.business.iec ?? ""}
              onChange={(v) => patch("business", { iec: v })}
            />
            <TextField
              label="Phone"
              value={draft.business.phone}
              onChange={(v) => patch("business", { phone: v })}
            />
            <TextField
              label="Email"
              value={draft.business.email}
              onChange={(v) => patch("business", { email: v })}
            />
            <TextField
              label="City"
              value={draft.business.city}
              onChange={(v) => patch("business", { city: v })}
            />
            <TextField
              label="State"
              value={draft.business.state}
              onChange={(v) => patch("business", { state: v })}
            />
            <TextField
              label="Financial year start (MM-DD)"
              value={draft.business.financialYearStart}
              onChange={(v) => patch("business", { financialYearStart: v })}
            />
            <TextField
              label="Default currency"
              value={draft.business.currency}
              onChange={(v) => patch("business", { currency: v })}
            />
            <Field label="India address" className="sm:col-span-2 lg:col-span-3">
              <Textarea
                rows={2}
                value={draft.business.address}
                onChange={(e) => patch("business", { address: e.target.value })}
                className="text-sm"
              />
            </Field>
            <Field label="USA address" className="sm:col-span-2 lg:col-span-3">
              <Textarea
                rows={2}
                value={draft.business.usaAddress ?? ""}
                onChange={(e) => patch("business", { usaAddress: e.target.value })}
                className="text-sm"
              />
            </Field>
          </div>
        </SectionCard>
      ) : null}

      {tab === "branding" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <SectionCard title="Branding">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ColorField
                label="Primary colour"
                value={draft.branding.primary}
                onChange={(v) => patch("branding", { primary: v })}
              />
              <ColorField
                label="Accent / pastel colour"
                value={draft.branding.accent}
                onChange={(v) => patch("branding", { accent: v })}
              />
              <ColorField
                label="Card pastel background"
                value={draft.branding.pastel ?? "#F3F4FB"}
                onChange={(v) => patch("branding", { pastel: v })}
              />
              <TextField
                label="Font"
                value={draft.branding.font}
                onChange={(v) => patch("branding", { font: v })}
              />
              <TextField
                label="Invoice header"
                value={draft.branding.invoiceHeader}
                onChange={(v) => patch("branding", { invoiceHeader: v })}
              />
              <Field label="Invoice footer">
                <Textarea
                  rows={2}
                  value={draft.branding.invoiceFooter}
                  onChange={(e) => patch("branding", { invoiceFooter: e.target.value })}
                  className="text-sm"
                />
              </Field>
              <Field label="Logo" className="sm:col-span-2">
                <div className="flex flex-wrap items-center gap-3">
                  <img
                    src={draft.branding.logoDataUrl || lepdoLogo.url}
                    alt="Logo preview"
                    className="h-12 w-12 rounded-md border border-border bg-muted/40 object-contain"
                  />
                  {!draft.branding.logoDataUrl ? (
                    <span className="text-[11px] text-muted-foreground">
                      Using the default LEPDO logo
                    </span>
                  ) : null}
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/60">
                    <Upload className="size-3.5" />
                    {draft.branding.logoDataUrl ? "Replace" : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          patch("branding", { logoDataUrl: String(reader.result ?? "") });
                        };
                        reader.readAsDataURL(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {draft.branding.logoDataUrl ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => patch("branding", { logoDataUrl: "" })}
                    >
                      <X className="size-3.5" /> Remove
                    </Button>
                  ) : null}
                </div>
              </Field>
            </div>
          </SectionCard>
          <SectionCard title="Live preview">
            <InvoicePreview settings={draft} />
          </SectionCard>
        </div>
      ) : null}

      {tab === "invoice" ? (
        <SectionCard title="Invoice settings">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Invoice title">
              <select
                value={draft.invoice.title ?? "Invoice"}
                onChange={(e) => patch("invoice", { title: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {INVOICE_TITLES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <TextField
              label="Sales prefix"
              value={draft.invoice.salesPrefix}
              onChange={(v) => patch("invoice", { salesPrefix: v })}
            />
            <Field label="Sales starting number">
              <NumInput
                className="h-9"
                decimals={0}
                value={draft.invoice.salesStart}
                onChange={(v) => patch("invoice", { salesStart: v || 1 })}
              />
            </Field>
            <TextField
              label="Purchase prefix"
              value={draft.invoice.purchasePrefix}
              onChange={(v) => patch("invoice", { purchasePrefix: v })}
            />
            <Field label="Purchase starting number">
              <NumInput
                className="h-9"
                decimals={0}
                value={draft.invoice.purchaseStart}
                onChange={(v) => patch("invoice", { purchaseStart: v || 1 })}
              />
            </Field>
            <TextField
              label="Diamond format"
              value={draft.invoice.diamondFormat}
              onChange={(v) => patch("invoice", { diamondFormat: v })}
            />
            <TextField
              label="Jewelry format"
              value={draft.invoice.jewelryFormat}
              onChange={(v) => patch("invoice", { jewelryFormat: v })}
            />
            <Field label="Default due days">
              <NumInput
                className="h-9"
                decimals={0}
                value={draft.invoice.defaultDueDays}
                onChange={(v) => patch("invoice", { defaultDueDays: v })}
              />
            </Field>
            <Field label="Default tax rate %">
              <NumInput
                className="h-9"
                decimals={4}
                value={draft.invoice.defaultTaxRate}
                onChange={(v) => patch("invoice", { defaultTaxRate: v })}
              />
            </Field>
            <Field label="Default discount">
              <NumInput
                className="h-9"
                decimals={2}
                value={draft.invoice.defaultDiscount}
                onChange={(v) => patch("invoice", { defaultDiscount: v })}
              />
            </Field>
            <Field label="Default shipping">
              <NumInput
                className="h-9"
                decimals={2}
                value={draft.invoice.shipping}
                onChange={(v) => patch("invoice", { shipping: v })}
              />
            </Field>
            <Field label="Round off totals">
              <div className="flex h-9 items-center">
                <Switch
                  checked={draft.invoice.roundOff}
                  onCheckedChange={(v) => patch("invoice", { roundOff: v })}
                />
              </div>
            </Field>
            <TextField
              label="Signature label"
              value={draft.invoice.signature}
              onChange={(v) => patch("invoice", { signature: v })}
            />
            <Field label="Terms & conditions" className="sm:col-span-2">
              <Textarea
                rows={3}
                value={draft.invoice.terms}
                onChange={(e) => patch("invoice", { terms: e.target.value })}
                className="text-sm"
              />
            </Field>
            <Field label="Bank details">
              <Textarea
                rows={3}
                value={draft.invoice.bankDetails}
                onChange={(e) => patch("invoice", { bankDetails: e.target.value })}
                className="text-sm"
              />
            </Field>
          </div>
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => setPreview(true)}>
              <Eye className="size-4" /> PDF / print preview
            </Button>
          </div>
        </SectionCard>
      ) : null}

      {tab === "masters" ? <MasterData /> : null}

      {tab === "rules" ? (
        <SectionCard title="Accounting rules">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ToggleRow
              label="Duplicate protection"
              hint="Warn before saving an identical date, amount, account and reference."
              checked={draft.rules.duplicateProtection}
              onChange={(v) => patch("rules", { duplicateProtection: v })}
            />
            <ToggleRow
              label="Auto-allocate to oldest invoice"
              hint="Unallocated payments settle the oldest open invoice first."
              checked={draft.rules.autoAllocateOldest}
              onChange={(v) => patch("rules", { autoAllocateOldest: v })}
            />
            <ToggleRow
              label="Allow edit after payment"
              hint="When off, paid invoices can only be adjusted with a new entry."
              checked={draft.rules.allowEditAfterPayment}
              onChange={(v) => patch("rules", { allowEditAfterPayment: v })}
            />
            <ToggleRow
              label="Keep deleted entries in the activity trail"
              hint="Deleted entries never affect balances or reports; only the activity trail keeps a note."
              checked={draft.rules.voidInsteadOfDelete}
              onChange={(v) => patch("rules", { voidInsteadOfDelete: v })}
            />
            <TextField
              label="Monthly lock date"
              type="date"
              value={draft.rules.monthlyLockDate}
              onChange={(v) => patch("rules", { monthlyLockDate: v })}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Payment statuses stay automatic: Paid, Part Paid, Pending and Overdue are derived from
            invoice totals, allocations and due dates. Settings never alter or delete historical
            records.
          </p>
        </SectionCard>
      ) : null}

      {tab === "security" ? <Security draft={draft} patch={patch} /> : null}

      <ModalShell
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Save settings?"
        subtitle="Existing invoices, payments and ledgers are not changed."
        width="max-w-[460px]"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Confirm & save"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          New numbering, tax and rule defaults apply to entries created from now on. Historical
          records keep their original values.
        </p>
      </ModalShell>

      <ModalShell
        open={preview}
        onClose={() => setPreview(false)}
        title="Invoice preview"
        subtitle="Header, footer, terms and bank details as they will print"
        width="max-w-[720px]"
        footer={
          <Button variant="outline" size="sm" onClick={() => setPreview(false)}>
            Close
          </Button>
        }
      >
        <InvoicePreview settings={draft} full />
      </ModalShell>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-background p-0.5"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-sm" />
      </div>
    </Field>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function InvoicePreview({ settings, full }: { settings: AppSettings; full?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm">
      <div
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold"
        style={{ background: settings.branding.accent, color: settings.branding.primary }}
      >
        {settings.branding.logoDataUrl ? (
          <img
            src={settings.branding.logoDataUrl}
            alt="Logo"
            className="h-8 w-8 rounded bg-white object-contain p-0.5"
          />
        ) : null}
        <span className="min-w-0 truncate">
          {settings.branding.invoiceHeader || settings.business.name}
        </span>
      </div>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-navy">
        {settings.invoice.title ?? "Invoice"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {settings.business.legalName}
        {settings.business.gstin ? ` · GSTIN ${settings.business.gstin}` : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        {[settings.business.address, settings.business.city, settings.business.state]
          .filter(Boolean)
          .join(", ")}
      </p>
      <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs">
        <p>
          Invoice no. {settings.invoice.salesPrefix}
          {String(settings.invoice.salesStart).padStart(3, "0")}
        </p>
        <p>Due in {settings.invoice.defaultDueDays} days</p>
        <p>
          Tax {settings.invoice.defaultTaxRate}% · Currency {settings.business.currency}
        </p>
      </div>
      {full ? (
        <>
          <p className="mt-3 text-xs font-semibold text-navy">Terms</p>
          <p className="whitespace-pre-line text-xs text-muted-foreground">
            {settings.invoice.terms || "—"}
          </p>
          <p className="mt-2 text-xs font-semibold text-navy">Bank details</p>
          <p className="whitespace-pre-line text-xs text-muted-foreground">
            {settings.invoice.bankDetails || "—"}
          </p>
        </>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">{settings.branding.invoiceFooter}</p>
      <p className="mt-2 text-right text-xs font-semibold text-navy">
        {settings.invoice.signature}
      </p>
    </div>
  );
}

/* ================= Master Data ================= */

type PanelId =
  | "customers"
  | "suppliers"
  | "sellers"
  | "brokers"
  | "bankAccounts"
  | "cashBooks"
  | (typeof MASTERS)[number]["id"];

function MasterData() {
  const [panel, setPanel] = useState<PanelId>("platforms");

  const groups: { label: string; items: { id: PanelId; label: string }[] }[] = [
    {
      label: "Contacts",
      items: [
        { id: "customers", label: "Customers" },
        { id: "suppliers", label: "Suppliers" },
        { id: "sellers", label: "Sellers" },
        { id: "brokers", label: "Brokers" },
      ],
    },
    {
      label: "Accounts",
      items: [
        { id: "bankAccounts", label: "Bank Accounts" },
        { id: "cashBooks", label: "Cash Books" },
      ],
    },
    {
      label: "Dropdown lists",
      items: MASTERS.map((m) => ({ id: m.id as PanelId, label: m.label })),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr]">
      <div className="flex flex-wrap gap-1.5 lg:flex-col lg:flex-nowrap lg:gap-3 lg:overflow-y-auto lg:max-h-[70vh] lg:pr-1">
        {groups.map((g) => (
          <div key={g.label} className="lg:w-full">
            <p className="mb-1 hidden text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:block">
              {g.label}
            </p>
            <div className="flex flex-wrap gap-1.5 lg:flex-col">
              {g.items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setPanel(it.id)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition",
                    panel === it.id
                      ? "bg-navy text-navy-foreground"
                      : "bg-muted/60 text-foreground hover:bg-muted",
                  )}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="min-w-0">
        {panel === "customers" ? <PartyPanel type="customer" title="Customers" /> : null}
        {panel === "suppliers" ? <PartyPanel type="supplier" title="Suppliers" /> : null}
        {panel === "sellers" ? <ContactPanel kind="seller" title="Sellers" /> : null}
        {panel === "brokers" ? <ContactPanel kind="broker" title="Brokers" /> : null}
        {panel === "bankAccounts" ? <BankAccountsPanel /> : null}
        {panel === "cashBooks" ? <CashBooksPanel /> : null}
        {MASTERS.some((m) => m.id === panel) ? (
          <MasterListPanel
            masterId={panel}
            title={MASTERS.find((m) => m.id === panel)?.label ?? ""}
            hint={MASTERS.find((m) => m.id === panel)?.hint ?? ""}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Generic reusable panel for any list in MASTERS. */
function MasterListPanel({
  masterId,
  title,
  hint,
}: {
  masterId: string;
  title: string;
  hint: string;
}) {
  const store = useLepdo();
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const items = store.masters[masterId] ?? [];
  const filtered = items.filter((v) => v.name.toLowerCase().includes(search.trim().toLowerCase()));

  const isDuplicate = (name: string, ignoreId?: string) =>
    items.some(
      (v) => v.id !== ignoreId && v.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    if (isDuplicate(name)) {
      toast.error(`"${name}" already exists.`);
      return;
    }
    store.saveMaster(masterId, { name });
    setNewName("");
    toast.success("Added.");
  };

  const rename = () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    if (isDuplicate(name, editing.id)) {
      toast.error(`"${name}" already exists.`);
      return;
    }
    store.saveMaster(masterId, { id: editing.id, name });
    setEditing(null);
    toast.success("Updated.");
  };

  const remove = (v: MasterValue) => {
    const res = store.removeMaster(masterId, v.id);
    if (res.ok) toast.success(res.message);
    else toast.message(res.message);
  };

  return (
    <SectionCard title={title}>
      <p className="mb-2 text-[11px] text-muted-foreground">{hint}</p>
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 text-sm"
        />
      </div>
      <div className="max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <EmptyState title="No values" hint="Add one below." />
        ) : (
          filtered.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
            >
              {editing?.id === v.id ? (
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ id: v.id, name: e.target.value })}
                  className="h-8 flex-1 text-sm"
                  autoFocus
                />
              ) : (
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    !v.active && "text-muted-foreground line-through",
                  )}
                >
                  {v.name}
                </span>
              )}
              {editing?.id === v.id ? (
                <>
                  <Button size="sm" variant="outline" onClick={rename}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing({ id: v.id, name: v.name })}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => store.setMasterActive(masterId, v.id, !v.active)}
                  >
                    {v.active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(v)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          placeholder="Add new value…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-9 flex-1 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <Button size="sm" disabled={!newName.trim()} onClick={add}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
    </SectionCard>
  );
}

function PartyPanel({ type, title }: { type: "customer" | "supplier"; title: string }) {
  const store = useLepdo();
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const items = store.parties.filter((p) => p.type === type);
  const filtered = items.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  const isDuplicate = (name: string, ignoreId?: string) =>
    items.some(
      (p) => p.id !== ignoreId && p.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    if (isDuplicate(name)) {
      toast.error(`"${name}" already exists.`);
      return;
    }
    store.saveCustomer({ name, type });
    setNewName("");
    toast.success(`${title.slice(0, -1)} added.`);
  };

  const rename = () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    if (isDuplicate(name, editing.id)) {
      toast.error(`"${name}" already exists.`);
      return;
    }
    store.saveCustomer({ id: editing.id, name, type });
    setEditing(null);
    toast.success("Updated.");
  };

  return (
    <SectionCard title={title}>
      <Input
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 h-9 text-sm"
      />
      <div className="max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <EmptyState title={`No ${title.toLowerCase()} yet`} />
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
            >
              {editing?.id === p.id ? (
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                  className="h-8 flex-1 text-sm"
                  autoFocus
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              )}
              {editing?.id === p.id ? (
                <>
                  <Button size="sm" variant="outline" onClick={rename}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Rename"
                    onClick={() => setEditing({ id: p.id, name: p.name })}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Delete"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Delete "${p.name}" from ${title.toLowerCase()}? Invoices and bills that already use this name are not changed.`,
                        )
                      )
                        return;
                      store.removeParty(p.id);
                      if (editing?.id === p.id) setEditing(null);
                      toast.success(`${title.slice(0, -1)} deleted.`);
                    }}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          placeholder={`Add new ${title.toLowerCase().slice(0, -1)}…`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-9 flex-1 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <Button size="sm" disabled={!newName.trim()} onClick={add}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
    </SectionCard>
  );
}

function ContactPanel({ kind, title }: { kind: Contact["kind"]; title: string }) {
  const store = useLepdo();
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const items = kind === "broker" ? store.brokers : store.sellers;
  const filtered = items.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()));

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    const res = store.saveContact({ kind, name, rateType: "percent" });
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setNewName("");
    toast.success(res.message);
  };

  const rename = () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    const existing = items.find((c) => c.id === editing.id);
    if (!existing) return;
    const res = store.saveContact({ ...existing, id: editing.id, name });
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setEditing(null);
    toast.success(res.message);
  };

  return (
    <SectionCard title={title}>
      <Input
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 h-9 text-sm"
      />
      <div className="max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <EmptyState title={`No ${title.toLowerCase()} yet`} />
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
            >
              {editing?.id === c.id ? (
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                  className="h-8 flex-1 text-sm"
                  autoFocus
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm">
                  {c.name}
                  {c.rate ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {c.rateType === "percent" ? `${c.rate}%` : formatMoney(c.rate)}
                    </span>
                  ) : null}
                </span>
              )}
              {editing?.id === c.id ? (
                <>
                  <Button size="sm" variant="outline" onClick={rename}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ id: c.id, name: c.name })}
                >
                  <Pencil className="size-3.5" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          placeholder={`Add new ${title.toLowerCase().slice(0, -1)}…`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-9 flex-1 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <Button size="sm" disabled={!newName.trim()} onClick={add}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
    </SectionCard>
  );
}

function BankAccountsPanel() {
  const store = useLepdo();
  const [search, setSearch] = useState("");
  const [bank, setBank] = useState({ bankName: "", nickname: "", last4: "", openingBalance: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ bankName: "", nickname: "", openingBalance: "" });

  const filtered = store.bankAccounts.filter(
    (a) =>
      a.bankName.toLowerCase().includes(search.trim().toLowerCase()) ||
      a.nickname.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <SectionCard title="Bank accounts">
      <Input
        placeholder="Search bank accounts…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 h-9 text-sm"
      />
      <div className="overflow-x-auto">
        <Table className="min-w-[680px]">
          <TableHeader>
            <TableRow className="bg-muted/60">
              <TableHead>Bank</TableHead>
              <TableHead>Nickname</TableHead>
              <TableHead>Last 4</TableHead>
              <TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((a) =>
              editingId === a.id ? (
                <TableRow key={a.id}>
                  <TableCell>
                    <Input
                      value={editDraft.bankName}
                      onChange={(e) => setEditDraft({ ...editDraft, bankName: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={editDraft.nickname}
                      onChange={(e) => setEditDraft({ ...editDraft, nickname: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>••••{a.last4}</TableCell>
                  <TableCell>
                    <Input
                      value={editDraft.openingBalance}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, openingBalance: e.target.value })
                      }
                      className="h-8 text-right text-sm"
                    />
                  </TableCell>
                  <TableCell className="num text-right font-semibold">
                    {formatMoney(store.balanceOf("bank", a.id))}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          store.saveBankAccount({
                            ...a,
                            bankName: editDraft.bankName.trim() || a.bankName,
                            nickname: editDraft.nickname.trim() || a.nickname,
                            openingBalance: Number(editDraft.openingBalance) || 0,
                          });
                          setEditingId(null);
                          toast.success("Bank account updated.");
                        }}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.bankName}</TableCell>
                  <TableCell>{a.nickname}</TableCell>
                  <TableCell>••••{a.last4}</TableCell>
                  <TableCell className="num text-right">{formatMoney(a.openingBalance)}</TableCell>
                  <TableCell className="num text-right font-semibold">
                    {formatMoney(store.balanceOf("bank", a.id))}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(a.id);
                          setEditDraft({
                            bankName: a.bankName,
                            nickname: a.nickname,
                            openingBalance: String(a.openingBalance),
                          });
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => store.saveBankAccount({ ...a, active: !a.active })}
                      >
                        {a.active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
        <TextField
          label="Bank name"
          value={bank.bankName}
          onChange={(v) => setBank({ ...bank, bankName: v })}
        />
        <TextField
          label="Nickname"
          value={bank.nickname}
          onChange={(v) => setBank({ ...bank, nickname: v })}
        />
        <TextField
          label="Last 4"
          value={bank.last4}
          onChange={(v) => setBank({ ...bank, last4: v })}
        />
        <TextField
          label="Opening balance"
          value={bank.openingBalance}
          onChange={(v) => setBank({ ...bank, openingBalance: v })}
        />
        <div className="flex items-end">
          <Button
            className="w-full"
            disabled={!bank.bankName.trim()}
            onClick={() => {
              store.saveBankAccount({
                bankName: bank.bankName.trim(),
                nickname: bank.nickname.trim() || bank.bankName.trim(),
                last4: bank.last4.trim() || "0000",
                openingBalance: Number(bank.openingBalance) || 0,
                active: true,
              });
              setBank({ bankName: "", nickname: "", last4: "", openingBalance: "" });
              toast.success("Bank account added.");
            }}
          >
            <Plus className="size-4" /> Add account
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

function CashBooksPanel() {
  const store = useLepdo();
  const [search, setSearch] = useState("");
  const [cash, setCash] = useState({ name: "", openingBalance: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", openingBalance: "" });

  const filtered = store.cashLocations.filter((l) =>
    l.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <SectionCard title="Cash books">
      <Input
        placeholder="Search cash books…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 h-9 text-sm"
      />
      <div className="overflow-x-auto">
        <Table className="min-w-[520px]">
          <TableHeader>
            <TableRow className="bg-muted/60">
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((l) =>
              editingId === l.id ? (
                <TableRow key={l.id}>
                  <TableCell>
                    <Input
                      value={editDraft.name}
                      onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={editDraft.openingBalance}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, openingBalance: e.target.value })
                      }
                      className="h-8 text-right text-sm"
                    />
                  </TableCell>
                  <TableCell className="num text-right font-semibold">
                    {formatMoney(store.balanceOf("cash", l.id))}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          store.saveCashLocation({
                            ...l,
                            name: editDraft.name.trim() || l.name,
                            openingBalance: Number(editDraft.openingBalance) || 0,
                          });
                          setEditingId(null);
                          toast.success("Cash book updated.");
                        }}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="num text-right">{formatMoney(l.openingBalance)}</TableCell>
                  <TableCell className="num text-right font-semibold">
                    {formatMoney(store.balanceOf("cash", l.id))}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(l.id);
                          setEditDraft({ name: l.name, openingBalance: String(l.openingBalance) });
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => store.saveCashLocation({ ...l, active: !l.active })}
                      >
                        {l.active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TextField
          label="Location name"
          value={cash.name}
          onChange={(v) => setCash({ ...cash, name: v })}
        />
        <TextField
          label="Opening balance"
          value={cash.openingBalance}
          onChange={(v) => setCash({ ...cash, openingBalance: v })}
        />
        <div className="flex items-end">
          <Button
            className="w-full"
            disabled={!cash.name.trim()}
            onClick={() => {
              store.saveCashLocation({
                name: cash.name.trim(),
                openingBalance: Number(cash.openingBalance) || 0,
                active: true,
              });
              setCash({ name: "", openingBalance: "" });
              toast.success("Cash book added.");
            }}
          >
            <Plus className="size-4" /> Add cash book
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

/* ================= Users & Security ================= */

const MAX_BACKUPS = 7;

interface BackupEntry {
  id: string;
  at: string;
  data: unknown;
}

interface RestoreEntry {
  at: string;
  file: string;
  user: string;
}

// Backup snapshots and the restore log are kept for the current session only —
// the accounting data itself lives in the database, and downloaded backup files
// are the durable copy. Nothing is written to browser storage.

function Security({
  draft,
  patch,
}: {
  draft: AppSettings;
  patch: <K extends keyof AppSettings>(key: K, value: Partial<AppSettings[K]>) => void;
}) {
  const store = useLepdo();
  const auth = useAuth();
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [restores, setRestores] = useState<RestoreEntry[]>([]);

  const [restoreFile, setRestoreFile] = useState<{ name: string; data: unknown } | null>(null);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditSection, setAuditSection] = useState("all");

  const snapshotData = () => JSON.parse(JSON.stringify(store, replacer)) as unknown;

  const runBackup = (auto: boolean) => {
    const entry: BackupEntry = {
      id: uid("bkp"),
      at: new Date().toISOString(),
      data: snapshotData(),
    };
    const next = [entry, ...backups].slice(0, MAX_BACKUPS);
    setBackups(next);

    if (!auto) {
      const blob = new Blob([JSON.stringify(entry.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lepdo-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Backup created and downloaded.");
    }
    return entry;
  };

  const backup = () => runBackup(false);

  const [emailing, setEmailing] = useState(false);
  const emailBackupNow = async () => {
    setEmailing(true);
    try {
      const entry = runBackup(true);
      const filename = `lepdo-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const json = JSON.stringify(entry.data, null, 2);
      const bytes = new TextEncoder().encode(json);
      let bin = "";
      for (const b of bytes) bin += String.fromCharCode(b);
      const contentBase64 = btoa(bin);
      const res = await emailBackup({ data: { filename, contentBase64 } });
      if (res.ok) toast.success("Backup emailed to lepdogroup@gmail.com");
      else toast.error(res.error ?? "Could not send the backup email.");
    } catch {
      toast.error("Could not send the backup email.");
    } finally {
      setEmailing(false);
    }
  };

  // Automatic daily backup — runs once per app load if the newest backup is stale.
  useEffect(() => {
    const latest = backups[0];
    const stale = !latest || Date.now() - new Date(latest.at).getTime() > 24 * 60 * 60 * 1000;
    if (stale) runBackup(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRestoreFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? "{}"));
        setRestoreFile({ name: file.name, data: parsed });
        setRestoreOpen(true);
      } catch {
        toast.error("That file isn't valid backup JSON.");
      }
    };
    reader.readAsText(file);
  };

  const confirmRestore = () => {
    if (!restoreFile) return;
    try {
      // Restore writes the snapshot into the database (single source of truth);
      // every other browser receives it through the realtime subscription.
      store.replaceAll(restoreFile.data as never);
      const entry: RestoreEntry = {
        at: new Date().toISOString(),
        file: restoreFile.name,
        user: draft.security.role || "Owner",
      };
      setRestores([entry, ...restores]);
      toast.success("Data restored to the database.");
      setRestoreOpen(false);
      setRestoreFile(null);
    } catch {
      toast.error("Restore failed — that file isn't a valid backup.");
    }
  };

  // Session timeout is enforced centrally by the sign-in layer (see src/lib/auth/auth.tsx).

  const auditEntity = (e: string) => e.split(":")[0] ?? e;
  const sections = Array.from(new Set(store.auditLogs.map((l) => auditEntity(l.entity)))).sort();
  const filteredAudit = store.auditLogs.filter((l) => {
    if (auditSection !== "all" && auditEntity(l.entity) !== auditSection) return false;
    const q = auditSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      l.action.toLowerCase().includes(q) ||
      l.entity.toLowerCase().includes(q) ||
      l.detail.toLowerCase().includes(q) ||
      l.by.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Signed-in role" value={draft.security.role} tone="blue" />
        <StatCard label="Audit entries" value={String(store.auditLogs.length)} tone="purple" />
        <StatCard label="Transactions" value={String(store.transactions.length)} tone="green" />
        <StatCard
          label="Monthly lock"
          value={draft.rules.monthlyLockDate || "Not set"}
          tone="orange"
        />
      </div>

      <SectionCard title="Roles & permissions">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Role">
            <select
              value={draft.security.role}
              onChange={(e) => patch("security", { role: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {["Owner", "Accountant", "Staff", "Viewer"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Two-person approval for delete">
            <div className="flex h-9 items-center">
              <Switch
                checked={draft.security.twoPersonVoid}
                onCheckedChange={(v) => patch("security", { twoPersonVoid: v })}
              />
            </div>
          </Field>
          <Field label="Default session timeout for new users">
            <select
              value={draft.security.idleTimeoutMinutes ?? 60}
              onChange={(e) => patch("security", { idleTimeoutMinutes: Number(e.target.value) })}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {TIMEOUT_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Backup & Restore">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Last backup"
            value={backups[0] ? formatDateTime(backups[0].at) : "Never"}
            tone={backups[0] ? "green" : "orange"}
          />
          <StatCard label="Backups kept" value={String(backups.length)} tone="blue" />
          <StatCard label="Restores logged" value={String(restores.length)} tone="purple" />
          <StatCard
            label="Status"
            value={
              backups[0] && Date.now() - new Date(backups[0].at).getTime() < 24 * 60 * 60 * 1000
                ? "Up to date"
                : "Due"
            }
            tone="navy"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={backup}>
            <Download className="size-3.5" /> Backup now
          </Button>
          <Button variant="outline" size="sm" onClick={emailBackupNow} disabled={emailing}>
            <Mail className="size-3.5" /> {emailing ? "Sending…" : "Email backup"}
          </Button>
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted/60">
            <Upload className="size-3.5" /> Restore from file
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleRestoreFile(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldAlert className="size-3.5" /> An automatic daily backup is taken on app load when
          the newest backup is older than 24 hours. The 7 most recent backups are kept.
        </p>
        {restores.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold text-foreground">Restore history</p>
            <div className="overflow-x-auto">
              <Table className="min-w-[480px]">
                <TableHeader>
                  <TableRow className="bg-muted/60">
                    <TableHead>When</TableHead>
                    <TableHead>Source file</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {restores.map((r, i) => (
                    <TableRow key={`${r.at}-${i}`}>
                      <TableCell className="text-xs">{formatDateTime(r.at)}</TableCell>
                      <TableCell className="text-xs">{r.file}</TableCell>
                      <TableCell className="text-xs">{r.user}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <UserManagement />

      <SectionCard
        title="Audit log"
        actions={
          <DownloadMenu
            label="Download"
            build={() => ({
              title: "Audit Log",
              subtitle: "All create, edit, delete and restore activity",
              columns: [
                { key: "date", label: "Date" },
                { key: "time", label: "Time" },
                { key: "by", label: "User" },
                { key: "entity", label: "Section" },
                { key: "detail", label: "Record" },
                { key: "action", label: "Action" },
              ],
              rows: filteredAudit.map((l) => {
                const [date, time] = formatDateTime(l.at).split(" ", 2);
                return {
                  date: date ?? "",
                  time: formatDateTime(l.at)
                    .slice(date?.length ?? 0)
                    .trim(),
                  by: l.by,
                  entity: l.entity,
                  detail: l.detail,
                  action: l.action,
                };
              }),
            })}
          />
        }
      >
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px]">
          <Input
            placeholder="Search action, entity, detail or user…"
            value={auditSearch}
            onChange={(e) => setAuditSearch(e.target.value)}
            className="h-9 text-sm"
          />
          <select
            value={auditSection}
            onChange={(e) => setAuditSection(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">All sections</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {filteredAudit.length === 0 ? (
          <EmptyState title="No matching activity" />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow className="bg-muted/60">
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Previous value</TableHead>
                  <TableHead>New value</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAudit.slice(0, 100).map((log) => {
                  const full = formatDateTime(log.at);
                  const [datePart, ...rest] = full.split(" ");
                  const timePart = rest.join(" ");
                  const change = /^(.*?) — (.+?) → (.+)$/.exec(log.detail);
                  const record = change ? change[1] : log.detail;
                  const prev = change ? change[2] : undefined;
                  const next = change ? change[3] : undefined;
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs">{datePart}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{timePart}</TableCell>
                      <TableCell className="text-xs">{log.by}</TableCell>
                      <TableCell className="text-xs">{log.entity}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{record}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{prev ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{next ?? "—"}</TableCell>
                      <TableCell className="text-xs font-medium">{log.action}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <ModalShell
        open={restoreOpen}
        onClose={() => {
          setRestoreOpen(false);
          setRestoreFile(null);
        }}
        title="Restore from backup?"
        subtitle={restoreFile?.name}
        width="max-w-[460px]"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRestoreOpen(false);
                setRestoreFile(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmRestore}>
              Confirm & restore
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          This replaces all current business data with the contents of the uploaded backup file. The
          app will reload after restoring. This action cannot be undone — download a fresh backup
          first if unsure.
        </p>
      </ModalShell>
    </div>
  );
}

function replacer(_key: string, value: unknown) {
  return typeof value === "function" ? undefined : value;
}

export const SETTINGS_DEFAULTS = DEFAULT_SETTINGS;

/**
 * Reset to Starting Dataset — clears only accounting records. Accounts, roles,
 * permissions and every settings value are untouched.
 */
function ResetDatasetAction() {
  const auth = useAuth();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);
  if (!auth.can("dataset.reset")) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
        <RotateCcw className="size-4" /> Reset to Starting Dataset
      </Button>
      <ModalShell
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setResetConfirm("");
        }}
        title="Reset to Starting Dataset"
        width="max-w-[480px]"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setResetOpen(false);
                setResetConfirm("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={resetConfirm.trim().toUpperCase() !== "RESET" || resetting}
              onClick={async () => {
                setResetting(true);
                try {
                  await resetAccountingData();
                  setResetOpen(false);
                  setResetConfirm("");
                  toast.success("Accounting data cleared. Users and settings were kept.");
                  window.location.reload();
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "The reset could not be completed.",
                  );
                } finally {
                  setResetting(false);
                }
              }}
            >
              {resetting ? "Resetting…" : "Reset data"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This clears invoices, bills, payments, expenses, bank and cash entries, uchhina,
            drawings, capital, stock, team records, goals and the activity trail.
          </p>
          <p className="text-sm text-muted-foreground">
            Your users, passwords, roles, permissions, business profile, branding, invoice settings,
            master lists, bank accounts and cash books are kept. Download a backup first — this
            cannot be undone.
          </p>
          <Field label="Type RESET to confirm">
            <Input
              className="h-9"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder="RESET"
            />
          </Field>
        </div>
      </ModalShell>
    </>
  );
}
