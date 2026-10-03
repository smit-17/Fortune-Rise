import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "./bits";

export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="space-y-6">
      <PageHeading title={title} breadcrumb={`LEPDO Accounting / ${title}`} />
      <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-gold-tint text-navy">
          <Clock className="size-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-navy">{title} — Coming Soon</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{note}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/bank-ledger">Go to Bank Ledger</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/cash-book">Go to Cash Book</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
