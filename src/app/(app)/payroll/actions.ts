"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { staff, payrollRuns, payslips, driverAdjustments, expenses } from "@/db/schema";
import { requireRole, logActivity } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { computePayslip } from "@/lib/calc";
import { monthRange, str, toInt, today } from "@/lib/format";

/* ---------- Staff (HR) ---------- */

export async function createStaff(fd: FormData) {
  const user = await requireRole("FINANCE");
  const fullName = str(fd.get("fullName"));
  const basicSalary = toInt(fd.get("basicSalary"));
  if (!fullName || basicSalary <= 0) redirect("/payroll?error=staff");
  await db.insert(staff).values({
    fullName, basicSalary,
    jobTitle: str(fd.get("jobTitle")) ?? "Staff",
    department: str(fd.get("department")) ?? "Operations",
    phone: str(fd.get("phone")), bankName: str(fd.get("bankName")), bankAccount: str(fd.get("bankAccount")),
    startDate: str(fd.get("startDate")) ?? today(),
    driverId: str(fd.get("driverId")),
  });
  await logActivity(user.id, "staff.create", fullName);
  revalidatePath("/payroll");
}

export async function updateStaff(id: string, fd: FormData) {
  const user = await requireRole("FINANCE");
  await db.update(staff).set({
    basicSalary: toInt(fd.get("basicSalary")),
    jobTitle: str(fd.get("jobTitle")) ?? "Staff",
    active: fd.get("active") === "on",
  }).where(eq(staff.id, id));
  await logActivity(user.id, "staff.update", id);
  revalidatePath("/payroll");
}

/* ---------- Payroll runs ---------- */

function back(month: string) {
  revalidatePath("/payroll");
  revalidatePath(`/payroll/${month}`);
  redirect(`/payroll/${month}`);
}

export async function prepareRun(fd: FormData) {
  const user = await requireRole("FINANCE");
  const month = str(fd.get("month"));
  if (!month || !/^\d{4}-\d{2}$/.test(month)) redirect("/payroll?error=month");
  const s = await getSettings();
  let run = await db.query.payrollRuns.findFirst({ where: eq(payrollRuns.month, month) });
  if (!run) [run] = await db.insert(payrollRuns).values({ month, preparedById: user.id }).returning();
  if (run.status !== "DRAFT") back(month);
  const people = await db.select().from(staff).where(eq(staff.active, true));
  const existing = await db.select().from(payslips).where(eq(payslips.runId, run.id));
  for (const p of people) {
    if (existing.some((e) => e.staffId === p.id)) continue;
    const c = computePayslip({ basic: p.basicSalary, bonus: 0, allowances: 0, shortfallRecovery: 0, otherDeductions: 0 }, s);
    await db.insert(payslips).values({ runId: run.id, staffId: p.id, ...c });
  }
  await logActivity(user.id, "payroll.prepare", month);
  back(month);
}

export async function updatePayslip(id: string, month: string, fd: FormData) {
  await requireRole("FINANCE");
  const slip = await db.query.payslips.findFirst({ where: eq(payslips.id, id), with: { run: true } });
  if (!slip || slip.run.status !== "DRAFT") back(month);
  const s = await getSettings();
  const c = computePayslip({
    basic: toInt(fd.get("basic")) || slip!.basic,
    bonus: toInt(fd.get("bonus")),
    allowances: toInt(fd.get("allowances")),
    shortfallRecovery: toInt(fd.get("shortfallRecovery")),
    otherDeductions: toInt(fd.get("otherDeductions")),
  }, s);
  await db.update(payslips).set(c).where(eq(payslips.id, id));
  back(month);
}

/** Recalculate every slip with the current tax settings. */
export async function recalcRun(month: string) {
  await requireRole("FINANCE");
  const run = await db.query.payrollRuns.findFirst({ where: eq(payrollRuns.month, month), with: { payslips: true } });
  if (!run || run.status !== "DRAFT") back(month);
  const s = await getSettings();
  for (const p of run!.payslips) {
    const c = computePayslip({ basic: p.basic, bonus: p.bonus, allowances: p.allowances, shortfallRecovery: p.shortfallRecovery, otherDeductions: p.otherDeductions }, s);
    await db.update(payslips).set(c).where(eq(payslips.id, p.id));
  }
  back(month);
}

/** Manager approval: books shortfall recoveries against drivers and the salary cost into expenses. */
export async function approveRun(month: string) {
  const user = await requireRole();
  const run = await db.query.payrollRuns.findFirst({ where: eq(payrollRuns.month, month), with: { payslips: { with: { staff: true } } } });
  if (!run || run.status !== "DRAFT") back(month);
  const { end } = monthRange(month);
  for (const p of run!.payslips) {
    if (p.shortfallRecovery > 0 && p.staff.driverId) {
      await db.insert(driverAdjustments).values({
        driverId: p.staff.driverId, type: "RECOVERY", amount: p.shortfallRecovery, method: "PAYROLL",
        date: end, note: `Deducted in ${month} payroll`, payslipId: p.id,
      });
    }
  }
  const cost = run!.payslips.reduce((s, p) => s + p.gross + p.pensionEmployer, 0);
  if (cost > 0) {
    await db.insert(expenses).values({
      date: end, category: "SALARIES", amount: cost, description: `Payroll ${month} (gross pay + employer pension)`, recordedById: user.id,
    });
  }
  await db.update(payrollRuns).set({ status: "APPROVED", approvedById: user.id, approvedAt: new Date() }).where(eq(payrollRuns.id, run!.id));
  await logActivity(user.id, "payroll.approve", month);
  back(month);
}

export async function markRunPaid(month: string) {
  const user = await requireRole("FINANCE");
  await db.update(payrollRuns).set({ status: "PAID" }).where(and(eq(payrollRuns.month, month), eq(payrollRuns.status, "APPROVED")));
  await logActivity(user.id, "payroll.paid", month);
  back(month);
}

/** Manager only: undo an approval (removes the bookings it made). */
export async function reopenRun(month: string) {
  const user = await requireRole();
  const run = await db.query.payrollRuns.findFirst({ where: eq(payrollRuns.month, month), with: { payslips: true } });
  if (!run || run.status === "DRAFT") back(month);
  const ids = run!.payslips.map((p) => p.id);
  if (ids.length) await db.delete(driverAdjustments).where(inArray(driverAdjustments.payslipId, ids));
  await db.delete(expenses).where(and(eq(expenses.category, "SALARIES"), eq(expenses.description, `Payroll ${month} (gross pay + employer pension)`)));
  await db.update(payrollRuns).set({ status: "DRAFT", approvedById: null, approvedAt: null }).where(eq(payrollRuns.id, run!.id));
  await logActivity(user.id, "payroll.reopen", month);
  back(month);
}
