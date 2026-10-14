import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { staff, payrollRuns, payslips, drivers } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtMonth, label, mwk, thisMonth, today } from "@/lib/format";
import { AddPanel, Badge, Card, Empty, Field, Notice, PageHeader, TableWrap, statusTone } from "@/components/ui";
import { createStaff, prepareRun, updateStaff } from "./actions";

export const metadata = { title: "Payroll & HR" };

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("FINANCE");
  const sp = await searchParams;
  const [people, runs, ds, s] = await Promise.all([
    db.select().from(staff).orderBy(desc(staff.active), asc(staff.fullName)),
    db.select({
      run: payrollRuns,
      gross: sql<number>`coalesce(sum(${payslips.gross}),0)::int`,
      net: sql<number>`coalesce(sum(${payslips.net}),0)::int`,
      n: sql<number>`count(${payslips.id})::int`,
    }).from(payrollRuns).leftJoin(payslips, eq(payslips.runId, payrollRuns.id)).groupBy(payrollRuns.id).orderBy(desc(payrollRuns.month)),
    db.select().from(drivers).orderBy(asc(drivers.fullName)),
    getSettings(),
  ]);
  const monthlyBasic = people.filter((p) => p.active).reduce((a, p) => a + p.basicSalary, 0);

  return (
    <>
      <PageHeader title="Payroll & HR" subtitle={`${people.filter((p) => p.active).length} active staff · basic pay ${mwk(monthlyBasic)} a month`}
        actions={
          <form action={prepareRun} className="flex items-center gap-2">
            <label className="sr-only" htmlFor="m">Month</label>
            <input id="m" className="input !w-auto" type="month" name="month" defaultValue={thisMonth()} />
            <button className="btn btn-primary">Prepare payroll</button>
          </form>
        } />
      {sp.error === "staff" ? <Notice tone="bad">Enter a name and a basic salary.</Notice> : null}
      <Notice tone="info">
        PAYE uses the bands in Settings ({s.payeBands.map((b) => `${Math.round(b.rate * 100)}%${b.upTo ? ` to ${b.upTo.toLocaleString()}` : " above"}`).join(", ")}) and pension at {Math.round(s.pensionEmployeeRate * 100)}% employee / {Math.round(s.pensionEmployerRate * 100)}% employer of basic pay. Confirm these with MRA before your first run.
      </Notice>

      <Card title="Payroll runs" pad={false}>
        {runs.length === 0 ? <Empty title="No payroll yet">Choose a month above and prepare the first run.</Empty> : (
          <TableWrap><table className="data">
            <thead><tr><th>Month</th><th>Staff</th><th>Gross</th><th>Net pay</th><th>Status</th><th>Approved</th></tr></thead>
            <tbody>{runs.map(({ run, gross, net, n }) => (
              <tr key={run.id}>
                <td><Link href={`/payroll/${run.month}`} className="font-bold text-brand-700">{fmtMonth(run.month)}</Link></td>
                <td className="num">{n}</td><td className="num">{mwk(gross)}</td><td className="num font-semibold">{mwk(net)}</td>
                <td><Badge tone={statusTone(run.status)}>{label(run.status)}</Badge></td>
                <td>{run.approvedAt ? fmtDate(run.approvedAt.toISOString()) : "—"}</td>
              </tr>
            ))}</tbody>
          </table></TableWrap>
        )}
      </Card>

      <AddPanel title="Add staff member" open={sp.error === "staff"}>
        <form action={createStaff} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Full name"><input className="input" name="fullName" required /></Field>
          <Field label="Job title"><input className="input" name="jobTitle" placeholder="e.g. Mechanic" /></Field>
          <Field label="Department"><select className="input" name="department"><option>Operations</option><option>Finance</option><option>Management</option><option>Garage</option><option>Drivers</option></select></Field>
          <Field label="Basic salary (MWK / month)"><input className="input num" name="basicSalary" inputMode="numeric" required /></Field>
          <Field label="Phone"><input className="input" name="phone" /></Field>
          <Field label="Bank"><input className="input" name="bankName" /></Field>
          <Field label="Account number"><input className="input" name="bankAccount" /></Field>
          <Field label="Start date"><input className="input" type="date" name="startDate" defaultValue={today()} /></Field>
          <Field label="Is this a driver?" hint="Lets payroll deduct target shortfalls">
            <select className="input" name="driverId" defaultValue=""><option value="">No</option>{ds.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}</select>
          </Field>
          <div className="flex items-end sm:col-span-2 lg:col-span-3"><button className="btn btn-primary">Add staff</button></div>
        </form>
      </AddPanel>

      <Card title="Staff" pad={false}>
        {people.length === 0 ? <Empty title="No staff yet" /> : (
          <TableWrap><table className="data">
            <thead><tr><th>Name</th><th>Department</th><th>Started</th><th>Bank</th><th>Job title · basic salary · active</th></tr></thead>
            <tbody>{people.map((p) => (
              <tr key={p.id} className={p.active ? "" : "opacity-60"}>
                <td className="font-semibold">{p.fullName}{p.driverId ? <span className="ml-2"><Badge tone="info">Driver</Badge></span> : null}</td>
                <td>{p.department}</td>
                <td>{fmtDate(p.startDate)}</td>
                <td className="text-muted">{p.bankName ? `${p.bankName} ${p.bankAccount ?? ""}` : "—"}</td>
                <td>
                  <form action={updateStaff.bind(null, p.id)} className="flex items-center gap-2">
                    <input className="input !min-h-[34px] !w-[150px] !py-1" name="jobTitle" defaultValue={p.jobTitle} aria-label="Job title" />
                    <input className="input num !min-h-[34px] !w-[120px] !py-1" name="basicSalary" defaultValue={p.basicSalary} inputMode="numeric" aria-label="Basic salary" />
                    <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" name="active" defaultChecked={p.active} /> Active</label>
                    <button className="btn btn-ghost btn-sm">Save</button>
                  </form>
                </td>
              </tr>
            ))}</tbody>
          </table></TableWrap>
        )}
      </Card>
    </>
  );
}
