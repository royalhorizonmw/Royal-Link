import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { vehicles, drivers, dailyRecords, expenses, complianceDocs, serviceSchedules, haulageJobs } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { docState, scheduleStatus, vehiclePnl } from "@/lib/calc";
import { getSettings } from "@/lib/settings";
import { fmtDate, label, monthRange, mwk, thisMonth, periodLabel } from "@/lib/format";
import { AddPanel, Badge, Bar, Card, Empty, Notice, PageHeader, Stat, TableWrap, statusTone } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { setVehicleStatus, updateOdometer, updateVehicle } from "../actions";

export default async function VehiclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireRole("OPERATIONS", "FINANCE");
  const { id } = await params;
  const sp = await searchParams;
  const v = await db.query.vehicles.findFirst({ where: eq(vehicles.id, id) });
  if (!v) notFound();
  const { start, end } = monthRange(thisMonth());
  const [pnlAll, drv, days, exps, docs, scheds, jobs, settings] = await Promise.all([
    vehiclePnl(start, end),
    db.query.drivers.findFirst({ where: and(eq(drivers.vehicleId, id), eq(drivers.status, "ACTIVE")) }),
    db.select().from(dailyRecords).where(eq(dailyRecords.vehicleId, id)).orderBy(desc(dailyRecords.date)).limit(14),
    db.select().from(expenses).where(eq(expenses.vehicleId, id)).orderBy(desc(expenses.date)).limit(12),
    db.select().from(complianceDocs).where(eq(complianceDocs.vehicleId, id)).orderBy(complianceDocs.expiryDate),
    db.select().from(serviceSchedules).where(and(eq(serviceSchedules.vehicleId, id), eq(serviceSchedules.active, true))),
    db.select().from(haulageJobs).where(eq(haulageJobs.vehicleId, id)).orderBy(desc(haulageJobs.date)).limit(8),
    getSettings(),
  ]);
  const p = pnlAll.find((x) => x.vehicle.id === id);
  const canEdit = user.role !== "FINANCE";

  return (
    <>
      <PageHeader
        title={`${v.code} · ${v.regNumber}`}
        subtitle={<><Link href="/vehicles" className="text-brand-700">Fleet</Link> · {label(v.type)} · {label(v.earningMode)}</>}
        actions={canEdit ? (
          <>
            {v.status !== "IN_GARAGE" ? (
              <form action={setVehicleStatus.bind(null, id, "IN_GARAGE")}><button className="btn btn-ghost">Send to garage</button></form>
            ) : (
              <form action={setVehicleStatus.bind(null, id, "ACTIVE")}><button className="btn btn-primary">Back on the road</button></form>
            )}
          </>
        ) : null}
      />
      {sp.saved ? <Notice tone="good">Vehicle saved.</Notice> : null}
      {v.status === "IN_GARAGE" ? <Notice tone="warn">This vehicle is in the garage. Its daily target is paused, so the driver is not charged a shortfall.</Notice> : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Status" value={<Badge tone={statusTone(v.status)}>{label(v.status)}</Badge>} note={drv ? `Driver: ${drv.fullName}` : "No driver assigned"} />
        <Stat label="Income this month" value={mwk(p?.income)} note={p?.jobIncome ? `${mwk(p.jobIncome)} from jobs` : undefined} />
        <Stat label="Costs this month" value={mwk(p?.cost)} />
        <Stat label="Profit this month" value={mwk(p?.profit)} tone={(p?.profit ?? 0) >= 0 ? "good" : "bad"} />
        <Stat label="Target hit" value={p?.hit == null ? "—" : `${Math.round(p.hit * 100)}%`} note={`Target ${mwk(v.dailyTarget)} ${periodLabel(v.targetPeriod)}`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Last 14 days" pad={false} action={<Link href="/ledger" className="text-[13px] font-bold text-brand-700">Open ledger</Link>}>
          {days.length === 0 ? <Empty title="No daily records yet" /> : (
            <TableWrap><table className="data">
              <thead><tr><th>Date</th><th>Target</th><th>Paid</th><th>Status</th><th>Method</th></tr></thead>
              <tbody>{days.map((d) => (
                <tr key={d.id}><td>{fmtDate(d.date, { weekday: "short", day: "numeric", month: "short" })}</td><td className="num">{mwk(d.target)}</td><td className="num font-semibold">{mwk(d.amountPaid)}</td><td><Badge tone={statusTone(d.status)}>{label(d.status)}</Badge></td><td className="text-muted">{label(d.method)}</td></tr>
              ))}</tbody>
            </table></TableWrap>
          )}
        </Card>

        <Card title="Maintenance" action={canEdit ? (
          <form action={updateOdometer.bind(null, id)} className="flex items-center gap-2">
            <label className="sr-only" htmlFor="odo">Odometer</label>
            <input id="odo" className="input num !min-h-[34px] !w-32 !py-1" name="odometer" inputMode="numeric" placeholder={`${v.odometer.toLocaleString()} km`} />
            <button className="btn btn-ghost btn-sm">Update km</button>
          </form>
        ) : null}>
          <div className="mb-3 text-[13px] text-muted">Odometer: <span className="num font-semibold text-ink">{v.odometer.toLocaleString()} km</span></div>
          {scheds.length === 0 ? <div className="text-[14px] text-muted">No service schedule.</div> : (
            <ul className="divide-y divide-slate-100">
              {scheds.map((s) => {
                const st = scheduleStatus(s, v.odometer);
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div><div className="text-[14px] font-semibold">{s.title}</div>
                      <div className="text-[12px] text-muted">{st.dueKm != null ? `Due at ${st.dueKm.toLocaleString()} km` : ""}{st.dueKm != null && st.dueDate ? " or " : ""}{st.dueDate ? fmtDate(st.dueDate) : ""}</div></div>
                    <Badge tone={statusTone(st.state)}>{st.state === "OVERDUE" ? "Overdue" : st.state === "DUE_SOON" ? "Due soon" : "On track"}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/maintenance" className="mt-3 inline-block text-[13px] font-bold text-brand-700">Work orders & schedules →</Link>
        </Card>

        <Card title="Recent expenses" pad={false} action={<Link href="/expenses" className="text-[13px] font-bold text-brand-700">All expenses</Link>}>
          {exps.length === 0 ? <Empty title="No expenses recorded" /> : (
            <TableWrap><table className="data">
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead>
              <tbody>{exps.map((e) => (
                <tr key={e.id}><td>{fmtDate(e.date)}</td><td>{label(e.category)}</td><td className="max-w-[260px] truncate">{e.description}</td><td className="num font-semibold">{mwk(e.amount)}</td></tr>
              ))}</tbody>
            </table></TableWrap>
          )}
        </Card>

        <Card title="Documents" pad={false} action={<Link href="/compliance" className="text-[13px] font-bold text-brand-700">Manage</Link>}>
          {docs.length === 0 ? <Empty title="No documents on file">Add the COF, insurance and road licence in Compliance.</Empty> : (
            <TableWrap><table className="data">
              <thead><tr><th>Document</th><th>Number</th><th>Expires</th><th>Status</th></tr></thead>
              <tbody>{docs.map((d) => {
                const st = docState(d.expiryDate, settings.complianceWarnDays);
                return <tr key={d.id}><td className="font-semibold">{label(d.type)}</td><td>{d.number ?? "—"}</td><td>{fmtDate(d.expiryDate)}</td><td><Badge tone={statusTone(st.state)}>{st.daysLeft < 0 ? `Expired ${-st.daysLeft} d ago` : `${st.daysLeft} days left`}</Badge></td></tr>;
              })}</tbody>
            </table></TableWrap>
          )}
        </Card>

        {v.earningMode !== "DAILY_TARGET" ? (
          <Card title="Haulage jobs" pad={false} action={<Link href="/jobs" className="text-[13px] font-bold text-brand-700">All jobs</Link>}>
            {jobs.length === 0 ? <Empty title="No jobs yet" /> : (
              <TableWrap><table className="data">
                <thead><tr><th>Waybill</th><th>Date</th><th>Client</th><th>Route</th><th>Rate</th><th>Status</th></tr></thead>
                <tbody>{jobs.map((j) => (
                  <tr key={j.id}><td className="font-semibold">{j.waybillNo}</td><td>{fmtDate(j.date)}</td><td>{j.client}</td><td>{j.origin} → {j.destination}</td><td className="num">{mwk(j.rate)}</td><td><Badge tone={statusTone(j.status)}>{label(j.status)}</Badge></td></tr>
                ))}</tbody>
              </table></TableWrap>
            )}
          </Card>
        ) : null}

        <Card title="Target hit this month">
          <Bar value={p?.hit ?? null} />
          <p className="mt-3 text-[13px] text-muted">Share of the expected daily target actually paid on working days (excused, rest and garage days are left out).</p>
        </Card>
      </div>

      {canEdit ? <AddPanel title="Edit vehicle details"><VehicleForm action={updateVehicle.bind(null, id)} v={v} submit="Save changes" withStatus /></AddPanel> : null}
    </>
  );
}
