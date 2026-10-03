import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { categoryLabel, categoryTone } from "@/lib/lepdo/constants";
import type { CategoryId, Transaction } from "@/lib/lepdo/types";

export function SummaryCard({
  label,
  value,
  hint,
  icon,
  tone = "navy",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  tone?: "navy" | "pos" | "neg" | "muted";
}) {
  const toneMap = {
    navy: "bg-gold-tint text-navy",
    pos: "bg-pos-bg text-pos",
    neg: "bg-neg-bg text-neg",
    muted: "bg-cat-other-bg text-cat-other",
  } as const;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", toneMap[tone])}>
          {icon}
        </span>
      </div>
      <p className="num mt-3 text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function CategoryBadge({ id }: { id: CategoryId | null }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium",
        categoryTone(id),
      )}
    >
      {categoryLabel(id)}
    </span>
  );
}

export function statusOf(t: Transaction): "Deleted" | "Reconciled" | "Unclassified" | "Classified" {
  if (t.voided) return "Deleted";
  if (t.reconciled) return "Reconciled";
  if (!t.category) return "Unclassified";
  return "Classified";
}

export function StatusBadge({ t }: { t: Transaction }) {
  const status = statusOf(t);
  const map = {
    Deleted: "bg-cat-other-bg text-cat-other line-through",
    Reconciled: "bg-cat-transfer-bg text-cat-transfer",
    Unclassified: "bg-cat-other-bg text-cat-other",
    Classified: "bg-cat-sale-bg text-cat-sale",
  } as const;
  return (
    <span className={cn("inline-flex rounded-md px-2 py-1 text-xs font-medium", map[status])}>
      {status}
    </span>
  );
}

export function PageHeading({
  title,
  breadcrumb,
  children,
}: {
  title: string;
  breadcrumb: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{breadcrumb}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-navy">{title}</h1>
      </div>
      {children}
    </div>
  );
}
