import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { STATUS_CLASS, STATUS_LABEL, type InvoiceStatus } from "@/lib/lepdo/sales";
import { SearchSelect } from "@/components/lepdo/shared";

export const MODAL_CLASS =
  "flex w-[calc(100vw-1rem)] max-w-[880px] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:w-full " +
  "max-h-[85vh] max-sm:h-dvh max-sm:max-h-dvh max-sm:w-screen max-sm:max-w-none max-sm:rounded-none";

export const WIDE_MODAL_CLASS =
  "flex w-[calc(100vw-1rem)] max-w-[1320px] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:w-full " +
  "max-h-[90vh] max-sm:h-dvh max-sm:max-h-dvh max-sm:w-screen max-sm:max-w-none max-sm:rounded-none";

export const TONE: Record<string, string> = {
  total: "bg-sl-total-bg text-sl-total",
  paid: "bg-sl-paid-bg text-sl-paid",
  pending: "bg-sl-pending-bg text-sl-pending",
  advance: "bg-sl-advance-bg text-sl-advance",
  part: "bg-sl-part-bg text-sl-part",
  customer: "bg-sl-customer-bg text-sl-customer",
  settled: "bg-sl-settled-bg text-sl-settled",
  purchase: "bg-pu-total-bg text-pu-total",
  supplier: "bg-pu-supplier-bg text-pu-supplier",
};

export function Stat({
  label,
  value,
  tone,
  hint,
  icon,
}: {
  label: string;
  value: string;
  tone: keyof typeof TONE;
  hint?: string | undefined;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border border-border p-3", TONE[tone])}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium opacity-80">{label}</p>
        {icon}
      </div>
      <p className="num mt-1.5 text-base font-semibold lg:text-lg">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] opacity-70">{hint}</p> : null}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-navy">{title}</h2>
        {action}
      </header>
      <div className="p-2 lg:p-3">{children}</div>
    </section>
  );
}

export function StatusChip({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium",
        STATUS_CLASS[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="opacity-80">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Label className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-neg"> *</span> : null}
      </Label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Searchable dropdown that also accepts any custom typed value.
 * Uses a native datalist so existing options are listed while free text stays allowed.
 */
export function Combo({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
  className?: string;
  inputMode?: "text" | "decimal";
}) {
  return (
    <SearchSelect
      value={value}
      options={options}
      onChange={onChange}
      {...(placeholder !== undefined ? { placeholder } : {})}
      {...(className !== undefined ? { className } : {})}
    />
  );
}

/** Permanent column title for item tables (hidden on mobile where cards use per-field labels). */
export function ColHead({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Field label shown above an input inside a mobile item card. */
export function CellLabel({ label }: { label: string }) {
  return (
    <span className="mb-1 block text-[11px] font-medium text-muted-foreground sm:hidden">
      {label}
    </span>
  );
}
