import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { serviceSchedules, vehicles, workOrders } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { scheduleStatus } from "@/lib/calc";
import { daysBetween, fmtDate, label, today } from "@/lib/format";
import { AddPanel, Badge, Card, Empty, Field, Notice, PageHeader, Stat, TableWrap, statusTone } from "@/components/ui";
import { closeWorkOrder, createSchedule, createWorkOrder, deleteSchedule, markScheduleDone, planService, startWorkOrder } from "./actions";

export const metadata = { title: "Maintenance" };

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("OPERATIONS");
  const sp = await searchParams;
  const [vs, scheds, open, recent] = await Promise.all([
    db.select().from(vehicles).orderBy(asc(vehicles.code)),
    db.select().from(serviceSchedules).where(eq(serviceSchedules.active, true)),
    db.select().from(workOrders).where(inArray(workOrders.status, ["OPEN", "IN_PROGRESS"])).orderBy(asc(workOrders.openedAt)),
    db.select().from(workOrders).where(eq(workOrders.status, "DONE")).orderBy(desc(workOrders.closedAt)).limit(10),
  ]);
  const vmap = new Map(vs.map((v) => [v.id, v]));
  const rows = scheds
    .map((s) => ({ s, v: vmap.get(s.vehicleId)!, st: scheduleStatus(s, vmap.get(s.vehicleId)?.odometer ?? 0) }))
    .filter((x) => x.v && x.v.status !== "DISPOSED")
    .sort((a, b) => ({ OVERDUE: 0, DUE_SOON: 1, OK: 2 }[a.st.state] - { OVERDUE: 0, DUE_SOON: 1, OK: 2 }[b.st.state]));
  const active = vs.filter((v) => v.status !== "DISPOSED");
  const available = active.filter((v) => v.status === "ACTIVE").length;

  return (
    <>
      <PageHeader title="Maintenance" subtitle="Service schedules by km or date, and garage work orders" />
      {sp.error === "plan" ? <Notice tone="bad">Choose a vehicle and a date from today onwards.</Notice> : sp.error ? <Notice tone="bad">Choose a vehicle and give a title.</Notice> : null}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Available today" value={`${available} of ${active.length}`} tone="good" note={active.length ? `${Math.round((available / active.length) * 100)}% fleet availability` : undefined} />
        <Stat label="In the garage" value={String(active.filter((v) => v.status === "IN_GARAGE").length)} tone="warn" />
        <Stat label="Services overdue" value={String(rows.filter((r) => r.st.state === "OVERDUE").length)} tone="bad" />
        <Stat label="Due within 7 days / 1,000 km" value={String(rows.filter((r) => r.st.state === "DUE_SOON").length)} tone="warn" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <AddPanel title="Open a work order">
          <form action={createWorkOrder} className="grid gap-3 sm:grid-cols-2">
            <Field label="Vehicle"><select className="input" name="vehicleId" required>{active.map((v) => <option key={v.id} value={v.id}>{v.code} · {v.regNumber}</option>)}</select></Field>
            <Field label="Job"><input className="input" name="title" placeholder="e.g. Replace clutch plate" required /></Field>
            <Field label="Mechanic / garage"><input className="input" name="mechanic" /></Field>
            <Field label="Details"><input className="input" name="details" /></Field>
            <label className="flex items-center gap-2 text-[14px] sm:col-span-2"><input type="checkbox" name="toGarage" defaultChecked className="h-4 w-4" /> Take the vehicle off the road (pauses its daily target)</label>
            <div className="sm:col-span-2"><button className="btn btn-primary">Open work order</button></div>
          </form>
        </AddPanel>
        <AddPanel title="Add a service schedule">
          <form action={createSchedule} className="grid gap-3 sm:grid-cols-2">
            <Field label="Vehicle"><select className="input" name="vehicleId" required>{active.map((v) => <option key={v.id} value={v.id}>{v.code}</option>)}</select></Field>
            <Field label="Service"><input className="input" name="title" placeholder="e.g. Tyre rotation" required /></Field>
            <Field label="Every (km)"><input className="input num" name="intervalKm" inputMode="numeric" /></Field>
            <Field label="Or every (days)"><input className="input num" name="intervalDays" inputMode="numeric" /></Field>
            <Field label="Last done at (km)" hint="Blank = current odometer"><input className="input num" name="lastDoneKm" inputMode="numeric" /></Field>
            <Field label="Last done on"><input className="input" type="date" name="lastDoneDate" /></Field>
            <div className="sm:col-span-2"><button className="btn btn-primary">Add schedule</button></div>
          </form>
        </AddPanel>
      </div>

      <AddPanel title="Plan a full service (or any one-off job)">
        <form action={planService} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Vehicle"><select className="input" name="vehicleId" required>{active.map((v) => <option key={v.id} value={v.id}>{v.code} · {v.regNumber}</option>)}</select></Field>
          <Field label="Job"><input className="input" name="title" defaultValue="Full service" required /></Field>
          <Field label="Planned for"><input className="input" type="date" name="dueDate" min={today()} required /></Field>
          <div className="flex items-end"><button className="btn btn-primary w-full">Plan it</button></div>
        </form>
        <p className="mt-3 text-[12px] text-muted">It shows as due soon in the week before, appears in reminders, and drops off the list once you mark it done.</p>
      </AddPanel>
      <Notice tone="info">Standard plan: <b>buses</b> get brake pads every 3 weeks and an oil change every month, set up automatically. <b>Lorries</b>: oil every 5,000 km or 90 days. Full services are planned when needed (above).</Notice>

      <Card title="Open work orders" pad={false}>
        {open.length === 0 ? <Empty title="Nothing in the garage" /> : (
          <TableWrap><table className="data">
            <thead><tr><th>Vehicle</th><th>Job</th><th>Mechanic</th><th>Opened</th><th>Days</th><th>Status</th><th>Close with cost</th></tr></thead>
            <tbody>{open.map((w) => (
              <tr key={w.id}>
                <td><Link href={`/vehicles/${w.vehicleId}`} className="font-bold text-brand-700">{vmap.get(w.vehicleId)?.code}</Link></td>
                <td>{w.title}{w.details ? <div className="text-[12px] text-muted">{w.details}</div> : null}</td>
                <td>{w.mechanic ?? "—"}</td>
                <td>{fmtDate(w.openedAt)}</td>
                <td className="num">{daysBetween(w.openedAt, today())}</td>
                <td>{w.status === "OPEN" ? <form action={startWorkOrder.bind(null, w.id)}><button className="btn btn-ghost btn-sm">Start work</button></form> : <Badge tone="warn">In progress</Badge>}</td>
                <td>
                  <form action={closeWorkOrder.bind(null, w.id)} className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`c-${w.id}`}>Cost</label>
                    <input id={`c-${w.id}`} className="input num !min-h-[34px] !w-[110px] !py-1" name="cost" placeholder="Cost MWK" inputMode="numeric" />
                    <select className="input !min-h-[34px] !w-[130px] !py-1" name="category" aria-label="Cost type"><option value="REPAIRS_PARTS">Repairs & parts</option><option value="TYRES">Tyres</option><option value="SERVICE">Service</option></select>
                    <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" name="backOnRoad" defaultChecked /> Back on road</label>
                    <button className="btn btn-primary btn-sm">Close</button>
                  </form>
                </td>
              </tr>
            ))}</tbody>
          </table></TableWrap>
        )}
      </Card>

      <Card title="Service schedules" pad={false}>
        {rows.length === 0 ? <Empty title="No schedules yet" /> : (
          <TableWrap><table className="data">
            <thead><tr><th>Vehicle</th><th>Service</th><th>Interval</th><th>Last done</th><th>Next due</th><th>Left</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map(({ s, v, st }) => (
              <tr key={s.id}>
                <td><Link href={`/vehicles/${v.id}`} className="font-bold text-brand-700">{v.code}</Link></td>
                <td>{s.title}{s.oneOff ? <span className="ml-2"><Badge tone="info">Planned once</Badge></span> : null}</td>
                <td className="text-muted">{s.oneOff ? "One-off" : [s.intervalKm ? `${s.intervalKm.toLocaleString()} km` : null, s.intervalDays ? (s.intervalDays === 21 ? "3 weeks" : s.intervalDays === 30 ? "Monthly" : `${s.intervalDays} days`) : null].filter(Boolean).join(" / ")}</td>
                <td>{s.lastDoneKm != null ? `${s.lastDoneKm.toLocaleString()} km` : ""} {s.lastDoneDate ? `· ${fmtDate(s.lastDoneDate)}` : ""}</td>
                <td>{st.dueKm != null ? `${st.dueKm.toLocaleString()} km` : ""}{st.dueKm != null && st.dueDate ? " / " : ""}{st.dueDate ? fmtDate(st.dueDate) : ""}</td>
                <td className="num">{[st.kmLeft != null ? `${st.kmLeft.toLocaleString()} km` : null, st.daysLeft != null ? `${st.daysLeft} d` : null].filter(Boolean).join(" · ")}</td>
                <td><Badge tone={statusTone(st.state)}>{st.state === "OVERDUE" ? "Overdue" : st.state === "DUE_SOON" ? "Due soon" : "On track"}</Badge></td>
                <td>
                  <div className="flex gap-2">
                    <form action={markScheduleDone.bind(null, s.id)}><button className="btn btn-ghost btn-sm">Mark done</button></form>
                    <form action={deleteSchedule.bind(null, s.id)}><button className="btn btn-ghost btn-sm" aria-label={`Remove ${s.title}`}>Remove</button></form>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></TableWrap>
        )}
      </Card>

      <Card title="Recently completed" pad={false}>
        {recent.length === 0 ? <Empty title="No completed work yet" /> : (
          <TableWrap><table className="data">
            <thead><tr><th>Closed</th><th>Vehicle</th><th>Job</th><th>Mechanic</th><th>Odometer</th></tr></thead>
            <tbody>{recent.map((w) => (
              <tr key={w.id}><td>{fmtDate(w.closedAt)}</td><td>{vmap.get(w.vehicleId)?.code}</td><td>{w.title}</td><td>{w.mechanic ?? "—"}</td><td className="num">{w.odometer?.toLocaleString() ?? "—"}</td></tr>
            ))}</tbody>
          </table></TableWrap>
        )}
      </Card>
      <p className="text-[12px] text-muted">Status shown as {label("OVERDUE")}, due soon (within 7 days or 1,000 km) or on track. Keep odometer readings current on each vehicle page.</p>
    </>
  );
}
