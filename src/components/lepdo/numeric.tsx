import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Keeps only digits and a single decimal point, so sequential typing such as
 * "2", "2.", "2.7", "2.75" is preserved exactly while the user types.
 */
export function sanitizeDecimal(raw: string, decimals = 4): string {
  let s = raw.replace(/[^\d.]/g, "");
  const first = s.indexOf(".");
  if (first !== -1) {
    s = s.slice(0, first + 1) + s.slice(first + 1).replace(/\./g, "");
  }
  if (decimals === 0) return s.split(".")[0] ?? "";
  const [int, frac] = s.split(".");
  if (frac === undefined) return int ?? "";
  return `${int ?? ""}.${frac.slice(0, decimals)}`;
}

export function toNum(raw: string | number | undefined | null): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Number shown without trailing zeros, blank for 0 so placeholders stay visible. */
export function numText(n: number | undefined | null, decimals = 4): string {
  if (n === undefined || n === null || n === 0 || !Number.isFinite(n)) return "";
  return String(Number(Number(n).toFixed(decimals)));
}

/**
 * Decimal-safe numeric input. It holds the raw typed text locally (so "2." and
 * "0.0" survive keystrokes) and reports the parsed number upward. The text is
 * only reformatted from the model on blur or when the model changes externally.
 */
export function NumInput({
  value,
  onChange,
  decimals = 4,
  placeholder = "0",
  className,
  disabled,
  readOnly,
  ...rest
}: {
  value: number | undefined | null;
  onChange: (n: number) => void;
  decimals?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  "aria-label"?: string;
  id?: string;
}) {
  const [text, setText] = useState(() => numText(value, decimals));
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setText(numText(value, decimals));
  }, [value, decimals]);

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      className={cn("num", className)}
      {...(disabled ? { disabled: true } : {})}
      {...(readOnly ? { readOnly: true } : {})}
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        const next = sanitizeDecimal(e.target.value, decimals);
        setText(next);
        onChange(next === "" || next === "." ? 0 : toNum(next));
      }}
      onBlur={() => {
        focused.current = false;
        setText(numText(toNum(text), decimals));
      }}
    />
  );
}

/** Currency input — same typing behaviour, 2 decimals. */
export function MoneyInput(props: Omit<Parameters<typeof NumInput>[0], "decimals">) {
  return <NumInput {...props} decimals={2} />;
}

/**
 * Auto / Manual switch for a calculated amount. Auto shows the computed value
 * read-only; Manual lets the user type an override plus a reason.
 */
export function AutoManual({
  auto,
  manual,
  reason,
  decimals = 2,
  label,
  onManual,
  onReason,
  className,
}: {
  auto: number;
  /** undefined = automatic */
  manual: number | undefined;
  reason: string;
  decimals?: number;
  label?: string;
  onManual: (n: number | undefined) => void;
  onReason: (r: string) => void;
  className?: string;
}) {
  const isManual = manual !== undefined;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1">
        <NumInput
          value={isManual ? manual : auto}
          decimals={decimals}
          onChange={(n) => (isManual ? onManual(n) : undefined)}
          {...(isManual ? {} : { readOnly: true })}
          className={cn("h-9", isManual ? "border-sl-part" : "bg-muted")}
          {...(label ? { "aria-label": label } : {})}
        />
        <Button
          type="button"
          size="sm"
          variant={isManual ? "default" : "outline"}
          className="h-9 shrink-0 px-2 text-[11px]"
          onClick={() => onManual(isManual ? undefined : auto)}
          title={isManual ? "Switch back to automatic" : "Manually adjust this amount"}
        >
          {isManual ? "Manual" : "Auto"}
        </Button>
      </div>
      {isManual ? (
        <Input
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          placeholder="Adjustment reason (required)"
          className="mt-1 h-8 text-xs"
        />
      ) : null}
    </div>
  );
}

/** Small badge marking a manually adjusted amount. */
export function ManualBadge() {
  return (
    <span className="ml-1 rounded bg-sl-part-bg px-1.5 py-0.5 text-[10px] font-medium text-sl-part">
      Manually Adjusted
    </span>
  );
}
