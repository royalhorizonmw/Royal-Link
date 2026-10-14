import Link from "next/link";
import { and, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { vehicles, dailyRecords, complianceDocs, serviceSchedules, complaints, payrollRuns, haulageJobs, drivers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { dailySeries, docState, driverBalances, driverScores, scheduleStatus, vehiclePnl } from "@/lib/calc";
import { expensesByCategory } from "@/lib/calc";
import { getSettings } from "@/lib/settings";
import { addDays, fmtDate, label, monthRange, mwk, thisMonth, today } from "@/lib/format";
import { Badge, Bar, Card, Empty, Notice, TableWrap } from "@/components/ui";
import { DailyChart, VehicleBars } from "@/components/charts";

export const metadata = { title: "Dashboard" };

type Period = "today" | "week" | "month";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ p?: string; denied?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const p: Period = sp.p === "week" || sp.p === "month" ? sp.p : "today";
  const t = today();
  const month = thisMonth();
  const { start: mStart, end: mEnd } = monthRange(month);
  const pStart = p === "today" ? t : p === "week" ? addDays(t, -6) : mStart;
  const s = await getSettings();

  const [periodAgg, vs, series, pnl, scores, balances, docs, scheds, openComplaints, draftRuns, owedJobs, awaiting, costs, ds] = await Promise.all([
    db.select({
      expected: sql<number>`coalesce(sum(case when ${dailyRecords.status} in ('PAID','SHORT','PENDING') then ${dailyRecords.target} else 0 end),0)::int`,
      paid: sql<number>`coalesce(sum(${dailyRecords.amountPaid}),0)::int`,
    }).from(dailyRecords).where(and(gte(dailyRecords.date, pStart), lte(dailyRecords.date, t))),
    db.select().from(vehicles).where(ne(vehicles.status, "DISPOSED")),
    dailySeries(addDays(t, -13), t),
    vehiclePnl(mStart, mEnd),
    driverScores(mStart, mEnd),
    driverBalances(),
    db.select().from(complianceDocs),
    db.select().from(serviceSchedules).where(eq(serviceSchedules.active, true)),
    db.select().from(complaints).where(ne(complaints.status, "RESOLVED")),
    db.select().from(payrollRuns).where(eq(payrollRuns.status, "DRAFT")),
    db.select().from(haulageJobs).where(eq(haulageJobs.status, "INVOICED")),
    db.select().from(dailyRecords).where(and(eq(dailyRecords.status, "EXCUSED"), isNull(dailyRecords.approvedById))),
    expensesByCategory(pStart, t),
    db.select().from(drivers).where(eq(drivers.status, "ACTIVE")),
  ]);

  // Period income includes delivered haulage jobs
  const [jobInc] = await db.select({ v: sql<number>`coalesce(sum(${haulageJobs.rate}),0)::int` }).from(haulageJobs)
    .where(and(gte(haulageJobs.date, pStart), lte(haulageJobs.date, t), inArray(haulageJobs.status, ["DELIVERED", "INVOICED", "PAID"])));
  const expected = Number(periodAgg[0]?.expected ?? 0);
  const collected = Number(periodAgg[0]?.paid ?? 0);
  const pct = expected ? collected / expected : null;
  const periodCost = [...costs.values()].reduce((a, x) => a + x, 0);
  const periodProfit = collected + Number(jobInc?.v ?? 0) - periodCost;

  const onRoad = vs.filter((v) => v.status === "ACTIVE");
  const owedTotal = [...balances.values()].filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const owingDrivers = [...balances.values()].filter((x) => x > 0).length;

  // Short streaks
  const recent = await db.select({ driverId: dailyRecords.driverId, date: dailyRecords.date, status: dailyRecords.status })
    .from(dailyRecords).where(gte(dailyRecords.date, addDays(t, -14))).orderBy(sql`${dailyRecords.date} desc`);
  const streaks = ds.map((d) => {
    let n = 0;
    for (const r of recent.filter((x) => x.driverId === d.id)) { if (r.status === "SHORT") n++; else if (r.status === "PAID") break; }
    return { d, n };
  }).filter((x) => x.n >= s.shortStreakAlert);

  // Attention list
  type Alert = { title: string; sub: string; tag: string; tone: string; href: string; rank: number };
  const alerts: Alert[] = [];
  const vmap = new Map(vs.map((v) => [v.id, v]));
  const dmap = new Map(ds.map((d) => [d.id, d]));
  for (const d of docs) {
    const st = docState(d.expiryDate, s.complianceWarnDays);
    if (st.state === "OK") continue;
    const owner = d.vehicleId ? vmap.get(d.vehicleId)?.code : d.driverId ? dmap.get(d.driverId)?.fullName : undefined;
    if (!owner) continue;
    alerts.push({ title: `${owner} ${label(d.type)} ${st.daysLeft < 0 ? `expired ${-st.daysLeft} days ago` : `expires in ${st.daysLeft} days`}`, sub: `Expiry ${fmtDate(d.expiryDate)}`, tag: "Compliance", tone: st.state === "OVERDUE" ? "bad" : "warn", href: "/compliance", rank: st.daysLeft });
  }
  for (const sc of scheds) {
    const v = vmap.get(sc.vehicleId);
    if (!v) continue;
    const st = scheduleStatus(sc, v.odometer);
    if (st.state === "OK") continue;
    alerts.push({ title: `${v.code} ${sc.title} ${st.state === "OVERDUE" ? "overdue" : "due soon"}`, sub: [st.kmLeft != null ? `${st.kmLeft.toLocaleString()} km left` : null, st.daysLeft != null ? `${st.daysLeft} days left` : null].filter(Boolean).join(" · "), tag: "Maintenance", tone: st.state === "OVERDUE" ? "bad" : "warn", href: "/maintenance", rank: st.state === "OVERDUE" ? -5 : 10 });
  }
  for (const x of streaks) alerts.push({ title: `${x.d.fullName} short ${x.n} days in a row`, sub: `Owes ${mwk(balances.get(x.d.id) ?? 0)}`, tag: "Targets", tone: "bad", href: `/drivers/${x.d.id}`, rank: -3 });
  if (awaiting.length) alerts.push({ title: `${awaiting.length} excused day${awaiting.length > 1 ? "s" : ""} awaiting approval`, sub: "Approve or reject in the ledger", tag: "Approval", tone: "info", href: `/ledger?date=${awaiting[0].date}`, rank: 0 });
  for (const c of openComplaints.filter((c) => c.severity === "HIGH")) alerts.push({ title: `Complaint: ${c.description.slice(0, 70)}`, sub: `${c.vehicleId ? vmap.get(c.vehicleId)?.code + " · " : ""}${fmtDate(c.date)}`, tag: "Complaint", tone: "bad", href: "/complaints", rank: -4 });
  for (const r of draftRuns) alerts.push({ title: `Payroll ${r.month} ready for approval`, sub: "Prepared by Finance", tag: "Payroll", tone: "info", href: `/payroll/${r.month}`, rank: 1 });
  const owedByClients = owedJobs.reduce((a, j) => a + (j.rate - j.amountPaid), 0);
  if (owedByClients) alerts.push({ title: `Clients owe ${mwk(owedByClients)} on ${owedJobs.length} invoice${owedJobs.length > 1 ? "s" : ""}`, sub: "Follow up haulage payments", tag: "Receivables", tone: "warn", href: "/jobs", rank: 5 });
  alerts.sort((a, b) => a.rank - b.rank);

  const chartData = series.map((x) => ({ label: fmtDate(x.date, { day: "numeric", month: "short" }), paid: x.paid, expected: x.expected }));
  const greeting = (() => { const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Blantyre" }).format(new Date())); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; })();
  const periodLabel = { today: "Today", week: "Last 7 days", month: "This month" }[p];

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-muted">{fmtDate(t, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
          <h1 className="mt-1 text-[26px] font-extrabold tracking-tight sm:text-[30px]">{greeting}, {user.name.split(" ")[0]}</h1>
        </div>
        <nav aria-label="Period" className="flex gap-1 rounded-xl border border-line bg-white p-1">
          {(["today", "week", "month"] as Period[]).map((k) => (
            <Link key={k} href={`/?p=${k}`} className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold ${p === k ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {{ today: "Today", week: "This week", month: "This month" }[k]}
            </Link>
          ))}
        </nav>
      </header>
      {sp.denied ? <Notice tone="warn">That page is not available for your role.</Notice> : null}

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href={`/ledger`} className="rounded-2xl bg-brand-700 p-5 text-white transition hover:bg-brand-800">
          <div className="text-[13px] font-medium text-brand-100">Collected vs target · {periodLabel}</div>
          <div className="num mt-1.5 text-[28px] font-extrabold">{mwk(collected)}</div>
          <div className="num text-[13px] text-brand-100">of {mwk(expected)} expected</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-500/60"><div className="h-2 rounded-full bg-white" style={{ width: `${Math.min(100, (pct ?? 0) * 100)}%` }} /></div>
          <div className="num mt-2 text-[13px] font-bold">{pct == null ? "No sheet yet" : `${Math.round(pct * 100)}% achieved`}</div>
        </Link>
        <Link href="/vehicles" className="card block p-5 hover:border-brand-300">
          <div className="text-[13px] font-medium text-muted">Vehicles on the road</div>
          <div className="num mt-1.5 text-[28px] font-extrabold">{onRoad.length} <span className="text-[18px] font-semibold text-muted">/ {vs.length}</span></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="good">{onRoad.filter((v) => v.type !== "LORRY").length} buses</Badge>
            <Badge tone="info">{onRoad.filter((v) => v.type === "LORRY").length} lorries</Badge>
            {vs.filter((v) => v.status === "IN_GARAGE").length ? <Badge tone="warn">{vs.filter((v) => v.status === "IN_GARAGE").length} in garage</Badge> : null}
          </div>
        </Link>
        <Link href="/drivers" className="card block p-5 hover:border-brand-300">
          <div className="text-[13px] font-medium text-muted">Driver shortfall balance</div>
          <div className={`num mt-1.5 text-[28px] font-extrabold ${owedTotal ? "text-bad" : "text-good"}`}>{mwk(owedTotal)}</div>
          <div className="text-[13px] text-muted">{owingDrivers ? `Owed by ${owingDrivers} driver${owingDrivers > 1 ? "s" : ""}` : "Nobody owes"}</div>
        </Link>
        <Link href={user.role === "OPERATIONS" ? "/vehicles" : "/reports"} className="card block p-5 hover:border-brand-300">
          <div className="text-[13px] font-medium text-muted">Net profit · {periodLabel}</div>
          <div className={`num mt-1.5 text-[28px] font-extrabold ${periodProfit >= 0 ? "text-good" : "text-bad"}`}>{mwk(periodProfit)}</div>
          <div className="text-[13px] text-muted">Income {mwk(collected + Number(jobInc?.v ?? 0))} · costs {mwk(periodCost)}</div>
        </Link>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Collected vs expected · last 14 days" action={<span className="text-[12px] text-muted">Bars: collected · dashed: expected</span>}>
          <DailyChart data={chartData} />
        </Card>
        <Card title="Needs attention" pad={false} action={<Badge tone={alerts.length ? "bad" : "good"}>{alerts.length ? `${alerts.length} open` : "All clear"}</Badge>}>
          {alerts.length === 0 ? <Empty title="Nothing needs attention" /> : (
            <ul className="max-h-[330px] divide-y divide-slate-100 overflow-y-auto">
              {alerts.slice(0, 20).map((a, i) => (
                <li key={i}>
                  <Link href={a.href} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.tone === "bad" ? "bg-red-600" : a.tone === "warn" ? "bg-amber-500" : "bg-brand-600"}`} />
                    <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold">{a.title}</span><span className="block text-[12px] text-muted">{a.sub}</span></span>
                    <Badge tone="muted">{a.tag}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card title="Profit by vehicle · this month" pad={false} action={<Link href="/vehicles" className="text-[13px] font-bold text-brand-700">Fleet</Link>}>
          {pnl.length === 0 ? <Empty title="No vehicles yet" /> : (
            <>
              <div className="px-3"><VehicleBars data={pnl.map((r) => ({ label: r.vehicle.code, value: r.profit }))} /></div>
              <TableWrap><table className="data">
                <thead><tr><th>Vehicle</th><th>Income</th><th>Costs</th><th>Profit</th><th>Target hit</th></tr></thead>
                <tbody>{pnl.map((r) => (
                  <tr key={r.vehicle.id}>
                    <td><Link href={`/vehicles/${r.vehicle.id}`} className="font-bold text-brand-700">{r.vehicle.code}</Link> <span className="text-[12px] text-muted">{label(r.vehicle.type)}</span></td>
                    <td className="num">{mwk(r.income)}</td><td className="num">{mwk(r.cost)}</td>
                    <td className={`num font-bold ${r.profit >= 0 ? "text-good" : "text-bad"}`}>{mwk(r.profit)}</td>
                    <td><Bar value={r.hit} /></td>
                  </tr>
                ))}</tbody>
              </table></TableWrap>
            </>
          )}
        </Card>
        <Card title="Driver leaderboard · this month" pad={false} action={<span className="text-[12px] text-muted">Score out of 100</span>}>
          {scores.length === 0 ? <Empty title="No drivers yet" /> : (
            <ul className="divide-y divide-slate-100">
              {scores.slice(0, 8).map((x, i) => {
                const v = x.driver.vehicleId ? vmap.get(x.driver.vehicleId) : undefined;
                const initials = x.driver.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("");
                return (
                  <li key={x.driver.id}>
                    <Link href={`/drivers/${x.driver.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                      <span className="num w-5 font-bold text-muted">{i + 1}</span>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-[12px] font-bold text-brand-800">{initials}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold">{x.driver.fullName}</span>
                        <span className="block text-[12px] text-muted">{v?.code ?? "No vehicle"} · {x.shortDays} short day{x.shortDays === 1 ? "" : "s"} · {x.complaintCount} complaint{x.complaintCount === 1 ? "" : "s"}</span>
                      </span>
                      <span className={`num text-[18px] font-extrabold ${x.score.total >= 85 ? "text-good" : x.score.total >= 70 ? "text-ink" : "text-bad"}`}>{x.score.total}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}
