import { useMemo, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/* --------------------------------- sorting -------------------------------- */

export type SortId =
  | "date_desc"
  | "date_asc"
  | "number_desc"
  | "number_asc"
  | "amount_desc"
  | "amount_asc"
  | "updated_desc";

export const SORT_OPTIONS: { value: SortId; label: string }[] = [
  { value: "date_desc", label: "Date: Newest to Oldest" },
  { value: "date_asc", label: "Date: Oldest to Newest" },
  { value: "number_desc", label: "Number: Highest to Lowest" },
  { value: "number_asc", label: "Number: Lowest to Highest" },
  { value: "amount_desc", label: "Amount: High to Low" },
  { value: "amount_asc", label: "Amount: Low to High" },
  { value: "updated_desc", label: "Recently Updated" },
];

export interface SortAccessors<T> {
  date: (row: T) => string;
  number: (row: T) => string;
  amount: (row: T) => number;
  updated: (row: T) => string;
}

/** Stable, allocation-light sort used by every list that shows the filter bar. */
export function sortRows<T>(rows: T[], sort: SortId, get: SortAccessors<T>): T[] {
  const out = [...rows];
  const cmp = (a: T, b: T): number => {
    switch (sort) {
      case "date_asc":
        return get.date(a).localeCompare(get.date(b));
      case "number_asc":
        return get.number(a).localeCompare(get.number(b), undefined, { numeric: true });
      case "number_desc":
        return get.number(b).localeCompare(get.number(a), undefined, { numeric: true });
      case "amount_asc":
        return get.amount(a) - get.amount(b);
      case "amount_desc":
        return get.amount(b) - get.amount(a);
      case "updated_desc":
        return get.updated(b).localeCompare(get.updated(a));
      default:
        return get.date(b).localeCompare(get.date(a));
    }
  };
  return out.sort(
    (a, b) => cmp(a, b) || get.number(b).localeCompare(get.number(a), undefined, { numeric: true }),
  );
}

/* -------------------------------- filter bar ------------------------------- */

export interface SelectFilterDef {
  id: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface FilterBarProps {
  /** date period */
  datePreset: string;
  dateOptions: { value: string; label: string }[];
  onDatePreset: (v: string) => void;
  customFrom?: string;
  customTo?: string;
  onCustomFrom?: (v: string) => void;
  onCustomTo?: (v: string) => void;
  /** search */
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder: string;
  /** sort */
  sort: SortId;
  onSort: (v: SortId) => void;
  /** extra selects, revealed inside the Filters sheet */
  filters: SelectFilterDef[];
  values: Record<string, string>;
  onFilterChange: (id: string, value: string) => void;
  /** amount range */
  amountMin: string;
  amountMax: string;
  onAmountMin: (v: string) => void;
  onAmountMax: (v: string) => void;
  onClearAll: () => void;
  /** right-aligned extras such as a download button */
  right?: ReactNode;
}

export function FilterBar(props: FilterBarProps) {
  const [open, setOpen] = useState(false);

  const chips = useMemo(() => {
    const list: { id: string; label: string; clear: () => void }[] = [];
    for (const f of props.filters) {
      const v = props.values[f.id] ?? "all";
      if (v === "all") continue;
      const opt = f.options.find((o) => o.value === v);
      list.push({
        id: f.id,
        label: `${f.label}: ${opt?.label ?? v}`,
        clear: () => props.onFilterChange(f.id, "all"),
      });
    }
    if (props.amountMin.trim())
      list.push({
        id: "min",
        label: `Min ₹${props.amountMin}`,
        clear: () => props.onAmountMin(""),
      });
    if (props.amountMax.trim())
      list.push({
        id: "max",
        label: `Max ₹${props.amountMax}`,
        clear: () => props.onAmountMax(""),
      });
    if (props.search.trim())
      list.push({ id: "q", label: `Search: ${props.search}`, clear: () => props.onSearch("") });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.filters, props.values, props.amountMin, props.amountMax, props.search]);

  const extraCount = chips.filter((c) => c.id !== "q").length;

  return (
    <div className="w-full max-w-full space-y-2 rounded-xl border border-border bg-card p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={props.datePreset} onValueChange={props.onDatePreset}>
          <SelectTrigger aria-label="Date period" className="h-9 w-[160px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {props.dateOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {props.datePreset === "custom" ? (
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              aria-label="From date"
              className="h-9 w-[136px] text-sm"
              value={props.customFrom ?? ""}
              onChange={(e) => props.onCustomFrom?.(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              aria-label="To date"
              className="h-9 w-[136px] text-sm"
              value={props.customTo ?? ""}
              onChange={(e) => props.onCustomTo?.(e.target.value)}
            />
          </div>
        ) : null}

        <div className="relative min-w-0 flex-1 basis-full sm:basis-52">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8 text-sm"
            placeholder={props.searchPlaceholder}
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
          />
        </div>

        <Select value={props.sort} onValueChange={(v) => props.onSort(v as SortId)}>
          <SelectTrigger aria-label="Sort by" className="h-9 w-[184px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" className="h-9" onClick={() => setOpen(true)}>
          <SlidersHorizontal className="size-4" /> Filters
          {extraCount ? (
            <span className="ml-1 rounded-full bg-navy px-1.5 text-[11px] font-semibold text-navy-foreground">
              {extraCount}
            </span>
          ) : null}
        </Button>

        {props.right}
      </div>

      {chips.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={c.clear}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-full bg-sl-advance-bg px-2.5 py-1",
                "text-[11px] font-medium text-sl-advance hover:opacity-80",
              )}
            >
              <span className="truncate">{c.label}</span>
              <X className="size-3 shrink-0" />
            </button>
          ))}
          <button
            type="button"
            onClick={props.onClearAll}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
          >
            Clear All
          </button>
        </div>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto rounded-t-2xl sm:max-w-lg sm:rounded-t-2xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-navy">Filters</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2">
            {props.filters.map((f) => (
              <div key={f.id} className="min-w-0">
                <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {f.label}
                </Label>
                <Select
                  value={props.values[f.id] ?? "all"}
                  onValueChange={(v) => props.onFilterChange(f.id, v)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Minimum amount
              </Label>
              <Input
                inputMode="decimal"
                className="h-9 text-sm"
                placeholder="0"
                value={props.amountMin}
                onChange={(e) => props.onAmountMin(e.target.value)}
              />
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Maximum amount
              </Label>
              <Input
                inputMode="decimal"
                className="h-9 text-sm"
                placeholder="Any"
                value={props.amountMax}
                onChange={(e) => props.onAmountMax(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2 pb-2">
            <Button className="flex-1" onClick={() => setOpen(false)}>
              Show results
            </Button>
            <Button variant="outline" onClick={props.onClearAll}>
              Clear All
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Numeric range test shared by the lists. */
export function inAmountRange(amount: number, min: string, max: string): boolean {
  const lo = Number(min);
  const hi = Number(max);
  if (min.trim() && Number.isFinite(lo) && amount < lo) return false;
  if (max.trim() && Number.isFinite(hi) && amount > hi) return false;
  return true;
}
