import { useId, useState, type ReactNode } from "react";
import {
  Check,
  ChevronsUpDown,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Printer,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/lepdo/format";
import {
  downloadTableCsv,
  downloadTableExcel,
  downloadTablePdf,
  type ExportTable,
} from "@/lib/lepdo/exportTable";
import type { Tone } from "@/lib/lepdo/extras";
import { useLepdo } from "@/lib/lepdo/store";
import { masterOptions } from "@/lib/lepdo/masters";

/** LEPDO pastel tone classes — background + matching dark text. */
export const TONE: Record<Tone, { bg: string; text: string; chip: string }> = {
  blue: { bg: "bg-sl-total-bg", text: "text-sl-total", chip: "bg-sl-total-bg text-sl-total" },
  green: { bg: "bg-sl-paid-bg", text: "text-sl-paid", chip: "bg-sl-paid-bg text-sl-paid" },
  red: {
    bg: "bg-sl-pending-bg",
    text: "text-sl-pending",
    chip: "bg-sl-pending-bg text-sl-pending",
  },
  purple: {
    bg: "bg-sl-advance-bg",
    text: "text-sl-advance",
    chip: "bg-sl-advance-bg text-sl-advance",
  },
  orange: { bg: "bg-sl-part-bg", text: "text-sl-part", chip: "bg-sl-part-bg text-sl-part" },
  yellow: {
    bg: "bg-sl-customer-bg",
    text: "text-sl-customer",
    chip: "bg-sl-customer-bg text-sl-customer",
  },
  grey: {
    bg: "bg-sl-settled-bg",
    text: "text-sl-settled",
    chip: "bg-sl-settled-bg text-sl-settled",
  },
  navy: { bg: "bg-gold-tint", text: "text-navy", chip: "bg-gold-tint text-navy" },
};

/** Compact pastel metric card used across all new sections. */
export function StatCard({
  label,
  value,
  hint,
  tone = "navy",
  icon,
  onClick,
  className,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  tone?: Tone;
  icon?: ReactNode | undefined;
  onClick?: (() => void) | undefined;
  className?: string | undefined;
}) {
  const t = TONE[tone];
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "rounded-xl border border-border p-3 text-left shadow-sm",
        t.bg,
        onClick ? "transition hover:shadow-md" : "",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-xs font-medium", t.text)}>{label}</p>
        {icon ? <span className={cn("shrink-0", t.text)}>{icon}</span> : null}
      </div>
      <p className={cn("num mt-1.5 text-lg font-semibold leading-tight sm:text-xl", t.text)}>
        {value}
      </p>
      {hint ? <p className={cn("mt-0.5 text-[11px] opacity-80", t.text)}>{hint}</p> : null}
    </Comp>
  );
}

export function Chip({ tone = "grey", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold",
        TONE[tone].chip,
      )}
    >
      {children}
    </span>
  );
}

export function SectionCard({
  title,
  actions,
  children,
  className,
}: {
  title?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", className)}>
      {title || actions ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-sm font-semibold text-navy">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Excel / PDF / CSV download menu built on the shared export table. */
export function DownloadMenu({
  build,
  label = "Download",
  size = "sm",
}: {
  build: () => ExportTable;
  label?: string;
  size?: "sm" | "default";
}) {
  const [busy, setBusy] = useState(false);
  const run = (fn: (t: ExportTable) => void) => {
    if (busy) return;
    setBusy(true);
    try {
      fn(build());
    } finally {
      setTimeout(() => setBusy(false), 400);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={busy} className="gap-1.5">
          <Download className="size-4" /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => run(downloadTableExcel)}>
          <FileSpreadsheet className="size-4" /> Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run((t) => void downloadTablePdf(t))}>
          <FileText className="size-4" /> PDF / Print
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(downloadTableCsv)}>
          <Printer className="size-4" /> CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Centered modal shell: fixed header/footer, scrolling body, full-screen on mobile. */
export function ModalShell({
  open,
  onClose,
  title,
  subtitle,
  footer,
  width = "max-w-[820px]",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | undefined;
  footer?: ReactNode | undefined;
  width?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <div
        className={cn(
          "flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-card shadow-2xl sm:max-h-[90vh] sm:rounded-2xl",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border bg-navy px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-navy-foreground">{title}</p>
            {subtitle ? (
              <p className="truncate text-[11px] text-navy-foreground/70">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-navy-foreground/80 hover:bg-white/10"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/40 px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Labelled field wrapper — label always above the control (mobile friendly). */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  readOnly,
  className,
}: {
  label: string;
  value: string | number;
  onChange?: ((v: string) => void) | undefined;
  type?: string;
  placeholder?: string | undefined;
  readOnly?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <Field label={label} className={className}>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn("h-9 text-sm", readOnly ? "bg-muted/60" : "")}
      />
    </Field>
  );
}

/**
 * Searchable dropdown: click opens a real list, typing filters it and (when
 * allowed) a brand-new value can be added on the fly. Used for every
 * master-driven field so desktop and mobile behave identically.
 */
export function SearchSelect({
  value,
  options,
  onChange,
  placeholder,
  className,
  allowCreate = true,
  onCreate,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  allowCreate?: boolean;
  onCreate?: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const filtered = trimmed
    ? options.filter((o) => o.toLowerCase().includes(trimmed.toLowerCase()))
    : options;
  const canCreate =
    allowCreate && !!trimmed && !options.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  const pick = (v: string, isNew: boolean) => {
    if (isNew) onCreate?.(v);
    onChange(v);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 w-full justify-between px-3 text-left text-sm font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value || placeholder || "Select or type a value"}</span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type new…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {!filtered.length && !canCreate ? <CommandEmpty>No matches.</CommandEmpty> : null}
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem key={o} value={o} onSelect={() => pick(o, false)}>
                  <Check className={cn("size-3.5", value === o ? "opacity-100" : "opacity-0")} />
                  {o}
                </CommandItem>
              ))}
              {canCreate ? (
                <CommandItem value={`__add_${trimmed}`} onSelect={() => pick(trimmed, true)}>
                  <Plus className="size-3.5" /> Add “{trimmed}”
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Searchable dropdown backed by a Settings → Master Data list. */
export function MasterCombo({
  masterId,
  value,
  onChange,
  placeholder,
  className,
  includeInactive,
  allowCreate = true,
}: {
  masterId: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  includeInactive?: boolean;
  allowCreate?: boolean;
}) {
  const store = useLepdo();
  const options = masterOptions(store.masters, masterId, includeInactive);
  return (
    <SearchSelect
      value={value}
      options={options}
      onChange={onChange}
      {...(placeholder !== undefined ? { placeholder } : {})}
      {...(className !== undefined ? { className } : {})}
      allowCreate={allowCreate}
      onCreate={(v) => store.saveMaster(masterId, { name: v })}
    />
  );
}

export function ProgressBar({ percent, tone = "green" }: { percent: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full", TONE[tone].text.replace("text-", "bg-"))}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Audit footprint shown on records: who created / updated and when. */
export function AuditLine({
  record,
  sourceModule,
  onViewSource,
}: {
  record: {
    createdBy: string;
    createdAt: string;
    updatedBy?: string | undefined;
    updatedAt: string;
  };
  sourceModule?: string | undefined;
  onViewSource?: (() => void) | undefined;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
      <span>
        Created by {record.createdBy} · {formatDateTime(record.createdAt)}
      </span>
      <span>
        · Updated by {record.updatedBy ?? record.createdBy} · {formatDateTime(record.updatedAt)}
      </span>
      {sourceModule ? <span>· Source: {sourceModule}</span> : null}
      {onViewSource ? (
        <button type="button" onClick={onViewSource} className="font-semibold text-navy underline">
          View source entry
        </button>
      ) : null}
    </p>
  );
}

/** Simple client-side pagination for long tables. */
export function usePaged<T>(rows: T[], size = 25) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  const slice = rows.slice((current - 1) * size, current * size);
  return {
    slice,
    page: current,
    pages,
    total: rows.length,
    next: () => setPage((p) => Math.min(pages, p + 1)),
    prev: () => setPage((p) => Math.max(1, p - 1)),
    reset: () => setPage(1),
  };
}

export function Pager({
  page,
  pages,
  total,
  next,
  prev,
}: {
  page: number;
  pages: number;
  total: number;
  next: () => void;
  prev: () => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        Page {page} of {pages} · {total} rows
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={prev} disabled={page === 1}>
          Previous
        </Button>
        <Button variant="outline" size="sm" onClick={next} disabled={page === pages}>
          Next
        </Button>
      </div>
    </div>
  );
}
