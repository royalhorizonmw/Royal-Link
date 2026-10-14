import Link from "next/link";
import { and, asc, desc, eq, gte, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { haulageJobs, vehicles, drivers } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { fmtDate, label, monthRange, mwk, thisMonth, today } from "@/lib/format";
import { AddPanel, Badge, Card, Empty, Field, Notice, PageHeader, Stat, TableWrap, statusTone } from "@/components/ui";
import { MonthPicker } from "@/components/month-picker";
import { createJob } from "./actions";

export const metadata = { title: "Haulage jobs" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ month?: string; error?: string }> }) {
  await requireRole("OPERATIONS", "FINANCE");
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : thisMonth();
  const { start, end } = monthRange(month);
  const [vs, ds, jobs, unpaid] = await Promise.all([
    db.select().from(vehicles).where(ne(vehicles.earningMode, "DAILY_TARGET")).orderBy(asc(vehicles.code)),
    db.select().from(drivers).where(eq(drivers.status, "ACTIVE")).orderBy(asc(drivers.fullName)),
    db.select().from(haulageJobs).where(and(gte(haulageJobs.date, start), lte(haulageJobs.date, end))).orderBy(desc(haulageJobs.date)),
    db.select().from(haulageJobs).where(eq(haulageJobs.status, "INVOICED")),
  ]);
  const allVs = await db.select().from(vehicles);
  const earned = jobs.filter((j) => ["DELIVERED", "INVOICED", "PAID"].includes(j.status)).reduce((s, j) => s + j.rate, 0);
  const collected = jobs.reduce((s, j) => s + j.amountPaid, 0);
  const owed = unpaid.reduce((s, j) => s + (j.rate - j.amountPaid), 0);

  return (
    <>
      <PageHeader title="Haulage jobs" subtitle="Lorry trips with digital waybills and invoices" actions={<MonthPicker month={month} base="/jobs" />} />
      {sp.error ? <Notice tone="bad">Choose a vehicle, enter the client and a rate above zero.</Notice> : null}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Jobs this month" value={String(jobs.length)} note={`${jobs.filter((j) => j.status === "IN_TRANSIT").length} on the road now`} />
        <Stat label="Earned (delivered)" value={mwk(earned)} tone="brand" />
        <Stat label="Collected" value={mwk(collected)} tone="good" />
        <Stat label="Clients owe (all months)" value={mwk(owed)} tone={owed ? "bad" : "ink"} note={`${unpaid.length} invoices open`} />
      </div>

      <AddPanel title="New job / waybill" open={!!sp.error}>
        {vs.length === 0 ? <p className="text-[14px] text-muted">Set a lorry to &quot;Per job&quot; or &quot;Daily target + jobs&quot; in Fleet to log jobs.</p> : (
          <form action={createJob} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date"><input className="input" type="date" name="date" defaultValue={today()} /></Field>
            <Field label="Vehicle"><select className="input" name="vehicleId" required>{vs.map((v) => <option key={v.id} value={v.id}>{v.code} · {v.regNumber}</option>)}</select></Field>
            <Field label="Driver"><select className="input" name="driverId" defaultValue=""><option value="">—</option>{ds.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}</select></Field>
            <Field label="Agreed rate (MWK)"><input className="input num" name="rate" inputMode="numeric" required /></Field>
            <Field label="Client"><input className="input" name="client" required /></Field>
            <Field label="Client phone"><input className="input" name="clientPhone" inputMode="tel" /></Field>
            <Field label="Cargo"><input className="input" name="cargo" placeholder="e.g. 30 bags cement" /></Field>
            <Field label="Weight (tonnes)"><input className="input num" name="weightTons" inputMode="decimal" /></Field>
            <Field label="From"><input className="input" name="origin" required /></Field>
            <Field label="To"><input className="input" name="destination" required /></Field>
            <Field label="Notes" className="sm:col-span-2"><input className="input" name="notes" /></Field>
            <div className="sm:col-span-2 lg:col-span-4"><button className="btn btn-primary">Create waybill</button></div>
          </form>
        )}
      </AddPanel>

      <Card pad={false}>
        {jobs.length === 0 ? <Empty title="No jobs this month" /> : (
          <TableWrap><table className="data">
            <thead><tr><th>Waybill</th><th>Date</th><th>Vehicle</th><th>Client</th><th>Route</th><th>Cargo</th><th>Rate</th><th>Paid</th><th>Status</th></tr></thead>
            <tbody>{jobs.map((j) => (
              <tr key={j.id}>
                <td><Link href={`/jobs/${j.id}`} className="font-bold text-brand-700">{j.waybillNo}</Link></td>
                <td>{fmtDate(j.date)}</td>
                <td>{allVs.find((v) => v.id === j.vehicleId)?.code}</td>
                <td>{j.client}</td>
                <td>{j.origin} → {j.destination}</td>
                <td className="max-w-[200px] truncate text-muted">{j.cargo}</td>
                <td className="num">{mwk(j.rate)}</td>
                <td className="num">{mwk(j.amountPaid)}</td>
                <td><Badge tone={statusTone(j.status)}>{label(j.status)}</Badge></td>
              </tr>
            ))}</tbody>
          </table></TableWrap>
        )}
      </Card>
    </>
  );
}
