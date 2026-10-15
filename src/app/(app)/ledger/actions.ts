"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { dailyRecords, vehicles, drivers } from "@/db/schema";
import { requireRole, logActivity } from "@/lib/auth";
import { addDays, str, toInt, today, weekStart } from "@/lib/format";

type Method = "CASH" | "AIRTEL_MONEY" | "TNM_MPAMBA" | "BANK";

function back(date: string) {
  revalidatePath("/ledger");
  revalidatePath("/");
  redirect(`/ledger?date=${date}`);
}

/** Weekly targets whose week has ended and are still unpaid become short. */
async function closeEndedWeeks(date: string) {
  const weekly = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.targetPeriod, "WEEK"));
  if (!weekly.length) return;
  await db.update(dailyRecords).set({ status: "SHORT", updatedAt: new Date() }).where(and(
    inArray(dailyRecords.vehicleId, weekly.map((w) => w.id)),
    eq(dailyRecords.status, "PENDING"),
    lt(dailyRecords.date, weekStart(date)),
  ));
}

/**
 * Creates the sheet: one row per vehicle on a target. Daily vehicles get a row for the day;
 * weekly vehicles (lorries) get one row for the whole Monday–Sunday week. Safe to run again.
 */
export async function openDay(date: string) {
  const user = await requireRole("OPERATIONS", "FINANCE");
  if (date > today()) redirect(`/ledger?date=${date}&error=future`);
  await closeEndedWeeks(date);
  const vs = await db.select().from(vehicles).where(and(
    inArray(vehicles.status, ["ACTIVE", "IN_GARAGE"]),
    ne(vehicles.earningMode, "PER_JOB"),
  ));
  const ds = await db.select().from(drivers).where(eq(drivers.status, "ACTIVE"));
  for (const v of vs) {
    const drv = ds.find((d) => d.vehicleId === v.id);
    const garage = v.status === "IN_GARAGE";
    await db.insert(dailyRecords).values({
      date: v.targetPeriod === "WEEK" ? weekStart(date) : date,
      vehicleId: v.id, driverId: drv?.id ?? null, target: v.dailyTarget,
      status: garage ? "EXCUSED" : "PENDING",
      excuseReason: garage ? "Vehicle in garage" : null,
      approvedById: garage ? user.id : null,
      recordedById: user.id,
    }).onConflictDoNothing();
  }
  await logActivity(user.id, "ledger.open", date);
  back(date);
}

export async function recordPayment(id: string, date: string, fd: FormData) {
  const user = await requireRole("OPERATIONS", "FINANCE");
  const rec = await db.query.dailyRecords.findFirst({ where: eq(dailyRecords.id, id) });
  if (!rec) back(date);
  const amount = toInt(fd.get("amount"));
  const method = (str(fd.get("method")) ?? "CASH") as Method;
  const v = await db.query.vehicles.findFirst({ where: eq(vehicles.id, rec!.vehicleId) });
  // A weekly target can be paid in instalments: it stays open until the week (Mon–Sun) is over.
  const weekOpen = v?.targetPeriod === "WEEK" && today() <= addDays(rec!.date, 6);
  const status = amount >= rec!.target ? "PAID" : weekOpen ? "PENDING" : "SHORT";
  await db.update(dailyRecords).set({
    amountPaid: amount, method, reference: str(fd.get("reference")), status,
    excuseReason: null, approvedById: null, recordedById: user.id, updatedAt: new Date(),
  }).where(eq(dailyRecords.id, id));
  await logActivity(user.id, "ledger.payment", `${id} ${amount} ${status}`);
  back(date);
}

export async function markRestDay(id: string, date: string) {
  const user = await requireRole("OPERATIONS", "FINANCE");
  await db.update(dailyRecords).set({ status: "REST_DAY", amountPaid: 0, method: null, recordedById: user.id, updatedAt: new Date() }).where(eq(dailyRecords.id, id));
  back(date);
}

/** Operations/Finance request an excuse; a manager's own excuse is approved at once. */
export async function requestExcuse(id: string, date: string, fd: FormData) {
  const user = await requireRole("OPERATIONS", "FINANCE");
  const reason = str(fd.get("reason"));
  if (!reason) redirect(`/ledger?date=${date}&error=reason`);
  await db.update(dailyRecords).set({
    status: "EXCUSED", amountPaid: 0, excuseReason: reason,
    approvedById: user.role === "MANAGER" ? user.id : null, recordedById: user.id, updatedAt: new Date(),
  }).where(eq(dailyRecords.id, id));
  await logActivity(user.id, "ledger.excuse", `${id} ${reason}`);
  back(date);
}

export async function approveExcuse(id: string, date: string) {
  const user = await requireRole();
  await db.update(dailyRecords).set({ approvedById: user.id, updatedAt: new Date() }).where(eq(dailyRecords.id, id));
  await logActivity(user.id, "ledger.excuse.approve", id);
  back(date);
}

export async function rejectExcuse(id: string, date: string) {
  const user = await requireRole();
  await db.update(dailyRecords).set({ status: "SHORT", approvedById: null, updatedAt: new Date() }).where(eq(dailyRecords.id, id));
  await logActivity(user.id, "ledger.excuse.reject", id);
  back(date);
}

export async function reopenRecord(id: string, date: string) {
  await requireRole("OPERATIONS", "FINANCE");
  await db.update(dailyRecords).set({ status: "PENDING", amountPaid: 0, method: null, reference: null, excuseReason: null, approvedById: null, updatedAt: new Date() }).where(eq(dailyRecords.id, id));
  back(date);
}

/**
 * End of day: daily targets still pending become short. Weekly targets are only closed
 * when the week is over (closing a Sunday, or any later day).
 */
export async function closeDay(date: string) {
  const user = await requireRole("FINANCE");
  const weekly = (await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.targetPeriod, "WEEK"))).map((w) => w.id);
  const pendingToday = await db.select().from(dailyRecords).where(and(eq(dailyRecords.date, date), eq(dailyRecords.status, "PENDING")));
  const dailyIds = pendingToday.filter((r) => !weekly.includes(r.vehicleId)).map((r) => r.id);
  if (dailyIds.length) await db.update(dailyRecords).set({ status: "SHORT", updatedAt: new Date() }).where(inArray(dailyRecords.id, dailyIds));
  await closeEndedWeeks(addDays(date, 1));
  await logActivity(user.id, "ledger.close", date);
  back(date);
}
