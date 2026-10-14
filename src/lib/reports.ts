import "server-only";
import { expensesByCategory, incomeByVehicle } from "./calc";
import { monthRange, shiftMonth } from "./format";

export async function companyPnl(month: string) {
  const { start, end } = monthRange(month);
  const [inc, cats] = await Promise.all([incomeByVehicle(start, end), expensesByCategory(start, end)]);
  let targetIncome = 0, jobIncome = 0;
  for (const v of inc.values()) { targetIncome += v.target; jobIncome += v.jobs; }
  const costs = [...cats.entries()].sort((a, b) => b[1] - a[1]);
  const totalCost = costs.reduce((s, c) => s + c[1], 0);
  const income = targetIncome + jobIncome;
  return { month, targetIncome, jobIncome, income, costs, totalCost, profit: income - totalCost };
}

export async function trend(month: string, n = 6) {
  const months = Array.from({ length: n }, (_, i) => shiftMonth(month, i - n + 1));
  const rows = await Promise.all(months.map((m) => companyPnl(m)));
  return rows.map((r) => ({
    month: r.month,
    label: new Date(r.month + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "short" }),
    income: r.income, cost: r.totalCost, profit: r.profit,
  }));
}
