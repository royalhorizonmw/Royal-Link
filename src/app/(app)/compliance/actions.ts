"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { complianceDocs, expenses } from "@/db/schema";
import { requireRole, logActivity } from "@/lib/auth";
import { label, str, toInt, today } from "@/lib/format";

type DocType = "COF" | "INSURANCE" | "ROAD_LICENCE" | "PSV_LICENCE" | "DRIVING_LICENCE" | "OPERATOR_PERMIT" | "OTHER";

async function costToExpense(type: DocType, vehicleId: string | null, cost: number, userId: string, number: string | null) {
  if (cost <= 0) return;
  await db.insert(expenses).values({
    date: today(), vehicleId, category: type === "INSURANCE" ? "INSURANCE" : "COF_LICENCE", amount: cost,
    description: `${label(type)}${number ? ` ${number}` : ""}`, recordedById: userId,
  });
}

export async function createDoc(fd: FormData) {
  const user = await requireRole("OPERATIONS");
  const type = (str(fd.get("type")) ?? "OTHER") as DocType;
  const owner = str(fd.get("owner")); // "v:<id>" or "d:<id>"
  const expiryDate = str(fd.get("expiryDate"));
  if (!owner || !expiryDate) redirect("/compliance?error=1");
  const vehicleId = owner.startsWith("v:") ? owner.slice(2) : null;
  const driverId = owner.startsWith("d:") ? owner.slice(2) : null;
  const cost = toInt(fd.get("cost"));
  const number = str(fd.get("number"));
  await db.insert(complianceDocs).values({
    type, vehicleId, driverId, number, issuer: str(fd.get("issuer")), issueDate: str(fd.get("issueDate")), expiryDate,
    cost: cost || null, notes: str(fd.get("notes")),
  });
  await costToExpense(type, vehicleId, cost, user.id, number);
  await logActivity(user.id, "doc.create", `${type} ${expiryDate}`);
  revalidatePath("/compliance");
}

export async function renewDoc(id: string, fd: FormData) {
  const user = await requireRole("OPERATIONS");
  const doc = await db.query.complianceDocs.findFirst({ where: eq(complianceDocs.id, id) });
  const expiryDate = str(fd.get("expiryDate"));
  if (!doc || !expiryDate) redirect("/compliance?error=1");
  const cost = toInt(fd.get("cost"));
  await db.update(complianceDocs).set({ expiryDate, issueDate: today(), cost: cost || doc.cost }).where(eq(complianceDocs.id, id));
  await costToExpense(doc.type, doc.vehicleId, cost, user.id, doc.number);
  await logActivity(user.id, "doc.renew", `${doc.type} → ${expiryDate}`);
  revalidatePath("/compliance");
}

export async function deleteDoc(id: string) {
  await requireRole("OPERATIONS");
  await db.delete(complianceDocs).where(eq(complianceDocs.id, id));
  revalidatePath("/compliance");
}
