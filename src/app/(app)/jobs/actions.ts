"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { haulageJobs, vehicles } from "@/db/schema";
import { requireRole, logActivity } from "@/lib/auth";
import { str, toInt, today } from "@/lib/format";

async function nextWaybill(date: string) {
  const prefix = `WB-${date.slice(0, 7).replace("-", "")}-`;
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(haulageJobs).where(like(haulageJobs.waybillNo, `${prefix}%`));
  return `${prefix}${String(Number(row?.n ?? 0) + 1).padStart(3, "0")}`;
}

export async function createJob(fd: FormData) {
  const user = await requireRole("OPERATIONS", "FINANCE");
  const vehicleId = str(fd.get("vehicleId"));
  const rate = toInt(fd.get("rate"));
  const client = str(fd.get("client"));
  if (!vehicleId || !client || rate <= 0) redirect("/jobs?error=1");
  const v = await db.query.vehicles.findFirst({ where: eq(vehicles.id, vehicleId) });
  const date = str(fd.get("date")) ?? today();
  const [job] = await db.insert(haulageJobs).values({
    waybillNo: await nextWaybill(date), date, vehicleId,
    driverId: str(fd.get("driverId")),
    client, clientPhone: str(fd.get("clientPhone")),
    cargo: str(fd.get("cargo")) ?? "General cargo",
    weightTons: fd.get("weightTons") ? Number(fd.get("weightTons")) || null : null,
    origin: str(fd.get("origin")) ?? "", destination: str(fd.get("destination")) ?? "",
    rate, notes: str(fd.get("notes")),
  }).returning();
  await logActivity(user.id, "job.create", `${job.waybillNo} ${v?.code}`);
  revalidatePath("/jobs");
  redirect(`/jobs/${job.id}`);
}

type JobStatus = "QUOTED" | "IN_TRANSIT" | "DELIVERED" | "INVOICED" | "PAID" | "CANCELLED";

export async function setJobStatus(id: string, status: JobStatus) {
  const user = await requireRole("OPERATIONS", "FINANCE");
  const patch: Partial<typeof haulageJobs.$inferInsert> = { status };
  if (status === "DELIVERED") patch.deliveredAt = today();
  await db.update(haulageJobs).set(patch).where(eq(haulageJobs.id, id));
  await logActivity(user.id, "job.status", `${id} ${status}`);
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
}

export async function recordJobPayment(id: string, fd: FormData) {
  const user = await requireRole("FINANCE");
  const job = await db.query.haulageJobs.findFirst({ where: eq(haulageJobs.id, id) });
  if (!job) redirect("/jobs");
  const amount = toInt(fd.get("amount"));
  const paid = job.amountPaid + amount;
  await db.update(haulageJobs).set({
    amountPaid: paid, status: paid >= job.rate ? "PAID" : job.status === "PAID" ? "INVOICED" : job.status, paidAt: paid >= job.rate ? today() : null,
  }).where(eq(haulageJobs.id, id));
  await logActivity(user.id, "job.payment", `${job.waybillNo} ${amount}`);
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
}
