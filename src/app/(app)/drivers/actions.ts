"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { drivers, assignments, expenses, driverAdjustments, users, vehicles, complianceDocs } from "@/db/schema";
import { requireRole, logActivity } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { sendWelcome, tempPassword } from "@/lib/invite";
import { str, toInt, today } from "@/lib/format";

function readDriver(fd: FormData) {
  return {
    fullName: str(fd.get("fullName")) ?? "",
    phone: str(fd.get("phone")) ?? "",
    nationalId: str(fd.get("nationalId")),
    licenceNumber: str(fd.get("licenceNumber")),
    address: str(fd.get("address")),
    guarantorName: str(fd.get("guarantorName")),
    guarantorPhone: str(fd.get("guarantorPhone")),
    startDate: str(fd.get("startDate")) ?? today(),
    notes: str(fd.get("notes")),
  };
}

async function assign(driverId: string, vehicleId: string | null) {
  const d = today();
  // Close this driver's open assignment
  await db.update(assignments).set({ endDate: d }).where(and(eq(assignments.driverId, driverId), isNull(assignments.endDate)));
  if (vehicleId) {
    // Anyone else on this vehicle is moved off it
    const others = await db.select().from(drivers).where(and(eq(drivers.vehicleId, vehicleId), ne(drivers.id, driverId)));
    for (const o of others) {
      await db.update(drivers).set({ vehicleId: null }).where(eq(drivers.id, o.id));
      await db.update(assignments).set({ endDate: d }).where(and(eq(assignments.driverId, o.id), isNull(assignments.endDate)));
    }
    await db.insert(assignments).values({ driverId, vehicleId, startDate: d });
  }
  await db.update(drivers).set({ vehicleId }).where(eq(drivers.id, driverId));
}

export async function createDriver(fd: FormData) {
  const user = await requireRole("OPERATIONS");
  const data = readDriver(fd);
  if (!data.fullName || !data.phone) redirect("/drivers?error=missing");
  const vehicleId = str(fd.get("vehicleId"));
  const starterCost = toInt(fd.get("starterFuelCost"));
  const [d] = await db.insert(drivers).values({ ...data, starterFuelGiven: starterCost > 0 }).returning();
  if (vehicleId) await assign(d.id, vehicleId);

  // Licence expiries go straight into compliance tracking
  const licExp = str(fd.get("licenceExpiry"));
  const psvExp = str(fd.get("psvExpiry"));
  if (licExp) await db.insert(complianceDocs).values({ type: "DRIVING_LICENCE", driverId: d.id, number: data.licenceNumber, expiryDate: licExp });
  if (psvExp) await db.insert(complianceDocs).values({ type: "PSV_LICENCE", driverId: d.id, expiryDate: psvExp });

  if (starterCost > 0) {
    const s = await getSettings();
    await db.insert(expenses).values({
      date: data.startDate, vehicleId, category: "STARTER_FUEL", amount: starterCost,
      description: `Starter fuel (${s.starterFuelLitres} L) for new driver ${data.fullName}`, litres: s.starterFuelLitres, recordedById: user.id,
    });
  }
  await logActivity(user.id, "driver.create", data.fullName);
  revalidatePath("/drivers");
  redirect(`/drivers/${d.id}`);
}

export async function updateDriver(id: string, fd: FormData) {
  const user = await requireRole("OPERATIONS");
  const status = (str(fd.get("status")) ?? "ACTIVE") as "ACTIVE" | "SUSPENDED" | "LEFT";
  await db.update(drivers).set({ ...readDriver(fd), status }).where(eq(drivers.id, id));
  if (status === "LEFT") await assign(id, null);
  await logActivity(user.id, "driver.update", id);
  revalidatePath(`/drivers/${id}`);
  redirect(`/drivers/${id}?saved=1`);
}

export async function assignVehicle(id: string, fd: FormData) {
  const user = await requireRole("OPERATIONS");
  const vehicleId = str(fd.get("vehicleId"));
  await assign(id, vehicleId);
  const v = vehicleId ? await db.query.vehicles.findFirst({ where: eq(vehicles.id, vehicleId) }) : null;
  await logActivity(user.id, "driver.assign", `${id} → ${v?.code ?? "none"}`);
  revalidatePath(`/drivers/${id}`);
  revalidatePath("/drivers");
}

export async function recordAdjustment(driverId: string, fd: FormData) {
  const user = await requireRole("FINANCE", "OPERATIONS");
  const type = (str(fd.get("type")) ?? "RECOVERY") as "RECOVERY" | "WAIVER";
  if (type === "WAIVER" && user.role !== "MANAGER") redirect(`/drivers/${driverId}?error=waiver`);
  const amount = toInt(fd.get("amount"));
  if (amount <= 0) redirect(`/drivers/${driverId}?error=amount`);
  await db.insert(driverAdjustments).values({
    driverId, type, amount,
    method: type === "RECOVERY" ? ((str(fd.get("method")) ?? "CASH") as "CASH") : null,
    date: str(fd.get("date")) ?? today(), note: str(fd.get("note")),
  });
  await logActivity(user.id, `driver.${type.toLowerCase()}`, `${driverId} ${amount}`);
  revalidatePath(`/drivers/${driverId}`);
  revalidatePath("/ledger");
}

export async function createDriverLogin(driverId: string, fd: FormData) {
  const user = await requireRole("OPERATIONS");
  const d = await db.query.drivers.findFirst({ where: eq(drivers.id, driverId) });
  if (!d) redirect("/drivers");
  const email = (str(fd.get("email")) ?? "").toLowerCase();
  const password = String(fd.get("password") ?? "");
  // Blank password = email the driver their own temporary password.
  if (!email || !email.includes("@") || (password && password.length < 8)) redirect(`/drivers/${driverId}?error=login`);
  const exists = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (exists) redirect(`/drivers/${driverId}?error=email`);
  const [u] = await db.insert(users).values({
    name: d.fullName, email, role: "DRIVER", driverId, mustChangePassword: true,
    passwordHash: await bcrypt.hash(password || tempPassword() + tempPassword(), 10),
  }).returning();
  await logActivity(user.id, "driver.login.create", email);
  if (!password) {
    const r = await sendWelcome(u.id);
    redirect(`/drivers/${driverId}?saved=${r.ok ? "login-emailed" : "login-nomail"}`);
  }
  redirect(`/drivers/${driverId}?saved=login`);
}
