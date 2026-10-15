"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vehicles, serviceSchedules } from "@/db/schema";
import { requireRole, logActivity } from "@/lib/auth";
import { str, toInt, today } from "@/lib/format";

type VType = "MINIBUS" | "BUS" | "LORRY";
type Mode = "DAILY_TARGET" | "PER_JOB" | "BOTH";
type VStatus = "ACTIVE" | "IN_GARAGE" | "PARKED" | "DISPOSED";

function readVehicle(fd: FormData) {
  const type = (str(fd.get("type")) ?? "MINIBUS") as VType;
  return {
    code: (str(fd.get("code")) ?? "").toUpperCase(),
    regNumber: (str(fd.get("regNumber")) ?? "").toUpperCase(),
    type,
    make: str(fd.get("make")),
    model: str(fd.get("model")),
    year: fd.get("year") ? toInt(fd.get("year")) || null : null,
    seats: fd.get("seats") ? toInt(fd.get("seats")) || null : null,
    capacityTons: fd.get("capacityTons") ? Number(fd.get("capacityTons")) || null : null,
    earningMode: (str(fd.get("earningMode")) ?? (type === "LORRY" ? "BOTH" : "DAILY_TARGET")) as Mode,
    dailyTarget: toInt(fd.get("dailyTarget")),
    odometer: toInt(fd.get("odometer")),
    purchaseDate: str(fd.get("purchaseDate")),
    purchaseCost: fd.get("purchaseCost") ? toInt(fd.get("purchaseCost")) || null : null,
    notes: str(fd.get("notes")),
  };
}

export async function createVehicle(fd: FormData) {
  const user = await requireRole("OPERATIONS");
  const v = readVehicle(fd);
  if (!v.code || !v.regNumber) redirect("/vehicles?error=missing");
  const [row] = await db.insert(vehicles).values(v).returning();
  // Standard maintenance plan so alerts work from day one.
  // Buses: brake pads every 3 weeks, oil monthly. Lorries: oil every 5,000 km or 90 days.
  // Full services are not automatic; they are planned as one-off jobs on the Maintenance page.
  const isBus = v.type !== "LORRY";
  await db.insert(serviceSchedules).values(isBus ? [
    { vehicleId: row.id, title: "Brake pads", intervalDays: 21, lastDoneKm: v.odometer, lastDoneDate: today() },
    { vehicleId: row.id, title: "Oil & filter change", intervalDays: 30, lastDoneKm: v.odometer, lastDoneDate: today() },
  ] : [
    { vehicleId: row.id, title: "Oil & filter change", intervalKm: 5000, intervalDays: 90, lastDoneKm: v.odometer, lastDoneDate: today() },
  ]);
  await logActivity(user.id, "vehicle.create", v.code);
  revalidatePath("/vehicles");
  redirect(`/vehicles/${row.id}`);
}

export async function updateVehicle(id: string, fd: FormData) {
  const user = await requireRole("OPERATIONS");
  const v = readVehicle(fd);
  const status = (str(fd.get("status")) ?? "ACTIVE") as VStatus;
  await db.update(vehicles).set({ ...v, status }).where(eq(vehicles.id, id));
  await logActivity(user.id, "vehicle.update", v.code);
  revalidatePath(`/vehicles/${id}`);
  redirect(`/vehicles/${id}?saved=1`);
}

export async function setVehicleStatus(id: string, status: VStatus) {
  await requireRole("OPERATIONS");
  await db.update(vehicles).set({ status }).where(eq(vehicles.id, id));
  revalidatePath(`/vehicles/${id}`);
  revalidatePath("/vehicles");
}

export async function updateOdometer(id: string, fd: FormData) {
  await requireRole("OPERATIONS");
  const km = toInt(fd.get("odometer"));
  if (km > 0) await db.update(vehicles).set({ odometer: km }).where(eq(vehicles.id, id));
  revalidatePath(`/vehicles/${id}`);
  revalidatePath("/maintenance");
}
