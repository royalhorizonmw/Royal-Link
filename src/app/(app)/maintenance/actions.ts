"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { serviceSchedules, workOrders, vehicles, expenses } from "@/db/schema";
import { requireRole, logActivity } from "@/lib/auth";
import { str, toInt, today } from "@/lib/format";

function done() {
  revalidatePath("/maintenance");
  revalidatePath("/");
}

export async function createSchedule(fd: FormData) {
  await requireRole("OPERATIONS");
  const vehicleId = str(fd.get("vehicleId"));
  const title = str(fd.get("title"));
  if (!vehicleId || !title) redirect("/maintenance?error=1");
  const v = await db.query.vehicles.findFirst({ where: eq(vehicles.id, vehicleId) });
  await db.insert(serviceSchedules).values({
    vehicleId, title,
    intervalKm: fd.get("intervalKm") ? toInt(fd.get("intervalKm")) || null : null,
    intervalDays: fd.get("intervalDays") ? toInt(fd.get("intervalDays")) || null : null,
    lastDoneKm: fd.get("lastDoneKm") ? toInt(fd.get("lastDoneKm")) : v?.odometer ?? 0,
    lastDoneDate: str(fd.get("lastDoneDate")) ?? today(),
  });
  done();
}

export async function markScheduleDone(id: string) {
  const user = await requireRole("OPERATIONS");
  const s = await db.query.serviceSchedules.findFirst({ where: eq(serviceSchedules.id, id) });
  if (!s) return;
  const v = await db.query.vehicles.findFirst({ where: eq(vehicles.id, s.vehicleId) });
  await db.update(serviceSchedules).set({ lastDoneKm: v?.odometer ?? s.lastDoneKm, lastDoneDate: today() }).where(eq(serviceSchedules.id, id));
  await db.insert(workOrders).values({ vehicleId: s.vehicleId, title: s.title, status: "DONE", openedAt: today(), closedAt: today(), odometer: v?.odometer, scheduleId: id });
  await logActivity(user.id, "service.done", `${v?.code} ${s.title}`);
  done();
}

export async function deleteSchedule(id: string) {
  await requireRole("OPERATIONS");
  await db.update(serviceSchedules).set({ active: false }).where(eq(serviceSchedules.id, id));
  done();
}

export async function createWorkOrder(fd: FormData) {
  const user = await requireRole("OPERATIONS");
  const vehicleId = str(fd.get("vehicleId"));
  const title = str(fd.get("title"));
  if (!vehicleId || !title) redirect("/maintenance?error=1");
  const v = await db.query.vehicles.findFirst({ where: eq(vehicles.id, vehicleId) });
  await db.insert(workOrders).values({
    vehicleId, title, details: str(fd.get("details")), mechanic: str(fd.get("mechanic")),
    status: "OPEN", openedAt: today(), odometer: v?.odometer,
  });
  if (fd.get("toGarage") === "on") await db.update(vehicles).set({ status: "IN_GARAGE" }).where(eq(vehicles.id, vehicleId));
  await logActivity(user.id, "workorder.create", `${v?.code} ${title}`);
  done();
}

export async function startWorkOrder(id: string) {
  await requireRole("OPERATIONS");
  await db.update(workOrders).set({ status: "IN_PROGRESS" }).where(eq(workOrders.id, id));
  done();
}

/** Close a job: optional cost becomes a repairs expense on the vehicle. */
export async function closeWorkOrder(id: string, fd: FormData) {
  const user = await requireRole("OPERATIONS");
  const wo = await db.query.workOrders.findFirst({ where: eq(workOrders.id, id) });
  if (!wo) return;
  const cost = toInt(fd.get("cost"));
  await db.update(workOrders).set({ status: "DONE", closedAt: today() }).where(eq(workOrders.id, id));
  if (cost > 0) {
    await db.insert(expenses).values({
      date: today(), vehicleId: wo.vehicleId, category: (str(fd.get("category")) ?? "REPAIRS_PARTS") as "REPAIRS_PARTS",
      amount: cost, description: `Work order: ${wo.title}`, supplier: wo.mechanic, workOrderId: id, recordedById: user.id,
    });
  }
  if (fd.get("backOnRoad") === "on") await db.update(vehicles).set({ status: "ACTIVE" }).where(eq(vehicles.id, wo.vehicleId));
  await logActivity(user.id, "workorder.close", `${id} ${cost}`);
  done();
}
