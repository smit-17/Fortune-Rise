import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Banknote,
  Boxes,
  ChartNoAxesCombined,
  ChevronLeft,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Menu,
  Plus,
  ReceiptIndianRupee,
  PiggyBank,
  Search,
  Settings,
  ShoppingCart,
  Target,
  TrendingUp,
  Users,
  FileBarChart,
  WalletCards,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import lepdoaccountlogo from "@/assets/lepdoaccountlogo.png";
import { EntryDrawer, type DrawerConfig } from "./EntryDrawer";
import type { CategoryId } from "@/lib/lepdo/types";
import { PRESETS, rangeFor, type Preset } from "@/lib/lepdo/period";
import { todayISO } from "@/lib/lepdo/format";
import { ShellContext } from "./shell-context";
import { useAuth } from "@/lib/auth/auth";
import { pagePermission, roleLabel } from "@/lib/auth/permissions";
import { AccessDenied } from "./AuthGate";
export { useShell } from "./shell-context";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, active: true },
  { to: "/pl", label: "P&L", icon: ChartNoAxesCombined, active: true },
  { to: "/drawings", label: "Drawings", icon: WalletCards, active: true },
  { to: "/bank-ledger", label: "Bank Ledger", icon: Landmark, active: true },
  { to: "/expense", label: "Expense", icon: ReceiptIndianRupee, active: true },
  { to: "/cash-book", label: "Cash Book", icon: Banknote, active: true },
  { to: "/uchhina", label: "Uchhina", icon: HandCoins, active: true },
  { to: "/sales", label: "Sales", icon: TrendingUp, active: true },
  { to: "/purchase", label: "Purchase", icon: ShoppingCart, active: true },
  { to: "/reports", label: "Reports & Analysis", icon: FileBarChart, active: true },
  { to: "/capital", label: "Capital & Liabilities", icon: PiggyBank, active: true },
  { to: "/stock", label: "Stock", icon: Boxes, active: true },
  { to: "/team", label: "Seller & Team", icon: Users, active: true },
  { to: "/goals", label: "Goals", icon: Target, active: true },
  { to: "/settings", label: "Settings", icon: Settings, active: true },
] as const;

const QUICK: { label: string; sourceType: "bank" | "cash"; category?: CategoryId }[] = [
  { label: "Add Bank Entry", sourceType: "bank" },
  { label: "Add Cash Entry", sourceType: "cash" },
  { label: "Record Sale Payment", sourceType: "bank", category: "sale_payment" },
  { label: "Record Purchase Payment", sourceType: "bank", category: "purchase_payment" },
  { label: "Add Expense", sourceType: "bank", category: "expense" },
  { label: "Add Uchhina", sourceType: "cash", category: "uchhina_given" },
  { label: "Transfer Money", sourceType: "bank", category: "bank_transfer" },
  { label: "Add Owner Investment", sourceType: "bank", category: "owner_investment" },
  { label: "Add Owner Drawing", sourceType: "bank", category: "owner_drawing" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { can, profile, role, signOut } = useAuth();
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const [search, setSearch] = useState("");
  const today = todayISO();
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [from, to] = useMemo(
    () => rangeFor(preset, today, customFrom, customTo),
    [preset, today, customFrom, customTo],
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickUchhina, setQuickUchhinaState] = useState<(() => void) | null>(null);
  const setQuickUchhina = useCallback(
    (handler: (() => void) | null) => setQuickUchhinaState(() => handler),
    [],
  );
  const [pageAction, setPageActionState] = useState<{ label: string; run: () => void } | null>(
    null,
  );
  const setPageAction = useCallback(
    (action: { label: string; run: () => void } | null) => setPageActionState(action),
    [],
  );
  const path = useRouterState({ select: (s) => s.location.pathname });
  const current = NAV.find((n) => n.to === path);
  const visibleNav = NAV.filter((n) => can(pagePermission(n.to)));
  const allowedHere = can(pagePermission(path));
  const initials = (profile?.full_name || profile?.email || "LA")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <ShellContext.Provider
      value={{
        openEntry: setDrawer,
        search,
        setSearch,
        from,
        to,
        preset,
        setPreset,
        customFrom,
        customTo,
        setCustomFrom,
        setCustomTo,
        quickUchhina,
        setQuickUchhina,
        pageAction,
        setPageAction,
      }}
    >
      <div className="min-h-screen bg-background lg:flex">
        <aside
          className={cn(
            "z-40 w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:block lg:h-screen",
            mobileOpen ? "fixed inset-y-0 left-0 block shadow-xl" : "hidden",
          )}
        >
          <div className="flex h-16 items-center justify-between gap-2 border-b border-sidebar-border bg-navy px-4">
            <img src={lepdoaccountlogo} alt="LEPDO" className="h-7 w-auto object-contain" />
            <button
              type="button"
              aria-label="Close menu"
              className="text-navy-foreground lg:hidden"
              onClick={() => setMobileOpen(false)}
            >
              <ChevronLeft className="size-5" />
            </button>
          </div>
          <nav className="space-y-1 p-3">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const isActive = path === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-gold bg-gold-tint text-navy"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-navy",
                  )}
                >
                  <Icon className="size-[18px] shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {!item.active ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Soon
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
            <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 lg:flex lg:flex-wrap lg:gap-3 lg:px-6 lg:py-3">
              <button
                type="button"
                aria-label="Open menu"
                className="rounded-md border border-border p-1.5 text-navy lg:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="size-5" />
              </button>
              <p className="min-w-0 truncate text-sm font-semibold text-navy lg:hidden">
                {current?.label ?? "LEPDO"}
              </p>

              <div
                className={cn(
                  "flex min-w-0 items-center justify-end gap-2 lg:justify-start",
                  preset === "custom" ? "col-span-4 flex-wrap lg:col-auto lg:flex-nowrap" : "",
                )}
              >
                <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
                  <SelectTrigger
                    aria-label="Date period"
                    className="h-8 w-full min-w-0 max-w-[150px] text-xs lg:h-9 lg:w-[190px] lg:max-w-none lg:text-sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {PRESETS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {preset === "custom" ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <Input
                      type="date"
                      aria-label="From date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="h-8 min-w-0 flex-1 text-xs lg:h-9 lg:w-[140px] lg:flex-none lg:text-sm"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="date"
                      aria-label="To date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="h-8 min-w-0 flex-1 text-xs lg:h-9 lg:w-[140px] lg:flex-none lg:text-sm"
                    />
                  </div>
                ) : null}
              </div>

              <div className="hidden flex-1 lg:block" />

              {path === "/" ? null : (
                <div className="hidden items-center gap-2 lg:flex">
                  <div className="relative w-[220px]">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search transactions"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-9 pl-8"
                    />
                  </div>
                  {path === "/uchhina" ? (
                    quickUchhina ? (
                      <Button className="h-9" onClick={quickUchhina}>
                        <Plus className="size-4" /> Quick Uchhina
                      </Button>
                    ) : null
                  ) : pageAction ? (
                    <Button className="h-9" onClick={pageAction.run}>
                      <Plus className="size-4" /> {pageAction.label}
                    </Button>
                  ) : can("accounting.add") ? (
                    <QuickEntryMenu onPick={setDrawer} />
                  ) : null}
                </div>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-8 px-2.5 text-xs lg:h-9 lg:px-4 lg:text-sm"
                  >
                    {initials || "LA"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="leading-tight">
                    <span className="block truncate text-sm">
                      {profile?.full_name || profile?.email}
                    </span>
                    <span className="block truncate text-[11px] font-normal text-muted-foreground">
                      {roleLabel(role)}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {can("settings.view") ? (
                    <DropdownMenuItem asChild>
                      <Link to="/settings">Settings</Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={() => void signOut()}>
                    <LogOut className="size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="px-3 py-3 lg:px-6 lg:py-6">
            {allowedHere ? children : <AccessDenied what={current?.label ?? "this page"} />}
          </main>
        </div>
      </div>
      <EntryDrawer config={drawer} onClose={() => setDrawer(null)} />
    </ShellContext.Provider>
  );
}

export function QuickEntryMenu({
  onPick,
  className,
}: {
  onPick: (config: DrawerConfig) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={cn("h-9", className)}>
          <Plus className="size-4" /> Quick Entry
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Create a transaction</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {QUICK.map((q) => (
          <DropdownMenuItem
            key={q.label}
            onSelect={() =>
              onPick(
                q.category
                  ? { sourceType: q.sourceType, category: q.category }
                  : { sourceType: q.sourceType },
              )
            }
          >
            {q.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
