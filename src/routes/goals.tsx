import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Target, TrendingUp, Wallet, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeading } from "@/components/lepdo/bits";
import {
  Chip,
  DownloadMenu,
  EmptyState,
  Field,
  ModalShell,
  ProgressBar,
  SectionCard,
  StatCard,
} from "@/components/lepdo/shared";
import { MoneyInput } from "@/components/lepdo/numeric";
import { useLepdo } from "@/lib/lepdo/store";
import { formatMoney, round2, todayISO } from "@/lib/lepdo/format";
import { fyOf, goalPercent, goalRange, periodKeyFor, type Tone } from "@/lib/lepdo/extras";
import type { ExportTable } from "@/lib/lepdo/exportTable";
import type { Goal } from "@/lib/lepdo/types";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "Goals — LEPDO Accounting" },
      {
        name: "description",
        content:
          "Set and track yearly, monthly and daily sales goals overall, by seller and by platform, with live achievement tracking.",
      },
      { property: "og:title", content: "Goals — LEPDO Accounting" },
      {
        property: "og:description",
        content:
          "Track sales goals against real invoice achievement by seller and platform, financial year April–March.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GoalsPage,
});

type Period = "yearly" | "monthly" | "weekly" | "daily";
type ViewPeriod = "yearly" | "monthly" | "weekly" | "daily";
type Scope = "overall" | "seller" | "platform";

interface CardSpec {
  scope: Scope;
  target: string;
  label: string;
}

function currentFyOptions(): string[] {
  const fy = fyOf(todayISO());
  const y = Number(fy.slice(0, 4));
  return [0, 1, 2].map((i) => `${y - i}-${String(y - i + 1).slice(2)}`);
}

function GoalsPage() {
  const store = useLepdo();
  const [period, setPeriod] = useState<ViewPeriod>("yearly");

  if (!store.ready) {
    return (
      <div className="space-y-4">
        <PageHeading title="Goals" breadcrumb="LEPDO / Goals" />
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full space-y-4 overflow-x-hidden">
      <PageHeading title="Goals" breadcrumb="LEPDO / Goals" />

      <Tabs value={period} onValueChange={(v) => setPeriod(v as ViewPeriod)}>
        <TabsList>
          <TabsTrigger value="daily">Day</TabsTrigger>
          <TabsTrigger value="weekly">Week</TabsTrigger>
          <TabsTrigger value="monthly">Month</TabsTrigger>
          <TabsTrigger value="yearly">Financial Year</TabsTrigger>
        </TabsList>
      </Tabs>

      {period === "yearly" ? <GoalsPanel key="yearly" period="yearly" /> : null}
      {period === "monthly" ? <GoalsPanel key="monthly" period="monthly" /> : null}
      {period === "weekly" ? <GoalsPanel key="weekly" period="weekly" /> : null}
      {period === "daily" ? <GoalsPanel key="daily" period="daily" /> : null}
    </div>
  );
}

function GoalsPanel({ period }: { period: Period }) {
  const store = useLepdo();
  const [periodKey, setPeriodKey] = useState(() => periodKeyFor(period));
  const [editing, setEditing] = useState<CardSpec | null>(null);

  const sellerNames = useMemo(() => {
    const set = new Set<string>();
    store.sellers.forEach((s) => {
      if (s.name.trim()) set.add(s.name.trim());
    });
    store.salesInvoices.forEach((inv) => {
      if (inv.sellerName?.trim()) set.add(inv.sellerName.trim());
    });
    return [...set].sort();
  }, [store.sellers, store.salesInvoices]);

  const platformNames = useMemo(() => {
    const set = new Set<string>();
    store.salesInvoices.forEach((inv) => {
      if (inv.platform?.trim()) set.add(inv.platform.trim());
    });
    return [...set].sort();
  }, [store.salesInvoices]);

  const [from, to] = goalRange(period, periodKey);

  const achievedFor = useMemo(() => {
    const invoices = store.salesInvoices.filter(
      (inv) => !inv.voided && inv.date >= from && inv.date <= to,
    );
    const overall = round2(invoices.reduce((s, inv) => s + inv.total, 0));
    const bySeller = new Map<string, number>();
    const byPlatform = new Map<string, number>();
    invoices.forEach((inv) => {
      const seller = inv.sellerName?.trim();
      if (seller) bySeller.set(seller, round2((bySeller.get(seller) ?? 0) + inv.total));
      const platform = inv.platform?.trim();
      if (platform) byPlatform.set(platform, round2((byPlatform.get(platform) ?? 0) + inv.total));
    });
    return { overall, bySeller, byPlatform };
  }, [store.salesInvoices, from, to]);

  function achievedOf(scope: Scope, target: string): number {
    if (scope === "overall") return achievedFor.overall;
    if (scope === "seller") return achievedFor.bySeller.get(target) ?? 0;
    return achievedFor.byPlatform.get(target) ?? 0;
  }

  function goalOf(scope: Scope, target: string): Goal | undefined {
    return store.goals.find(
      (g) =>
        g.scope === scope &&
        g.target === target &&
        g.period === period &&
        g.periodKey === periodKey,
    );
  }

  const cards: CardSpec[] = useMemo(
    () => [
      { scope: "overall", target: "overall", label: "Overall Sales Goal" },
      ...sellerNames.map((n) => ({ scope: "seller" as Scope, target: n, label: n })),
      ...platformNames.map((n) => ({ scope: "platform" as Scope, target: n, label: n })),
    ],
    [sellerNames, platformNames],
  );

  const periodGoals = store.goals.filter((g) => g.period === period && g.periodKey === periodKey);

  const totals = useMemo(() => {
    let goal = 0;
    let achieved = 0;
    periodGoals.forEach((g) => {
      goal += g.amount;
      achieved += achievedOf(g.scope, g.target);
    });
    goal = round2(goal);
    achieved = round2(achieved);
    return {
      goal,
      achieved,
      pending: round2(Math.max(goal - achieved, 0)),
      percent: goalPercent(goal, achieved),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodGoals, achievedFor]);

  function buildTable(): ExportTable {
    return {
      title: `Goals — ${period.charAt(0).toUpperCase() + period.slice(1)} (${periodKey})`,
      columns: [
        { key: "scope", label: "Scope" },
        { key: "target", label: "Target" },
        { key: "period", label: "Period" },
        { key: "goal", label: "Goal", money: true, align: "right" },
        { key: "achieved", label: "Achieved", money: true, align: "right" },
        { key: "pending", label: "Pending", money: true, align: "right" },
        { key: "percent", label: "Achievement %", align: "right" },
      ],
      rows: periodGoals.map((g) => {
        const achieved = achievedOf(g.scope, g.target);
        return {
          scope: g.scope === "overall" ? "Overall" : g.scope === "seller" ? "Seller" : "Platform",
          target: g.scope === "overall" ? "—" : g.target,
          period: `${g.periodKey}`,
          goal: g.amount,
          achieved,
          pending: round2(Math.max(g.amount - achieved, 0)),
          percent: `${goalPercent(g.amount, achieved)}%`,
        };
      }),
      totals: {
        goal: totals.goal,
        achieved: totals.achieved,
        pending: totals.pending,
      },
    };
  }

  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="flex flex-wrap items-end gap-3">
          {period === "yearly" ? (
            <Field label="Financial Year">
              <select
                className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm"
                value={periodKey}
                onChange={(e) => setPeriodKey(e.target.value)}
              >
                {currentFyOptions().map((fy) => (
                  <option key={fy} value={fy}>
                    FY {fy}
                  </option>
                ))}
              </select>
            </Field>
          ) : period === "monthly" ? (
            <Field label="Month">
              <Input
                type="month"
                className="h-9 w-44"
                value={periodKey}
                onChange={(e) => setPeriodKey(e.target.value || periodKeyFor(period))}
              />
            </Field>
          ) : period === "weekly" ? (
            <Field label="Week">
              <Input
                type="week"
                className="h-9 w-44"
                value={periodKey}
                onChange={(e) => setPeriodKey(e.target.value || periodKeyFor(period))}
              />
            </Field>
          ) : (
            <Field label="Date">
              <Input
                type="date"
                className="h-9 w-44"
                value={periodKey}
                onChange={(e) => setPeriodKey(e.target.value || periodKeyFor(period))}
              />
            </Field>
          )}
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Goal"
          value={formatMoney(totals.goal)}
          tone="blue"
          icon={<Target className="size-4" />}
        />
        <StatCard
          label="Total Achieved"
          value={formatMoney(totals.achieved)}
          tone="green"
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label="Total Pending"
          value={formatMoney(totals.pending)}
          tone="red"
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Achievement %"
          value={`${totals.percent}%`}
          tone="yellow"
          icon={<AlertTriangle className="size-4" />}
        />
      </div>

      {periodGoals.length === 0 ? (
        <EmptyState
          title="No goals set for this period"
          hint="Use “Set Goal” on any card below to start tracking."
        />
      ) : null}

      <GoalGroup
        title="Overall Sales Goal"
        cards={cards.filter((c) => c.scope === "overall")}
        goalOf={goalOf}
        achievedOf={achievedOf}
        onEdit={setEditing}
        deadline={to}
      />
      <GoalGroup
        title="Seller-Wise Goals"
        cards={cards.filter((c) => c.scope === "seller")}
        goalOf={goalOf}
        achievedOf={achievedOf}
        onEdit={setEditing}
        deadline={to}
      />
      <GoalGroup
        title="Platform-Wise Goals"
        cards={cards.filter((c) => c.scope === "platform")}
        goalOf={goalOf}
        achievedOf={achievedOf}
        onEdit={setEditing}
        deadline={to}
      />

      {periodGoals.length > 0 ? (
        <SectionCard
          title="Goals Table"
          actions={<DownloadMenu build={buildTable} label="Download" />}
        >
          <GoalsTable goals={periodGoals} achievedOf={achievedOf} deadline={to} />
        </SectionCard>
      ) : null}

      {editing ? (
        <GoalModal
          spec={editing}
          period={period}
          periodKey={periodKey}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function GoalGroup({
  title,
  cards,
  goalOf,
  achievedOf,
  onEdit,
  deadline,
}: {
  title: string;
  cards: CardSpec[];
  goalOf: (scope: Scope, target: string) => Goal | undefined;
  achievedOf: (scope: Scope, target: string) => number;
  onEdit: (spec: CardSpec) => void;
  deadline?: string;
}) {
  if (cards.length === 0) return null;
  const today = todayISO();
  return (
    <SectionCard title={title}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const goal = goalOf(c.scope, c.target);
          const achieved = achievedOf(c.scope, c.target);
          const amount = goal?.amount ?? 0;
          const pending = round2(Math.max(amount - achieved, 0));
          const percent = goalPercent(amount, achieved);
          const tone: Tone = percent >= 100 ? "green" : percent >= 50 ? "yellow" : "red";
          const completed = percent >= 100;
          const overdue = !completed && !!deadline && deadline < today && !!goal;
          return (
            <div
              key={`${c.scope}-${c.target}`}
              className="rounded-xl border border-border bg-card p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-navy">{c.label}</p>
                <Button size="sm" variant="outline" onClick={() => onEdit(c)}>
                  {goal ? "Edit Goal" : "Set Goal"}
                </Button>
              </div>
              {deadline ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">Deadline: {deadline}</p>
              ) : null}
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Goal</p>
                  <p className="num font-medium text-navy">{formatMoney(amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Achieved</p>
                  <p className="num font-medium text-navy">{formatMoney(achieved)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pending</p>
                  <p className="num font-medium text-navy">{formatMoney(pending)}</p>
                </div>
              </div>
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Achievement</span>
                  <span className="num font-semibold">{percent}%</span>
                </div>
                <ProgressBar percent={percent} tone={tone} />
              </div>
              {goal ? (
                <div className="mt-2">
                  <Chip tone={completed ? "green" : overdue ? "red" : "grey"}>
                    {completed ? "Completed" : overdue ? "Overdue" : "In Progress"}
                  </Chip>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function GoalsTable({
  goals,
  achievedOf,
  deadline,
}: {
  goals: Goal[];
  achievedOf: (scope: Scope, target: string) => number;
  deadline?: string;
}) {
  const today = todayISO();
  function statusOf(percent: number, goal: Goal) {
    const completed = percent >= 100;
    const overdue = !completed && !!deadline && deadline < today;
    return completed ? "Completed" : overdue ? "Overdue" : "In Progress";
  }
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-2">Scope</th>
              <th className="py-2 pr-2">Target</th>
              <th className="py-2 pr-2">Period</th>
              <th className="py-2 pr-2">Deadline</th>
              <th className="py-2 pr-2 text-right">Goal</th>
              <th className="py-2 pr-2 text-right">Achieved</th>
              <th className="py-2 pr-2 text-right">Pending</th>
              <th className="py-2 pr-2 text-right">Achievement %</th>
              <th className="py-2 pr-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((g) => {
              const achieved = achievedOf(g.scope, g.target);
              const pending = round2(Math.max(g.amount - achieved, 0));
              const percent = goalPercent(g.amount, achieved);
              const status = statusOf(percent, g);
              return (
                <tr key={g.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-2 capitalize">{g.scope}</td>
                  <td className="py-2 pr-2">{g.scope === "overall" ? "—" : g.target}</td>
                  <td className="py-2 pr-2">{g.periodKey}</td>
                  <td className="py-2 pr-2">{deadline ?? "—"}</td>
                  <td className="num py-2 pr-2 text-right">{formatMoney(g.amount)}</td>
                  <td className="num py-2 pr-2 text-right">{formatMoney(achieved)}</td>
                  <td className="num py-2 pr-2 text-right">{formatMoney(pending)}</td>
                  <td className="num py-2 pr-2 text-right">{percent}%</td>
                  <td className="py-2 pr-2">
                    <Chip tone={status === "Completed" ? "green" : status === "Overdue" ? "red" : "grey"}>
                      {status}
                    </Chip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 sm:hidden">
        {goals.map((g) => {
          const achieved = achievedOf(g.scope, g.target);
          const pending = round2(Math.max(g.amount - achieved, 0));
          const percent = goalPercent(g.amount, achieved);
          const status = statusOf(percent, g);
          return (
            <div key={g.id} className="rounded-lg border border-border p-2 text-xs">
              <div className="flex items-center justify-between">
                <p className="font-semibold capitalize text-navy">
                  {g.scope} {g.scope === "overall" ? "" : `· ${g.target}`}
                </p>
                <Chip tone={status === "Completed" ? "green" : status === "Overdue" ? "red" : "grey"}>
                  {status}
                </Chip>
              </div>
              <p className="text-muted-foreground">
                {g.periodKey} {deadline ? `· Deadline ${deadline}` : ""}
              </p>
              <div className="mt-1 grid grid-cols-2 gap-1">
                <span>Goal: {formatMoney(g.amount)}</span>
                <span>Achieved: {formatMoney(achieved)}</span>
                <span>Pending: {formatMoney(pending)}</span>
                <span>Achv%: {percent}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function GoalModal({
  spec,
  period,
  periodKey,
  onClose,
}: {
  spec: CardSpec;
  period: Period;
  periodKey: string;
  onClose: () => void;
}) {
  const store = useLepdo();
  const existing = store.goals.find(
    (g) =>
      g.scope === spec.scope &&
      g.target === spec.target &&
      g.period === period &&
      g.periodKey === periodKey,
  );
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [saving, setSaving] = useState(false);

  function upsertGoal(p: Period, key: string, value: number) {
    const found = store.goals.find(
      (g) =>
        g.scope === spec.scope && g.target === spec.target && g.period === p && g.periodKey === key,
    );
    const record = store.stamp<{
      id?: string;
      scope: Scope;
      target: string;
      period: Period;
      periodKey: string;
      amount: number;
    }>("goal", {
      ...(found?.id ? { id: found.id } : {}),
      scope: spec.scope,
      target: spec.target,
      period: p,
      periodKey: key,
      amount: round2(value),
    });
    store.saveRecord("goals", record as Goal);
  }

  function save() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Enter a valid goal amount.");
      return;
    }
    setSaving(true);
    try {
      upsertGoal(period, periodKey, value);
      toast.success(existing ? "Goal updated." : "Goal set.");
      onClose();
    } catch {
      toast.error("Could not save the goal.");
    } finally {
      setSaving(false);
    }
  }

  function allocateEquallyToMonths() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid goal amount first.");
      return;
    }
    setSaving(true);
    try {
      const y = Number(periodKey.slice(0, 4));
      const per = round2(value / 12);
      for (let i = 0; i < 12; i++) {
        const month = ((i + 3) % 12) + 1; // April..March
        const year = month >= 4 ? y : y + 1;
        const key = `${year}-${String(month).padStart(2, "0")}`;
        upsertGoal("monthly", key, per);
      }
      toast.success("Allocated equally to 12 months.");
    } catch {
      toast.error("Could not allocate goals.");
    } finally {
      setSaving(false);
    }
  }

  function allocateEquallyToDays() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid goal amount first.");
      return;
    }
    setSaving(true);
    try {
      const [y, m] = periodKey.split("-").map(Number);
      const days = new Date(Date.UTC(y ?? 2026, m ?? 1, 0)).getUTCDate();
      const per = round2(value / days);
      for (let d = 1; d <= days; d++) {
        const key = `${periodKey}-${String(d).padStart(2, "0")}`;
        upsertGoal("daily", key, per);
      }
      toast.success("Allocated equally to days of month.");
    } catch {
      toast.error("Could not allocate goals.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title={`${existing ? "Edit" : "Set"} Goal — ${spec.label}`}
      subtitle={`${period.charAt(0).toUpperCase() + period.slice(1)} · ${periodKey}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Goal Amount">
          <MoneyInput
            value={amount === "" ? 0 : Number(amount)}
            onChange={(n) => setAmount(String(n))}
            placeholder="0"
          />
        </Field>
        {period === "yearly" ? (
          <div className="rounded-lg border border-dashed border-border p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Allocation helper</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={allocateEquallyToMonths}
                disabled={saving}
              >
                Allocate equally to 12 months
              </Button>
            </div>
          </div>
        ) : null}
        {period === "monthly" ? (
          <div className="rounded-lg border border-dashed border-border p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Allocation helper</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={allocateEquallyToDays} disabled={saving}>
                Allocate equally to days of month
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
