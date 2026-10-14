"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { requireRole, logActivity } from "@/lib/auth";
import { CATEGORY_OPTIONS, str, toInt, today } from "@/lib/format";

type Cat = (typeof CATEGORY_OPTIONS)[number];

export async function createExpense(fd: FormData) {
  const user = await requireRole("OPERATIONS", "FINANCE");
  const amount = toInt(fd.get("amount"));
  const description = str(fd.get("description"));
  const category = (str(fd.get("category")) ?? "OTHER") as Cat;
  if (amount <= 0 || !description || !CATEGORY_OPTIONS.includes(category)) redirect("/expenses?error=1");
  const date = str(fd.get("date")) ?? today();
  await db.insert(expenses).values({
    date, category, amount, description,
    vehicleId: str(fd.get("vehicleId")),
    supplier: str(fd.get("supplier")),
    litres: fd.get("litres") ? Number(fd.get("litres")) || null : null,
    odometer: fd.get("odometer") ? toInt(fd.get("odometer")) || null : null,
    workOrderId: str(fd.get("workOrderId")),
    recordedById: user.id,
  });
  await logActivity(user.id, "expense.create", `${category} ${amount}`);
  revalidatePath("/expenses");
  redirect(`/expenses?month=${date.slice(0, 7)}&saved=1`);
}

export async function deleteExpense(id: string) {
  const user = await requireRole("FINANCE");
  const e = await db.query.expenses.findFirst({ where: eq(expenses.id, id) });
  await db.delete(expenses).where(eq(expenses.id, id));
  await logActivity(user.id, "expense.delete", `${e?.category} ${e?.amount} ${e?.description}`);
  revalidatePath("/expenses");
}
