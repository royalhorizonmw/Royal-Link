import Link from "next/link";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyRecords, vehicles, drivers } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { driverBalances, shortfallAgeing } from "@/lib/calc";
import { getSettings } from "@/lib/settings";
import { addDays, fmtDate, label, mwk, today } from "@/lib/format";
import { Badge, Card, Empty, Notice, PageHeader, Stat, TableWrap, statusTone } from "@/components/ui";
import { approveExcuse, closeDay, markRestDay, openDay, recordPayment, rejectExcuse, reopenRecord, requestExcuse } from "./actions";

export const metadata = { title: "Daily targets" };

const FILTERS = ["ALL", "PENDING", "PAID", "SHORT", "EXCUSED", "REST_DAY"] as const;

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ date?: string; f?: string; error?: string }> }) {
  const user = await requireRole("OPERATIONS", "FINANCE");
  const sp = await searchParams;
  const t = today();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : t;
  const f = (FILTERS as readonly string[]).includes(sp.f ?? "") ? sp.f! : "ALL";

  const rows = await db
    .select({ r: dailyRecords, v: vehicles, d: drivers })
    .from(dailyRecords)
    .innerJoin(vehicles, eq(vehicles.id, dailyRecords.vehicleId))
    .leftJoin(drivers, eq(drivers.id, dailyRecords.driverId))
    .where(eq(dailyRecords.date, date))
    .orderBy(vehicles.code);

  const driverIds = rows.map((x) => x.d?.id).filter(Boolean) as string[];
  const [balances, ageing, settings] = await Promise.all([
    driverIds.length ? driverBalances(driverIds) : Promise.resolve(new Map<string, number>()),
    shortfallAgeing(),
    getSettings(),
  ]);

  // Consecutive short days per driver (last N days up to this date)
  const streakStart = addDays(date, -14);
  const recent = driverIds.length ? await db
    .select({ driverId: dailyRecords.driverId, date: dailyRecords.date, status: dailyRecords.status })
    .from(dailyRecords)
    .where(and(gte(dailyRecords.date, streakStart), lte(dailyRecords.date, date)))
    .orderBy(sql`${dailyRecords.date} desc`) : [];
  const streak = (driverId: string) => {
    let n = 0;
    for (const r of recent.filter((x) => x.driverId === driverId)) {
      if (r.status === "SHORT") n++;
      else if (r.status === "PAID") break;
    }
    return n;
  };

  const expected = rows.filter((x) => ["PAID", "SHORT", "PENDING"].includes(x.r.status)).reduce((s, x) => s + x.r.target, 0);
  const received = rows.reduce((s, x) => s + x.r.amountPaid, 0);
  const shortAmt = rows.filter((x) => x.r.status === "SHORT").reduce((s, x) => s + (x.r.target - x.r.amountPaid), 0);
  const count = (s: string) => rows.filter((x) => x.r.status === s).length;
  const awaiting = rows.filter((x) => x.r.status === "EXCUSED" && !x.r.approvedById);
  const viaMobile = rows.filter((x) => x.r.method === "AIRTEL_MONEY" || x.r.method === "TNM_MPAMBA").reduce((s, x) => s + x.r.amountPaid, 0);
  const shown = f === "ALL" ? rows : rows.filter((x) => x.r.status === f);
  const isManager = user.role === "MANAGER";
  const maxAge = Math.max(1, ...Object.values(ageing));

  return (
    <>
      <PageHeader
        title="Daily target ledger"
        subtitle={fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        actions={
          <>
            <Link className="btn btn-ghost" href={`/ledger?date=${addDays(date, -1)}`}>← Previous day</Link>
            {date < t ? <Link className="btn btn-ghost" href={`/ledger?date=${addDays(date, 1)}`}>Next day →</Link> : null}
            <form method="get" className="flex gap-2">
              <label className="sr-only" htmlFor="date">Date</label>
              <input id="date" className="input !w-auto" type="date" name="date" defaultValue={date} max={t} />
              <button className="btn btn-ghost">Go</button>
            </form>
          </>
        }
      />
      {sp.error === "reason" ? <Notice tone="bad">Give a reason to excuse a day.</Notice> : null}
      {sp.error === "future" ? <Notice tone="bad">You can only open today or past days.</Notice> : null}
      {awaiting.length > 0 && isManager ? <Notice tone="warn">{awaiting.length} excused day{awaiting.length > 1 ? "s" : ""} waiting for your approval below.</Notice> : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Expected" value={mwk(expected)} note={`${rows.length} vehicles on the sheet`} />
        <Stat label="Received" value={mwk(received)} tone="good" note={received ? `${Math.round((viaMobile / received) * 100)}% by mobile money` : undefined} />
        <Stat label="Short" value={mwk(shortAmt)} tone={shortAmt ? "bad" : "ink"} note={`${count("SHORT")} driver${count("SHORT") === 1 ? "" : "s"}`} />
        <Stat label="Still pending" value={String(count("PENDING"))} tone={count("PENDING") ? "warn" : "ink"} />
        <Stat label="Excused / rest" value={`${count("EXCUSED")} / ${count("REST_DAY")}`} note={awaiting.length ? `${awaiting.length} awaiting approval` : undefined} />
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <nav aria-label="Filter" className="flex flex-wrap gap-2">
            {FILTERS.map((k) => (
              <Link key={k} href={`/ledger?date=${date}&f=${k}`}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${f === k ? "border-ink bg-ink text-white" : "border-line bg-white text-slate-600 hover:border-brand-300"}`}>
                {k === "ALL" ? "All" : label(k)} · {k === "ALL" ? rows.length : count(k)}
              </Link>
            ))}
          </nav>
          <div className="flex gap-2">
            <form action={openDay.bind(null, date)}><button className="btn btn-ghost btn-sm">{rows.length ? "Add missing vehicles" : "Open this day's sheet"}</button></form>
            {rows.length && count("PENDING") && user.role !== "OPERATIONS" ? (
              <form action={closeDay.bind(null, date)}><button className="btn btn-danger btn-sm">Close day: unpaid → short</button></form>
            ) : null}
          </div>
        </div>

        {rows.length === 0 ? (
          <Empty title="No sheet for this day yet">
            Open the day to create one row per vehicle that earns on a daily target. Vehicles in the garage are excused automatically.
            <form action={openDay.bind(null, date)} className="mt-4"><button className="btn btn-primary">Open this day&apos;s sheet</button></form>
          </Empty>
        ) : (
          <TableWrap>
            <table className="data">
              <thead><tr><th>Vehicle · driver</th><th>Record payment</th><th>Status</th><th>Other actions</th></tr></thead>
              <tbody>
                {shown.map(({ r, v, d }) => {
                  const bal = d ? balances.get(d.id) ?? 0 : 0;
                  const st = d ? streak(d.id) : 0;
                  const locked = r.status === "EXCUSED" || r.status === "REST_DAY";
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="flex items-baseline gap-2"><Link href={`/vehicles/${v.id}`} className="font-bold text-brand-700">{v.code}</Link><span className="num text-[12px] text-muted">target {r.target.toLocaleString()}</span></div>
                        {d ? <Link href={`/drivers/${d.id}`} className="text-[13px] text-ink hover:text-brand-700">{d.fullName}</Link> : <span className="text-[13px] text-muted">No driver</span>}
                        {st >= settings.shortStreakAlert ? <div className="text-[12px] font-semibold text-bad">{st} short days in a row</div> : null}
                      </td>
                      <td>
                        {locked ? (
                          <span className="text-[13px] text-muted">{r.excuseReason ?? "—"}</span>
                        ) : (
                          <form action={recordPayment.bind(null, r.id, date)} className="flex items-center gap-2">
                            <label className="sr-only" htmlFor={`a-${r.id}`}>Amount for {v.code}</label>
                            <input id={`a-${r.id}`} className="input num !min-h-[36px] !w-[104px] !px-2.5 !py-1.5" name="amount" inputMode="numeric"
                              defaultValue={r.status === "PENDING" ? r.target : r.amountPaid} />
                            <label className="sr-only" htmlFor={`m-${r.id}`}>Method</label>
                            <select id={`m-${r.id}`} className="input !min-h-[36px] !w-[118px] !px-2 !py-1.5" name="method" defaultValue={r.method ?? "AIRTEL_MONEY"}>
                              <option value="AIRTEL_MONEY">Airtel</option><option value="TNM_MPAMBA">Mpamba</option><option value="CASH">Cash</option><option value="BANK">Bank</option>
                            </select>
                            <label className="sr-only" htmlFor={`ref-${r.id}`}>Transaction reference</label>
                            <input id={`ref-${r.id}`} className="input !min-h-[36px] !w-[92px] !px-2.5 !py-1.5" name="reference" placeholder="Ref" defaultValue={r.reference ?? ""} />
                            <button className="btn btn-primary btn-sm">{r.status === "PENDING" ? "Save" : "Update"}</button>
                          </form>
                        )}
                      </td>
                      <td>
                        <Badge tone={r.status === "EXCUSED" && !r.approvedById ? "warn" : statusTone(r.status)}>
                          {r.status === "EXCUSED" && !r.approvedById ? "Excuse awaiting approval" : label(r.status)}
                        </Badge>
                        {r.status === "SHORT" ? <div className="num mt-1 text-[12px] font-semibold text-bad">−{(r.target - r.amountPaid).toLocaleString()} today</div> : null}
                        {bal > 0 ? <div className="num mt-0.5 text-[12px] text-muted">Owes {bal.toLocaleString()} total</div> : null}
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          {r.status === "EXCUSED" && !r.approvedById && isManager ? (
                            <>
                              <form action={approveExcuse.bind(null, r.id, date)}><button className="btn btn-primary btn-sm">Approve</button></form>
                              <form action={rejectExcuse.bind(null, r.id, date)}><button className="btn btn-danger btn-sm">Reject</button></form>
                            </>
                          ) : null}
                          {!locked ? (
                            <>
                              <form action={markRestDay.bind(null, r.id, date)}><button className="btn btn-ghost btn-sm">Rest day</button></form>
                              <details className="relative">
                                <summary className="btn btn-ghost btn-sm">Excuse…</summary>
                                <form action={requestExcuse.bind(null, r.id, date)} className="card absolute right-0 z-10 mt-2 flex w-[280px] flex-col gap-2 p-3 shadow-lg">
                                  <label className="label" htmlFor={`x-${r.id}`}>Reason</label>
                                  <select id={`x-${r.id}`} name="reason" className="input">
                                    <option>Breakdown on the road</option><option>Police impound</option><option>Approved leave</option><option>Sick (with note)</option><option>Road closed / fuel shortage</option><option>Other</option>
                                  </select>
                                  <button className="btn btn-primary btn-sm">{isManager ? "Excuse day" : "Send for approval"}</button>
                                </form>
                              </details>
                            </>
                          ) : (
                            <form action={reopenRecord.bind(null, r.id, date)}><button className="btn btn-ghost btn-sm">Undo</button></form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Unpaid shortfalls by age">
          {Object.entries(ageing).map(([k, v]) => (
            <div key={k} className="flex items-center gap-3 py-1.5">
              <span className="w-24 text-[13px] text-slate-600">{k}</span>
              <div className="h-2.5 flex-1 rounded-full bg-slate-100"><div className="h-2.5 rounded-full" style={{ width: `${(v / maxAge) * 100}%`, background: k === "1–7 days" ? "#f59e0b" : k === "8–14 days" ? "#ef4444" : "#b91c1c" }} /></div>
              <span className="num w-32 text-right text-[13px] font-bold">{mwk(v)}</span>
            </div>
          ))}
          <p className="mt-2 text-[12px] text-muted">Short-day gaps by how long ago they happened. Payments towards balances are recorded on each driver&apos;s page.</p>
        </Card>
        <Card title="Target rules">
          <ul className="list-disc space-y-1.5 pl-5 text-[14px] text-slate-700">
            <li>Vehicle in the garage: its row is excused automatically, so no shortfall.</li>
            <li>Excused days need a reason. Operations and Finance send them to the manager to approve.</li>
            <li>Up to {settings.restDaysPerWeek} rest day per driver per week.</li>
            <li>{settings.shortStreakAlert} short days in a row flags the driver here and on the dashboard.</li>
            <li>Paying more than the target reduces the driver&apos;s old balance.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
