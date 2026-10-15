import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { budgets, incomeTargets, vehicles } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { expensesByCategory, incomeByVehicle } from "@/lib/calc";
import { getSettings } from "@/lib/settings";
import { CATEGORY_OPTIONS, daysBetween, label, monthRange, mwk, thisMonth, today } from "@/lib/format";
import { Card, Notice, PageHeader, Stat, TableWrap } from "@/components/ui";
import { MonthPicker } from "@/components/month-picker";
import { copyLastMonth, saveBudget } from "./actions";

export const metadata = { title: "Budgets & targets" };

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ month?: string; saved?: string }> }) {
  await requireRole("FINANCE");
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : thisMonth();
  const { start, end, days } = monthRange(month);
  const [rows, inc, actualByCat, incomeMap, vs, s] = await Promise.all([
    db.select().from(budgets).where(and(eq(budgets.month, month), isNull(budgets.vehicleId))),
    db.query.incomeTargets.findFirst({ where: eq(incomeTargets.month, month) }),
    expensesByCategory(start, end),
    incomeByVehicle(start, end),
    db.select().from(vehicles).where(ne(vehicles.status, "DISPOSED")),
    getSettings(),
  ]);
  // Suggested income target: daily targets × working days (less rest days)
  const workDays = Math.round(days * (1 - s.restDaysPerWeek / 7));
  const suggested = vs.filter((v) => v.earningMode !== "PER_JOB").reduce((a, v) => a + (v.targetPeriod === "WEEK" ? Math.round((v.dailyTarget * days) / 7) : v.dailyTarget * workDays), 0);
  const incomeTarget = inc?.amount ?? 0;
  const actualIncome = [...incomeMap.values()].reduce((a, x) => a + x.target + x.jobs, 0);
  const budgetTotal = rows.reduce((a, r) => a + r.amount, 0);
  const actualCost = [...actualByCat.values()].reduce((a, x) => a + x, 0);
  // Share of the month elapsed, for pacing
  const t = today();
  const elapsed = t > end ? 1 : t < start ? 0 : (daysBetween(start, t) + 1) / days;

  return (
    <>
      <PageHeader title="Budgets & targets" subtitle="Monthly income target and spending budget, against actuals"
        actions={<><MonthPicker month={month} base="/budgets" /><form action={copyLastMonth.bind(null, month)}><button className="btn btn-ghost btn-sm">Copy last month</button></form></>} />
      {sp.saved ? <Notice tone="good">Budget saved.</Notice> : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Income target" value={incomeTarget ? mwk(incomeTarget) : "Not set"} note={`Suggested from daily targets: ${mwk(suggested)}`} />
        <Stat label="Income so far" value={mwk(actualIncome)} tone={incomeTarget && actualIncome >= incomeTarget * elapsed ? "good" : "warn"}
          note={incomeTarget ? `${Math.round((actualIncome / incomeTarget) * 100)}% of target · ${Math.round(elapsed * 100)}% of month gone` : undefined} />
        <Stat label="Spending budget" value={mwk(budgetTotal)} />
        <Stat label="Spent so far" value={mwk(actualCost)} tone={budgetTotal && actualCost > budgetTotal * Math.max(elapsed, 0.01) ? "bad" : "good"}
          note={budgetTotal ? `${Math.round((actualCost / budgetTotal) * 100)}% of budget used` : undefined} />
      </div>

      <form action={saveBudget.bind(null, month)} className="flex flex-col gap-5">
        <Card title="Set the budget" action={<button className="btn btn-primary btn-sm">Save budget</button>} pad={false}>
          <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 pb-4">
            <label className="block"><span className="label">Income target for the month (MWK)</span>
              <input className="input num !w-[220px]" name="income" inputMode="numeric" defaultValue={incomeTarget || suggested} /></label>
          </div>
          <TableWrap><table className="data">
            <thead><tr><th>Category</th><th>Budget (MWK)</th><th>Actual</th><th>Used</th><th>Variance</th></tr></thead>
            <tbody>{CATEGORY_OPTIONS.map((c) => {
              const b = rows.find((r) => r.category === c)?.amount ?? 0;
              const a = actualByCat.get(c) ?? 0;
              const used = b ? a / b : null;
              const v = b - a;
              return (
                <tr key={c}>
                  <td className="font-semibold">{label(c)}</td>
                  <td><input className="input num !min-h-[34px] !w-[150px] !py-1" name={c} defaultValue={b || ""} inputMode="numeric" aria-label={`Budget for ${label(c)}`} /></td>
                  <td className="num">{mwk(a)}</td>
                  <td>
                    {used == null ? <span className="text-muted">—</span> : (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${Math.min(100, used * 100)}%`, background: used > 1 ? "#dc2626" : used > elapsed + 0.1 ? "#f59e0b" : "#2563eb" }} /></div>
                        <span className="num text-[12px]">{Math.round(used * 100)}%</span>
                      </div>
                    )}
                  </td>
                  <td className={`num font-semibold ${!b ? "text-muted" : v < 0 ? "text-bad" : "text-good"}`}>{b ? (v < 0 ? `${mwk(-v)} over` : `${mwk(v)} left`) : "—"}</td>
                </tr>
              );
            })}</tbody>
          </table></TableWrap>
        </Card>
      </form>
    </>
  );
}
