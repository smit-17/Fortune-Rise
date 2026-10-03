import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useLepdo } from "@/lib/lepdo/store";
import { ContactForm } from "@/components/lepdo/ContactForm";
import type { ContactKind } from "@/lib/lepdo/types";

/**
 * Searchable broker / seller dropdown with inline add + edit.
 * The stored value stays the contact name so invoices, cards and reports are unchanged.
 */
export function ContactPicker({
  kind,
  value,
  onChange,
}: {
  kind: ContactKind;
  value: string;
  onChange: (name: string) => void;
}) {
  const store = useLepdo();
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const masters = kind === "broker" ? store.brokers : store.sellers;
  const legacy = useMemo(() => {
    const used =
      kind === "broker"
        ? store.purchaseBills.map((b) => b.brokerName)
        : store.salesInvoices.map((i) => i.sellerName);
    const known = new Set(masters.map((c) => c.name.toLowerCase()));
    return [
      ...new Set(
        used.map((n) => n?.trim()).filter((n): n is string => !!n && !known.has(n.toLowerCase())),
      ),
    ].sort();
  }, [kind, masters, store.purchaseBills, store.salesInvoices]);

  const selected = masters.find((c) => c.name === value);
  const label = kind === "broker" ? "broker" : "seller";

  function pick(name: string) {
    onChange(name === value ? "" : name);
    setOpen(false);
  }

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              className="h-10 min-w-0 justify-between font-normal"
            >
              <span className={cn("truncate", !value && "text-muted-foreground")}>
                {value || `Select or search ${label}`}
              </span>
              <ChevronsUpDown className="ml-1 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(320px,calc(100vw-2rem))] p-0">
            <Command>
              <CommandInput placeholder={`Type to search ${label}`} />
              <CommandList>
                <CommandEmpty>No {label} found.</CommandEmpty>
                {masters.length ? (
                  <CommandGroup heading={`Saved ${label}s`}>
                    {masters.map((c) => (
                      <CommandItem key={c.id} value={c.name} onSelect={() => pick(c.name)}>
                        <Check
                          className={cn(
                            "mr-2 size-4",
                            c.name === value ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="min-w-0 truncate">{c.name}</span>
                        {c.rate != null ? (
                          <span className="num ml-auto pl-2 text-[11px] text-muted-foreground">
                            {c.rateType === "percent" ? `${c.rate}%` : `₹${c.rate}`}
                          </span>
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {legacy.length ? (
                  <CommandGroup heading="Used earlier">
                    {legacy.map((n) => (
                      <CommandItem key={n} value={n} onSelect={() => pick(n)}>
                        <Check
                          className={cn("mr-2 size-4", n === value ? "opacity-100" : "opacity-0")}
                        />
                        <span className="min-w-0 truncate">{n}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                <CommandGroup>
                  <CommandItem
                    value={`__add_${label}`}
                    onSelect={() => {
                      setOpen(false);
                      setEditId(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus className="mr-2 size-4" /> Add {label}
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          size="icon"
          variant="outline"
          title={`Add ${label}`}
          onClick={() => {
            setEditId(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          title={`Edit selected ${label}`}
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            setEditId(selected.id);
            setFormOpen(true);
          }}
        >
          <Pencil className="size-4" />
        </Button>
      </div>

      <ContactForm
        open={formOpen}
        kind={kind}
        contactId={editId}
        onClose={() => setFormOpen(false)}
        onSaved={(name) => onChange(name)}
      />
    </>
  );
}
