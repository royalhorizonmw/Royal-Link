"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { budgets, incomeTargets } from "@/db/schema";
import { requireRole, logActivity } from "@/lib/auth";
import { CATEGORY_OPTIONS, shiftMonth, toInt } from "@/lib/format";

async function upsertBudget(month: string, category: (typeof CATEGORY_OPTIONS)[number], amount: number) {
  const row = await db.query.budgets.findFirst({ where: and(eq(budgets.month, month), eq(budgets.category, category), isNull(budgets.vehicleId)) });
  if (row) await db.update(budgets).set({ amount }).where(eq(budgets.id, row.id));
  else if (amount > 0) await db.insert(budgets).values({ month, category, amount });
}

async function upsertIncome(month: string, amount: number) {
  const row = await db.query.incomeTargets.findFirst({ where: eq(incomeTargets.month, month) });
  if (row) await db.update(incomeTargets).set({ amount }).where(eq(incomeTargets.id, row.id));
  else if (amount > 0) await db.insert(incomeTargets).values({ month, amount });
}

export async function saveBudget(month: string, fd: FormData) {
  const user = await requireRole("FINANCE");
  await upsertIncome(month, toInt(fd.get("income")));
  for (const c of CATEGORY_OPTIONS) {
    if (fd.has(c)) await upsertBudget(month, c, toInt(fd.get(c)));
  }
  await logActivity(user.id, "budget.save", month);
  revalidatePath("/budgets");
  redirect(`/budgets?month=${month}&saved=1`);
}

export async function copyLastMonth(month: string) {
  const user = await requireRole("FINANCE");
  const prev = shiftMonth(month, -1);
  const rows = await db.select().from(budgets).where(and(eq(budgets.month, prev), isNull(budgets.vehicleId)));
  for (const r of rows) await upsertBudget(month, r.category, r.amount);
  const inc = await db.query.incomeTargets.findFirst({ where: eq(incomeTargets.month, prev) });
  if (inc) await upsertIncome(month, inc.amount);
  await logActivity(user.id, "budget.copy", `${prev} → ${month}`);
  revalidatePath("/budgets");
  redirect(`/budgets?month=${month}&saved=1`);
}
