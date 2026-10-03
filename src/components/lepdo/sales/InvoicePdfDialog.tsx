import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, Pencil, Printer, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useLepdo } from "@/lib/lepdo/store";
import {
  buildInvoiceDocHtml,
  invoiceTitle,
  printInvoiceDoc,
  validateInvoice,
} from "@/lib/lepdo/invoiceDoc";
import type { Invoice, Party } from "@/lib/lepdo/types";

const A4_WIDTH = 794; // 210mm at 96dpi
const A4_HEIGHT = 1123; // 297mm at 96dpi

export function InvoicePdfDialog({
  invoice,
  customer,
  received,
  onClose,
  onEdit,
}: {
  invoice: Invoice | undefined;
  customer: Party | undefined;
  received?: number | undefined;
  onClose: () => void;
  onEdit?: ((id: string) => void) | undefined;
}) {
  const store = useLepdo();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [docHeight, setDocHeight] = useState(A4_HEIGHT);

  const html = useMemo(
    () =>
      invoice ? buildInvoiceDocHtml({ invoice, customer, settings: store.settings, received }) : "",
    [invoice, customer, store.settings, received],
  );
  const errors = useMemo(
    () => (invoice ? validateInvoice(invoice, received) : []),
    [invoice, received],
  );

  useEffect(() => {
    if (!invoice) return;
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, (el.clientWidth - 2) / A4_WIDTH));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [invoice]);

  function guard(action: () => void) {
    if (errors.length) {
      toast.error(`Totals do not match: ${errors[0]}`);
      return;
    }
    action();
  }

  const openPrint = () => {
    if (!printInvoiceDoc(html)) toast.error("Allow pop-ups to print or download the invoice PDF.");
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-[100vw] flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[92vh] sm:max-h-[92vh] sm:w-[min(960px,94vw)] sm:max-w-[min(960px,94vw)] sm:rounded-2xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-navy">
            {invoice ? `${invoiceTitle(invoice)} · ${invoice.number}` : "Invoice PDF"}
          </DialogTitle>
          <DialogDescription>
            A4 portrait preview — the downloaded and printed PDF uses this exact layout.
          </DialogDescription>
        </DialogHeader>

        {errors.length ? (
          <div className="shrink-0 border-b border-neg/30 bg-neg/10 px-5 py-3 text-sm text-neg">
            <p className="flex items-center gap-2 font-medium">
              <TriangleAlert className="size-4" /> Validation failed — download is blocked.
            </p>
            <ul className="mt-1 list-disc pl-6">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div
          ref={wrapRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-muted/40 p-3"
        >
          {invoice ? (
            <div className="mx-auto" style={{ width: A4_WIDTH * scale, height: docHeight * scale }}>
              <iframe
                title="Invoice preview"
                srcDoc={html}
                onLoad={(e) => {
                  const doc = e.currentTarget.contentDocument;
                  if (doc) setDocHeight(Math.max(A4_HEIGHT, doc.documentElement.scrollHeight + 8));
                }}
                style={{
                  width: A4_WIDTH,
                  height: docHeight,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
                className="rounded-lg border border-border bg-white shadow-sm"
              />
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-card px-5 py-4">
          {invoice && onEdit ? (
            <Button variant="outline" onClick={() => onEdit(invoice.id)}>
              <Pencil className="size-4" /> Edit Invoice
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => guard(openPrint)}>
            <Printer className="size-4" /> Print
          </Button>
          <Button className="bg-navy text-white hover:bg-navy/90" onClick={() => guard(openPrint)}>
            <Download className="size-4" /> Download PDF
          </Button>
          <Button variant="ghost" className="sm:ml-auto" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PreviewPdfButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" onClick={onClick}>
      <FileText className="size-4" /> Preview PDF
    </Button>
  );
}
