import Link from "next/link";
import { asc, desc, ne } from "drizzle-orm";
import { db } from "@/db";
import { complaints, vehicles, drivers } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { daysBetween, fmtDate, label, today } from "@/lib/format";
import { AddPanel, Badge, Card, Field, Notice, PageHeader, Stat, statusTone } from "@/components/ui";
import { createComplaint, moveComplaint, resolveComplaint } from "./actions";

export const metadata = { title: "Complaints" };

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("OPERATIONS");
  const sp = await searchParams;
  const [all, vs, ds] = await Promise.all([
    db.select().from(complaints).orderBy(desc(complaints.date), desc(complaints.createdAt)).limit(300),
    db.select().from(vehicles).where(ne(vehicles.status, "DISPOSED")).orderBy(asc(vehicles.code)),
    db.select().from(drivers).orderBy(asc(drivers.fullName)),
  ]);
  const t = today();
  const resolved = all.filter((c) => c.status === "RESOLVED" && c.resolvedAt);
  const avgDays = resolved.length ? resolved.reduce((s, c) => s + daysBetween(c.date, c.resolvedAt!), 0) / resolved.length : null;
  const weekAgo = new Date(Date.parse(t) - 7 * 864e5).toISOString().slice(0, 10);
  const cols = [
    { key: "NEW", title: "New", dot: "#dc2626", items: all.filter((c) => c.status === "NEW") },
    { key: "IN_PROGRESS", title: "In progress", dot: "#f59e0b", items: all.filter((c) => c.status === "IN_PROGRESS") },
    { key: "RESOLVED", title: "Resolved this week", dot: "#16a34a", items: resolved.filter((c) => c.resolvedAt! >= weekAgo) },
  ];
  const code = (id: string | null) => vs.find((v) => v.id === id)?.code;
  const name = (id: string | null) => ds.find((d) => d.id === id)?.fullName;

  return (
    <>
      <PageHeader title="Complaints" subtitle="From passengers, clients and staff"
        actions={<Link className="btn btn-ghost" href="/complaints/qr">Print QR codes for buses</Link>} />
      {sp.error ? <Notice tone="bad">Describe the complaint.</Notice> : null}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open" value={String(cols[0].items.length + cols[1].items.length)} tone={cols[0].items.length ? "bad" : "ink"} />
        <Stat label="High severity open" value={String(all.filter((c) => c.status !== "RESOLVED" && c.severity === "HIGH").length)} tone="bad" />
        <Stat label="Resolved (all time)" value={String(resolved.length)} tone="good" />
        <Stat label="Average time to resolve" value={avgDays == null ? "—" : `${avgDays.toFixed(1)} days`} />
      </div>

      <AddPanel title="Log a complaint">
        <form action={createComplaint} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Source"><select className="input" name="source"><option value="PASSENGER">Passenger</option><option value="CLIENT">Client (haulage)</option><option value="STAFF">Staff</option><option value="DRIVER">Driver</option></select></Field>
          <Field label="Severity"><select className="input" name="severity" defaultValue="MEDIUM"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High (safety)</option></select></Field>
          <Field label="Vehicle"><select className="input" name="vehicleId" defaultValue=""><option value="">—</option>{vs.map((v) => <option key={v.id} value={v.id}>{v.code}</option>)}</select></Field>
          <Field label="Driver" hint="Blank = the vehicle's current driver"><select className="input" name="driverId" defaultValue=""><option value="">—</option>{ds.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}</select></Field>
          <Field label="What happened" className="sm:col-span-2 lg:col-span-4"><textarea className="input min-h-[70px]" name="description" required /></Field>
          <Field label="Contact name"><input className="input" name="contactName" /></Field>
          <Field label="Contact phone"><input className="input" name="contactPhone" /></Field>
          <Field label="Date"><input className="input" type="date" name="date" defaultValue={t} /></Field>
          <div className="flex items-end"><button className="btn btn-primary">Log complaint</button></div>
        </form>
      </AddPanel>

      <div className="grid gap-4 lg:grid-cols-3">
        {cols.map((col) => (
          <section key={col.key} aria-label={col.title} className="flex flex-col gap-3 rounded-2xl bg-slate-100 p-3">
            <div className="flex items-center justify-between px-1 pt-1">
              <span className="flex items-center gap-2 text-[14px] font-bold"><span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />{col.title}</span>
              <span className="num text-[12px] font-bold text-slate-600">{col.items.length}</span>
            </div>
            {col.items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-[13px] text-muted">Nothing here</div> : null}
            {col.items.map((c) => (
              <article key={c.id} className="card flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={statusTone(c.severity)}>{label(c.severity)}</Badge>
                  <span className="text-[12px] text-muted">{fmtDate(c.date, { day: "numeric", month: "short" })}</span>
                </div>
                <p className="text-[14px] font-semibold leading-snug">{c.description}</p>
                <div className="text-[12px] text-muted">{label(c.source)}{code(c.vehicleId) ? ` · ${code(c.vehicleId)}` : ""}{name(c.driverId) ? ` · ${name(c.driverId)}` : ""}{c.contactPhone ? ` · ${c.contactPhone}` : ""}</div>
                {c.status === "RESOLVED" ? <div className="text-[12px] text-good">✓ {c.resolution}</div> : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {c.status === "NEW" ? <form action={moveComplaint.bind(null, c.id, "IN_PROGRESS")}><button className="btn btn-ghost btn-sm">Start handling</button></form> : null}
                    <details className="w-full">
                      <summary className="btn btn-primary btn-sm">Resolve…</summary>
                      <form action={resolveComplaint.bind(null, c.id)} className="mt-2 flex flex-col gap-2">
                        <label className="sr-only" htmlFor={`r-${c.id}`}>Resolution</label>
                        <input id={`r-${c.id}`} className="input" name="resolution" placeholder="What was done" required />
                        <button className="btn btn-primary btn-sm">Save</button>
                      </form>
                    </details>
                  </div>
                )}
              </article>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
