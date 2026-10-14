import "server-only";
import { and, eq, gte, lte, sql, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  dailyRecords, driverAdjustments, expenses, haulageJobs, vehicles, drivers, complaints, complianceDocs,
} from "@/db/schema";
import { addDays, daysBetween, today } from "./format";
import type { PayeBand, AppSettings } from "./settings";

/* ---------------- Payroll ---------------- */

/** Monthly PAYE from progressive bands. */
export function computePaye(taxable: number, bands: PayeBand[]) {
  let tax = 0;
  let lower = 0;
  for (const b of bands) {
    const upper = b.upTo ?? Infinity;
    if (taxable <= lower) break;
    const slice = Math.min(taxable, upper) - lower;
    tax += slice * b.rate;
    lower = upper;
  }
  return Math.round(tax);
}

export function computePayslip(
  input: { basic: number; bonus: number; allowances: number; shortfallRecovery: number; otherDeductions: number },
  s: Pick<AppSettings, "payeBands" | "pensionEmployeeRate" | "pensionEmployerRate">,
) {
  const gross = input.basic + input.bonus + input.allowances;
  const pensionEmployee = Math.round(input.basic * s.pensionEmployeeRate);
  const pensionEmployer = Math.round(input.basic * s.pensionEmployerRate);
  // Employee pension contributions are deducted before PAYE.
  const paye = computePaye(Math.max(0, gross - pensionEmployee), s.payeBands);
  const net = gross - paye - pensionEmployee - input.shortfallRecovery - input.otherDeductions;
  return { ...input, gross, paye, pensionEmployee, pensionEmployer, net };
}

/* ---------------- Driver balances ---------------- */

/**
 * Amount each driver still owes on daily targets:
 * Σ(target − paid) on PAID/SHORT days, minus recoveries and waivers.
 * Positive = driver owes the company.
 */
export async function driverBalances(driverIds?: string[]) {
  const owed = await db
    .select({
      driverId: dailyRecords.driverId,
      owed: sql<number>`coalesce(sum(${dailyRecords.target} - ${dailyRecords.amountPaid}), 0)::int`,
    })
    .from(dailyRecords)
    .where(and(
      inArray(dailyRecords.status, ["PAID", "SHORT"]),
      driverIds ? inArray(dailyRecords.driverId, driverIds) : undefined,
    ))
    .groupBy(dailyRecords.driverId);

  const adj = await db
    .select({ driverId: driverAdjustments.driverId, total: sql<number>`coalesce(sum(${driverAdjustments.amount}),0)::int` })
    .from(driverAdjustments)
    .where(driverIds ? inArray(driverAdjustments.driverId, driverIds) : undefined)
    .groupBy(driverAdjustments.driverId);

  const map = new Map<string, number>();
  for (const r of owed) if (r.driverId) map.set(r.driverId, Number(r.owed));
  for (const a of adj) map.set(a.driverId, (map.get(a.driverId) ?? 0) - Number(a.total));
  return map;
}

/** Oldest unpaid short day per driver, used for ageing. */
export async function shortfallAgeing() {
  const rows = await db
    .select({ date: dailyRecords.date, gap: sql<number>`(${dailyRecords.target} - ${dailyRecords.amountPaid})::int` })
    .from(dailyRecords)
    .where(eq(dailyRecords.status, "SHORT"));
  const t = today();
  const buckets = { "1–7 days": 0, "8–14 days": 0, "15–30 days": 0, "30+ days": 0 };
  for (const r of rows) {
    const age = daysBetween(r.date, t);
    const k = age <= 7 ? "1–7 days" : age <= 14 ? "8–14 days" : age <= 30 ? "15–30 days" : "30+ days";
    buckets[k] += Number(r.gap);
  }
  return buckets;
}

/* ---------------- Income & P&L ---------------- */

const JOB_EARNED = ["DELIVERED", "INVOICED", "PAID"] as const;

export async function incomeByVehicle(start: string, end: string) {
  const target = await db
    .select({ vehicleId: dailyRecords.vehicleId, v: sql<number>`coalesce(sum(${dailyRecords.amountPaid}),0)::int` })
    .from(dailyRecords)
    .where(and(gte(dailyRecords.date, start), lte(dailyRecords.date, end)))
    .groupBy(dailyRecords.vehicleId);
  const jobs = await db
    .select({ vehicleId: haulageJobs.vehicleId, v: sql<number>`coalesce(sum(${haulageJobs.rate}),0)::int` })
    .from(haulageJobs)
    .where(and(gte(haulageJobs.date, start), lte(haulageJobs.date, end), inArray(haulageJobs.status, [...JOB_EARNED])))
    .groupBy(haulageJobs.vehicleId);
  const out = new Map<string, { target: number; jobs: number }>();
  for (const r of target) out.set(r.vehicleId, { target: Number(r.v), jobs: 0 });
  for (const r of jobs) out.set(r.vehicleId, { target: out.get(r.vehicleId)?.target ?? 0, jobs: Number(r.v) });
  return out;
}

export async function expensesByVehicle(start: string, end: string) {
  const rows = await db
    .select({ vehicleId: expenses.vehicleId, v: sql<number>`coalesce(sum(${expenses.amount}),0)::int` })
    .from(expenses)
    .where(and(gte(expenses.date, start), lte(expenses.date, end)))
    .groupBy(expenses.vehicleId);
  const out = new Map<string | null, number>();
  for (const r of rows) out.set(r.vehicleId, Number(r.v));
  return out;
}

export async function expensesByCategory(start: string, end: string) {
  const rows = await db
    .select({ category: expenses.category, v: sql<number>`coalesce(sum(${expenses.amount}),0)::int` })
    .from(expenses)
    .where(and(gte(expenses.date, start), lte(expenses.date, end)))
    .groupBy(expenses.category);
  return new Map(rows.map((r) => [r.category, Number(r.v)]));
}

export async function targetHitByVehicle(start: string, end: string) {
  const rows = await db
    .select({
      vehicleId: dailyRecords.vehicleId,
      expected: sql<number>`coalesce(sum(${dailyRecords.target}),0)::int`,
      paid: sql<number>`coalesce(sum(least(${dailyRecords.amountPaid}, ${dailyRecords.target})),0)::int`,
    })
    .from(dailyRecords)
    .where(and(gte(dailyRecords.date, start), lte(dailyRecords.date, end), inArray(dailyRecords.status, ["PAID", "SHORT"])))
    .groupBy(dailyRecords.vehicleId);
  return new Map(rows.map((r) => [r.vehicleId, r.expected ? Number(r.paid) / Number(r.expected) : null]));
}

export async function vehiclePnl(start: string, end: string) {
  const [vs, inc, exp, hit] = await Promise.all([
    db.select().from(vehicles).where(ne(vehicles.status, "DISPOSED")).orderBy(vehicles.code),
    incomeByVehicle(start, end),
    expensesByVehicle(start, end),
    targetHitByVehicle(start, end),
  ]);
  return vs.map((v) => {
    const i = inc.get(v.id) ?? { target: 0, jobs: 0 };
    const income = i.target + i.jobs;
    const cost = exp.get(v.id) ?? 0;
    return { vehicle: v, targetIncome: i.target, jobIncome: i.jobs, income, cost, profit: income - cost, hit: hit.get(v.id) ?? null };
  });
}

/** Daily collected vs expected for a date range (for charts). */
export async function dailySeries(start: string, end: string) {
  const rows = await db
    .select({
      date: dailyRecords.date,
      expected: sql<number>`coalesce(sum(case when ${dailyRecords.status} in ('PAID','SHORT','PENDING') then ${dailyRecords.target} else 0 end),0)::int`,
      paid: sql<number>`coalesce(sum(${dailyRecords.amountPaid}),0)::int`,
    })
    .from(dailyRecords)
    .where(and(gte(dailyRecords.date, start), lte(dailyRecords.date, end)))
    .groupBy(dailyRecords.date)
    .orderBy(dailyRecords.date);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: { date: string; expected: number; paid: number }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const r = byDate.get(d);
    out.push({ date: d, expected: Number(r?.expected ?? 0), paid: Number(r?.paid ?? 0) });
  }
  return out;
}

/* ---------------- Driver performance ---------------- */

export type ScoreParts = { target: number; complaints: number; documents: number; total: number; grade: "A" | "B" | "C" | "D" };

/**
 * Driver score out of 100:
 *  - Target compliance (60): share of expected days where the full target was paid.
 *  - Complaints (25): starts at 25; −10 per HIGH, −5 per MEDIUM, −2 per LOW in the period.
 *  - Documents (15): 15 if driving & PSV licences on file are valid, 0 if any expired.
 */
export async function driverScores(start: string, end: string) {
  const ds = await db.select().from(drivers).where(ne(drivers.status, "LEFT"));
  const days = await db
    .select({
      driverId: dailyRecords.driverId,
      expected: sql<number>`count(*) filter (where ${dailyRecords.status} in ('PAID','SHORT'))::int`,
      full: sql<number>`count(*) filter (where ${dailyRecords.status} = 'PAID')::int`,
      short: sql<number>`count(*) filter (where ${dailyRecords.status} = 'SHORT')::int`,
    })
    .from(dailyRecords)
    .where(and(gte(dailyRecords.date, start), lte(dailyRecords.date, end)))
    .groupBy(dailyRecords.driverId);
  const comp = await db
    .select({ driverId: complaints.driverId, severity: complaints.severity, n: sql<number>`count(*)::int` })
    .from(complaints)
    .where(and(gte(complaints.date, start), lte(complaints.date, end)))
    .groupBy(complaints.driverId, complaints.severity);
  const docs = await db
    .select({ driverId: complianceDocs.driverId, expiry: complianceDocs.expiryDate })
    .from(complianceDocs)
    .where(inArray(complianceDocs.type, ["DRIVING_LICENCE", "PSV_LICENCE"]));
  const t = today();
  return ds.map((d) => {
    const dd = days.find((x) => x.driverId === d.id);
    const expected = Number(dd?.expected ?? 0);
    const target = expected ? Math.round((Number(dd?.full ?? 0) / expected) * 60) : 60;
    let c = 25;
    let complaintCount = 0;
    for (const r of comp.filter((x) => x.driverId === d.id)) {
      const n = Number(r.n);
      complaintCount += n;
      c -= n * (r.severity === "HIGH" ? 10 : r.severity === "MEDIUM" ? 5 : 2);
    }
    c = Math.max(0, c);
    const myDocs = docs.filter((x) => x.driverId === d.id);
    const documents = myDocs.some((x) => x.expiry < t) ? 0 : 15;
    const total = target + c + documents;
    const grade = total >= 85 ? "A" : total >= 70 ? "B" : total >= 55 ? "C" : "D";
    return {
      driver: d,
      expectedDays: expected,
      shortDays: Number(dd?.short ?? 0),
      complaintCount,
      score: { target, complaints: c, documents, total, grade } as ScoreParts,
    };
  }).sort((a, b) => b.score.total - a.score.total);
}

/* ---------------- Maintenance & compliance ---------------- */

export type DueState = "OVERDUE" | "DUE_SOON" | "OK";

export function scheduleStatus(
  s: { intervalKm: number | null; intervalDays: number | null; lastDoneKm: number | null; lastDoneDate: string | null },
  odometer: number,
  t = today(),
) {
  const dueKm = s.intervalKm != null ? (s.lastDoneKm ?? 0) + s.intervalKm : null;
  const dueDate = s.intervalDays != null && s.lastDoneDate ? addDays(s.lastDoneDate, s.intervalDays) : null;
  const kmLeft = dueKm != null ? dueKm - odometer : null;
  const daysLeft = dueDate ? daysBetween(t, dueDate) : null;
  let state: DueState = "OK";
  if ((kmLeft != null && kmLeft < 0) || (daysLeft != null && daysLeft < 0)) state = "OVERDUE";
  else if ((kmLeft != null && kmLeft <= 1000) || (daysLeft != null && daysLeft <= 7)) state = "DUE_SOON";
  return { dueKm, dueDate, kmLeft, daysLeft, state };
}

export function docState(expiry: string, warnDays: number, t = today()) {
  const daysLeft = daysBetween(t, expiry);
  const state: DueState = daysLeft < 0 ? "OVERDUE" : daysLeft <= warnDays ? "DUE_SOON" : "OK";
  return { daysLeft, state };
}
