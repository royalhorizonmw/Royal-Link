"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole, requireUser, logActivity } from "@/lib/auth";
import { setSetting, type PayeBand } from "@/lib/settings";
import { str, toInt } from "@/lib/format";

export async function saveSettings(fd: FormData) {
  const user = await requireRole();
  await setSetting("companyName", str(fd.get("companyName")) ?? "Royal Link Transports & Travels");
  const bands: PayeBand[] = [];
  for (let i = 0; i < 6; i++) {
    const rate = fd.get(`rate${i}`);
    if (rate == null || String(rate).trim() === "") continue;
    const upTo = str(fd.get(`upTo${i}`));
    bands.push({ upTo: upTo ? toInt(upTo) : null, rate: Number(rate) / 100 });
  }
  bands.sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  if (bands.length) await setSetting("payeBands", bands);
  await setSetting("pensionEmployeeRate", Number(fd.get("pensionEmployeeRate") ?? 5) / 100);
  await setSetting("pensionEmployerRate", Number(fd.get("pensionEmployerRate") ?? 10) / 100);
  await setSetting("starterFuelLitres", Number(fd.get("starterFuelLitres") ?? 5));
  await setSetting("restDaysPerWeek", toInt(fd.get("restDaysPerWeek")));
  await setSetting("shortStreakAlert", Math.max(1, toInt(fd.get("shortStreakAlert"))));
  await setSetting("complianceWarnDays", Math.max(1, toInt(fd.get("complianceWarnDays"))));
  const pi = str(fd.get("paymentInstructions"));
  if (pi) await setSetting("paymentInstructions", pi);
  await logActivity(user.id, "settings.save");
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

type Role = "MANAGER" | "OPERATIONS" | "FINANCE" | "DRIVER";

export async function createUser(fd: FormData) {
  const user = await requireRole();
  const email = (str(fd.get("email")) ?? "").toLowerCase();
  const name = str(fd.get("name"));
  const password = String(fd.get("password") ?? "");
  const role = (str(fd.get("role")) ?? "OPERATIONS") as Role;
  if (!email || !name || password.length < 8) redirect("/settings?error=user");
  if (await db.query.users.findFirst({ where: eq(users.email, email) })) redirect("/settings?error=email");
  await db.insert(users).values({ name, email, role, passwordHash: await bcrypt.hash(password, 10) });
  await logActivity(user.id, "user.create", `${email} ${role}`);
  redirect("/settings?saved=user");
}

export async function toggleUser(id: string) {
  const me = await requireRole();
  if (id === me.id) redirect("/settings?error=self");
  const u = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (u) await db.update(users).set({ active: !u.active }).where(eq(users.id, id));
  revalidatePath("/settings");
}

export async function resetPassword(id: string, fd: FormData) {
  const me = await requireRole();
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) redirect("/settings?error=user");
  await db.update(users).set({ passwordHash: await bcrypt.hash(password, 10) }).where(eq(users.id, id));
  await logActivity(me.id, "user.reset", id);
  redirect("/settings?saved=password");
}

/** Any signed-in user can change their own password. */
export async function changeOwnPassword(fd: FormData) {
  const me = await requireUser();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const back = me.role === "DRIVER" ? "/me" : "/settings/account";
  if (!(await bcrypt.compare(current, me.passwordHash)) || next.length < 8) redirect(`${back}?error=pw`);
  await db.update(users).set({ passwordHash: await bcrypt.hash(next, 10) }).where(eq(users.id, me.id));
  redirect(`${back}?saved=pw`);
}
