import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/lib/lepdo/format";
import type { Transaction } from "@/lib/lepdo/types";

/** Row actions: View details, Edit, Delete. */
export function EntryRowMenu({
  onView,
  onEdit,
  onDelete,
}: {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Row actions">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onView}>View details</DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="size-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-neg" onClick={onDelete}>
          <Trash2 className="size-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Change history of an entry. */
export function EntryHistory({ t }: { t: Transaction }) {
  const rows = t.history ?? [];
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</p>
      {rows.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Created by {t.createdBy} on {formatDateTime(t.createdAt)}.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.map((h, i) => (
            <li key={`${h.at}-${i}`} className="text-xs text-muted-foreground">
              <span className="font-medium text-navy">{h.action}</span> · {h.detail}
              <br />
              {h.by} · {formatDateTime(h.at)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
