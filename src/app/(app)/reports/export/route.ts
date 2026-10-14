import { NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { dailyRecords, vehicles, drivers, expenses } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { driverScores, vehiclePnl } from "@/lib/calc";
import { companyPnl } from "@/lib/reports";
import { label, monthRange, thisMonth } from "@/lib/format";

function csv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map((c) => {
    const s = c == null ? "" : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !["MANAGER", "FINANCE"].includes(session.role)) return new NextResponse("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "pnl";
  const m = url.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(m) ? m : thisMonth();
  const { start, end } = monthRange(month);
  let rows: (string | number | null)[][] = [];

  if (type === "pnl") {
    const p = await companyPnl(month);
    rows = [["Line", "MWK"], ["Daily target income", p.targetIncome], ["Haulage job income", p.jobIncome], ["Total income", p.income],
      ...p.costs.map(([c, v]) => [label(c), -v]), ["Total costs", -p.totalCost], ["Net profit", p.profit]];
  } else if (type === "vehicles") {
    const vp = await vehiclePnl(start, end);
    rows = [["Vehicle", "Registration", "Target income", "Job income", "Costs", "Profit", "Target hit %"],
      ...vp.map((r) => [r.vehicle.code, r.vehicle.regNumber, r.targetIncome, r.jobIncome, r.cost, r.profit, r.hit == null ? null : Math.round(r.hit * 100)])];
  } else if (type === "drivers") {
    const sc = await driverScores(start, end);
    rows = [["Driver", "Score", "Grade", "Targets", "Complaints", "Licences", "Working days", "Short days", "Complaint count"],
      ...sc.map((s) => [s.driver.fullName, s.score.total, s.score.grade, s.score.target, s.score.complaints, s.score.documents, s.expectedDays, s.shortDays, s.complaintCount])];
  } else if (type === "ledger") {
    const r = await db.select({ r: dailyRecords, v: vehicles, d: drivers }).from(dailyRecords)
      .innerJoin(vehicles, eq(vehicles.id, dailyRecords.vehicleId)).leftJoin(drivers, eq(drivers.id, dailyRecords.driverId))
      .where(and(gte(dailyRecords.date, start), lte(dailyRecords.date, end))).orderBy(asc(dailyRecords.date), asc(vehicles.code));
    rows = [["Date", "Vehicle", "Driver", "Target", "Paid", "Status", "Method", "Reference", "Excuse reason"],
      ...r.map(({ r, v, d }) => [r.date, v.code, d?.fullName ?? "", r.target, r.amountPaid, label(r.status), label(r.method), r.reference, r.excuseReason])];
  } else if (type === "expenses") {
    const vs = await db.select().from(vehicles);
    const e = await db.select().from(expenses).where(and(gte(expenses.date, start), lte(expenses.date, end))).orderBy(asc(expenses.date));
    rows = [["Date", "Vehicle", "Category", "Description", "Supplier", "Amount"],
      ...e.map((x) => [x.date, vs.find((v) => v.id === x.vehicleId)?.code ?? "Company", label(x.category), x.description, x.supplier, x.amount])];
  }
  return new NextResponse(csv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="royal-link-${type}-${month}.csv"` },
  });
}
