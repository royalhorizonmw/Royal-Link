import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { drivers, vehicles, dailyRecords, driverAdjustments, complaints, users, assignments } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { driverBalances, driverScores } from "@/lib/calc";
import { fmtDate, label, monthRange, mwk, thisMonth, today } from "@/lib/format";
import { AddPanel, Badge, Card, Empty, Field, Notice, PageHeader, Stat, TableWrap, statusTone } from "@/components/ui";
import { assignVehicle, createDriverLogin, recordAdjustment, updateDriver } from "../actions";

const ERRORS: Record<string, string> = {
  waiver: "Only a manager can write off (waive) a balance.",
  amount: "Enter an amount above zero.",
  login: "Enter an email and a password of at least 8 characters.",
  email: "That email already has an account.",
};

export default async function DriverPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole("OPERATIONS", "FINANCE");
  const { id } = await params;
  const sp = await searchParams;
  const d = await db.query.drivers.findFirst({ where: eq(drivers.id, id) });
  if (!d) notFound();
  const { start, end } = monthRange(thisMonth());
  const [vs, days, adjs, comps, login, balances, scores, hist] = await Promise.all([
    db.select().from(vehicles).orderBy(asc(vehicles.code)),
    db.select().from(dailyRecords).where(eq(dailyRecords.driverId, id)).orderBy(desc(dailyRecords.date)).limit(20),
    db.select().from(driverAdjustments).where(eq(driverAdjustments.driverId, id)).orderBy(desc(driverAdjustments.date)).limit(20),
    db.select().from(complaints).where(eq(complaints.driverId, id)).orderBy(desc(complaints.date)).limit(10),
    db.query.users.findFirst({ where: eq(users.driverId, id) }),
    driverBalances([id]),
    driverScores(start, end),
    db.select().from(assignments).where(eq(assignments.driverId, id)).orderBy(desc(assignments.startDate)).limit(10),
  ]);
  const v = vs.find((x) => x.id === d.vehicleId);
  const bal = balances.get(id) ?? 0;
  const sc = scores.find((x) => x.driver.id === id);
  const canOps = user.role !== "FINANCE";

  return (
    <>
      <PageHeader title={d.fullName} subtitle={<><Link href="/drivers" className="text-brand-700">Drivers</Link> · {d.phone} · started {fmtDate(d.startDate)}</>} />
      {sp.saved ? <Notice tone="good">{sp.saved === "login" ? "Driver login created. Share the email and password with the driver." : "Saved."}</Notice> : null}
      {sp.error ? <Notice tone="bad">{ERRORS[sp.error] ?? "Something went wrong."}</Notice> : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Balance owed" value={bal > 0 ? mwk(bal) : "Nothing owed"} tone={bal > 0 ? "bad" : "good"} />
        <Stat label="Score this month" value={sc ? `${sc.score.total} / 100` : "—"} note={sc ? `Grade ${sc.score.grade} · targets ${sc.score.target}/60 · complaints ${sc.score.complaints}/25 · licences ${sc.score.documents}/15` : undefined} tone="brand" />
        <Stat label="Vehicle" value={v ? v.code : "—"} note={v ? `${v.regNumber} · target ${mwk(v.dailyTarget)}` : "Not assigned"} />
        <Stat label="Status" value={<Badge tone={statusTone(d.status)}>{label(d.status)}</Badge>} note={d.starterFuelGiven ? "Starter fuel given" : undefined} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Daily target history" pad={false}>
          {days.length === 0 ? <Empty title="No records yet" /> : (
            <TableWrap><table className="data">
              <thead><tr><th>Date</th><th>Vehicle</th><th>Target</th><th>Paid</th><th>Status</th></tr></thead>
              <tbody>{days.map((r) => (
                <tr key={r.id}><td>{fmtDate(r.date, { weekday: "short", day: "numeric", month: "short" })}</td><td>{vs.find((x) => x.id === r.vehicleId)?.code}</td><td className="num">{mwk(r.target)}</td><td className="num font-semibold">{mwk(r.amountPaid)}</td><td><Badge tone={statusTone(r.status)}>{label(r.status)}</Badge></td></tr>
              ))}</tbody>
            </table></TableWrap>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          <Card title="Balance payments & write-offs">
            <form action={recordAdjustment.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
              <Field label="Type">
                <select className="input" name="type"><option value="RECOVERY">Payment towards balance</option>{user.role === "MANAGER" ? <option value="WAIVER">Write-off (manager)</option> : null}</select>
              </Field>
              <Field label="Amount (MWK)"><input className="input num" name="amount" inputMode="numeric" required /></Field>
              <Field label="Method"><select className="input" name="method"><option value="CASH">Cash</option><option value="AIRTEL_MONEY">Airtel Money</option><option value="TNM_MPAMBA">TNM Mpamba</option><option value="BANK">Bank</option></select></Field>
              <Field label="Date"><input className="input" type="date" name="date" defaultValue={today()} /></Field>
              <Field label="Note" className="sm:col-span-2"><input className="input" name="note" /></Field>
              <div className="sm:col-span-2"><button className="btn btn-primary">Record</button></div>
            </form>
            {adjs.length ? (
              <ul className="mt-4 divide-y divide-slate-100 border-t border-line">
                {adjs.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2 text-[14px]">
                    <span>{fmtDate(a.date)} · {a.type === "RECOVERY" ? `Paid (${label(a.method)})` : "Written off"}{a.note ? ` · ${a.note}` : ""}</span>
                    <span className="num font-semibold text-good">{mwk(a.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          {canOps ? (
            <Card title="Vehicle assignment">
              <form action={assignVehicle.bind(null, id)} className="flex flex-wrap items-end gap-3">
                <Field label="Vehicle" className="min-w-[200px] flex-1">
                  <select className="input" name="vehicleId" defaultValue={d.vehicleId ?? ""}>
                    <option value="">None</option>
                    {vs.filter((x) => x.status !== "DISPOSED").map((x) => <option key={x.id} value={x.id}>{x.code} · {x.regNumber}</option>)}
                  </select>
                </Field>
                <button className="btn btn-ghost">Assign</button>
              </form>
              {hist.length ? <div className="mt-3 text-[13px] text-muted">History: {hist.map((h) => `${vs.find((x) => x.id === h.vehicleId)?.code} (${fmtDate(h.startDate)}${h.endDate ? ` – ${fmtDate(h.endDate)}` : " – now"})`).join(", ")}</div> : null}
            </Card>
          ) : null}
        </div>

        <Card title="Complaints" pad={false}>
          {comps.length === 0 ? <Empty title="No complaints" /> : (
            <ul className="divide-y divide-slate-100">
              {comps.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div><div className="text-[14px] font-semibold">{c.description}</div><div className="text-[12px] text-muted">{fmtDate(c.date)} · {label(c.source)}</div></div>
                  <div className="flex gap-2"><Badge tone={statusTone(c.severity)}>{label(c.severity)}</Badge><Badge tone={statusTone(c.status)}>{label(c.status)}</Badge></div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Phone app login">
          {login ? (
            <p className="text-[14px]">This driver signs in as <span className="font-semibold">{login.email}</span> to see their target, balance, score and payslips.</p>
          ) : canOps ? (
            <form action={createDriverLogin.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
              <Field label="Email (or phone@royallink)"><input className="input" name="email" type="email" required /></Field>
              <Field label="Temporary password"><input className="input" name="password" type="text" minLength={8} required /></Field>
              <div className="sm:col-span-2"><button className="btn btn-primary">Create login</button></div>
            </form>
          ) : <p className="text-[14px] text-muted">No login yet.</p>}
        </Card>
      </div>

      {canOps ? (
        <AddPanel title="Edit driver details">
          <form action={updateDriver.bind(null, id)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Full name"><input className="input" name="fullName" defaultValue={d.fullName} required /></Field>
            <Field label="Phone"><input className="input" name="phone" defaultValue={d.phone} required /></Field>
            <Field label="National ID"><input className="input" name="nationalId" defaultValue={d.nationalId ?? ""} /></Field>
            <Field label="Start date"><input className="input" type="date" name="startDate" defaultValue={d.startDate} /></Field>
            <Field label="Driving licence no."><input className="input" name="licenceNumber" defaultValue={d.licenceNumber ?? ""} /></Field>
            <Field label="Guarantor name"><input className="input" name="guarantorName" defaultValue={d.guarantorName ?? ""} /></Field>
            <Field label="Guarantor phone"><input className="input" name="guarantorPhone" defaultValue={d.guarantorPhone ?? ""} /></Field>
            <Field label="Status">
              <select className="input" name="status" defaultValue={d.status}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="LEFT">Left the company</option></select>
            </Field>
            <Field label="Address" className="sm:col-span-2"><input className="input" name="address" defaultValue={d.address ?? ""} /></Field>
            <Field label="Notes" className="sm:col-span-2"><input className="input" name="notes" defaultValue={d.notes ?? ""} /></Field>
            <div className="sm:col-span-2 lg:col-span-4"><button className="btn btn-primary">Save changes</button></div>
          </form>
        </AddPanel>
      ) : null}
    </>
  );
}
