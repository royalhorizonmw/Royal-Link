"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { complaints, drivers } from "@/db/schema";
import { requireRole, logActivity } from "@/lib/auth";
import { str, today } from "@/lib/format";

type Sev = "LOW" | "MEDIUM" | "HIGH";
type Src = "PASSENGER" | "CLIENT" | "STAFF" | "DRIVER";

export async function createComplaint(fd: FormData) {
  const user = await requireRole("OPERATIONS");
  const description = str(fd.get("description"));
  if (!description) redirect("/complaints?error=1");
  const vehicleId = str(fd.get("vehicleId"));
  let driverId = str(fd.get("driverId"));
  if (!driverId && vehicleId) {
    const d = await db.query.drivers.findFirst({ where: and(eq(drivers.vehicleId, vehicleId), eq(drivers.status, "ACTIVE")) });
    driverId = d?.id ?? null;
  }
  await db.insert(complaints).values({
    date: str(fd.get("date")) ?? today(), source: (str(fd.get("source")) ?? "PASSENGER") as Src,
    severity: (str(fd.get("severity")) ?? "MEDIUM") as Sev, vehicleId, driverId, description,
    contactName: str(fd.get("contactName")), contactPhone: str(fd.get("contactPhone")), assignedToId: user.id,
  });
  await logActivity(user.id, "complaint.create", description.slice(0, 80));
  revalidatePath("/complaints");
}

export async function moveComplaint(id: string, status: "NEW" | "IN_PROGRESS") {
  const user = await requireRole("OPERATIONS");
  await db.update(complaints).set({ status, assignedToId: user.id }).where(eq(complaints.id, id));
  revalidatePath("/complaints");
}

export async function resolveComplaint(id: string, fd: FormData) {
  const user = await requireRole("OPERATIONS");
  await db.update(complaints).set({
    status: "RESOLVED", resolution: str(fd.get("resolution")) ?? "Resolved", resolvedAt: today(),
    severity: (str(fd.get("severity")) ?? undefined) as Sev | undefined,
  }).where(eq(complaints.id, id));
  await logActivity(user.id, "complaint.resolve", id);
  revalidatePath("/complaints");
}
