import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { dailyRecords, drivers, vehicles, payslips, payrollRuns, staff, complaints } from "@/db/schema";
import { requireUser, logActivity } from "@/lib/auth";
import { driverBalances, driverScores } from "@/lib/calc";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtMonth, label, monthRange, mwk, str, thisMonth, today } from "@/lib/format";
import { Badge, statusTone } from "@/components/ui";
import { Icon } from "@/components/icons";
import { changeOwnPassword } from "../(app)/settings/actions";

export const metadata = { title: "My day" };
export const dynamic = "force-dynamic";

async function reportProblem(fd: FormData) {
  "use server";
  const me = await requireUser();
  if (!me.driverId) redirect("/me");
  const d = await db.query.drivers.findFirst({ where: eq(drivers.id, me.driverId) });
  const kind = str(fd.get("kind")) ?? "Breakdown";
  const message = str(fd.get("message")) ?? "";
  await db.insert(complaints).values({
    date: today(), source: "DRIVER", severity: kind === "Accident" ? "HIGH" : "MEDIUM",
    vehicleId: d?.vehicleId ?? null, driverId: me.driverId, description: `${kind} reported by driver: ${message}`.slice(0, 2000),
    contactName: d?.fullName, contactPhone: d?.phone,
  });
  // Ask for today's target to be excused (manager approves)
  if (d?.vehicleId && fd.get("excuse") === "on") {
    await db.update(dailyRecords).set({ status: "EXCUSED", excuseReason: `${kind} (reported by driver)`, approvedById: null, updatedAt: new Date() })
      .where(and(eq(dailyRecords.vehicleId, d.vehicleId), eq(dailyRecords.date, today()), inArray(dailyRecords.status, ["PENDING", "SHORT"])));
  }
  await logActivity(me.id, "driver.report", kind);
  redirect("/me?sent=1");
}

export default async function MePage({ searchParams }: { searchParams: Promise<{ sent?: string; saved?: string; error?: string }> }) {
  const me = await requireUser();
  if (me.role !== "DRIVER") redirect("/");
  const sp = await searchParams;
  if (!me.driverId) return <main className="p-6">Your account is not linked to a driver profile. Ask Operations to link it.</main>;
  const t = today();
  const { start, end } = monthRange(thisMonth());
  const d = await db.query.drivers.findFirst({ where: eq(drivers.id, me.driverId) });
  const [v, todayRec, days, balances, scores, myStaff, s] = await Promise.all([
    d?.vehicleId ? db.query.vehicles.findFirst({ where: eq(vehicles.id, d.vehicleId) }) : Promise.resolve(undefined),
    d?.vehicleId ? db.query.dailyRecords.findFirst({ where: and(eq(dailyRecords.vehicleId, d.vehicleId), eq(dailyRecords.date, t)) }) : Promise.resolve(undefined),
    db.select().from(dailyRecords).where(eq(dailyRecords.driverId, me.driverId)).orderBy(desc(dailyRecords.date)).limit(10),
    driverBalances([me.driverId]),
    driverScores(start, end),
    db.query.staff.findFirst({ where: eq(staff.driverId, me.driverId) }),
    getSettings(),
  ]);
  const slips = myStaff ? await db.select({ p: payslips, month: payrollRuns.month }).from(payslips)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
    .where(and(eq(payslips.staffId, myStaff.id), inArray(payrollRuns.status, ["APPROVED", "PAID"]))).orderBy(desc(payrollRuns.month)).limit(6) : [];
  const bal = balances.get(me.driverId) ?? 0;
  const sc = scores.find((x) => x.driver.id === me.driverId);
  const rank = sc ? scores.indexOf(sc) + 1 : null;
  const score = sc?.score.total ?? 0;
  const circ = 2 * Math.PI * 23;
  const status = todayRec?.status ?? null;

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto flex max-w-[480px] flex-col gap-4 px-4 py-6">
        <header className="flex items-center justify-between">
          <div>
            <div className="text-[13px] text-muted">{fmtDate(t, { weekday: "short", day: "numeric", month: "short" })}{v ? ` · ${v.code}` : ""}</div>
            <h1 className="text-[22px] font-extrabold">Hello, {me.name.split(" ")[0]}</h1>
          </div>
          <form action="/logout" method="post"><button className="btn btn-ghost btn-sm" aria-label="Sign out"><Icon name="logout" size={16} /></button></form>
        </header>
        {sp.sent ? <div className="rounded-xl bg-good-bg px-4 py-3 text-[14px] text-good">Report sent to Operations.</div> : null}

        <section className="rounded-[20px] bg-brand-700 p-5 text-white">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-brand-100">Today&apos;s target</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${status === "PAID" ? "bg-good-bg text-good" : status === "SHORT" ? "bg-bad-bg text-bad" : status === "EXCUSED" || status === "REST_DAY" ? "bg-info-bg text-info" : "bg-warn-bg text-warn"}`}>
              {status ? (status === "PENDING" ? "Not yet paid" : label(status)) : v ? "Sheet not opened yet" : "No vehicle assigned"}
            </span>
          </div>
          <div className="num mt-2 text-[34px] font-extrabold">{mwk(todayRec?.target ?? v?.dailyTarget ?? 0)}</div>
          {todayRec?.amountPaid ? <div className="num text-[14px] text-brand-100">Paid today: {mwk(todayRec.amountPaid)}</div> : null}
          <p className="mt-3 rounded-xl bg-brand-800/60 p-3 text-[13px] leading-snug text-brand-50">{s.paymentInstructions}{v ? ` Reference: ${v.code}.` : ""}</p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <div className="text-[12px] text-muted">I owe</div>
            <div className={`num mt-1 text-[18px] font-extrabold ${bal > 0 ? "text-bad" : "text-good"}`}>{bal > 0 ? mwk(bal) : "Nothing"}</div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`My score ${score} out of 100`}>
              <circle cx="28" cy="28" r="23" fill="none" stroke="#e2e8f0" strokeWidth="7" />
              <circle cx="28" cy="28" r="23" fill="none" stroke={score >= 85 ? "#16a34a" : score >= 70 ? "#2563eb" : "#dc2626"} strokeWidth="7" strokeLinecap="round"
                strokeDasharray={`${(score / 100) * circ} ${circ}`} transform="rotate(-90 28 28)" />
              <text x="28" y="33" textAnchor="middle" fontSize="15" fontWeight="800" fill="#0f172a">{score}</text>
            </svg>
            <div><div className="text-[12px] text-muted">My score</div><div className="text-[13px] font-bold">{rank ? `Rank ${rank} of ${scores.length}` : "—"}</div></div>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 text-[15px] font-bold">Recent days</h2>
          {days.length === 0 ? <p className="text-[14px] text-muted">Nothing yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {days.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-[14px]">
                  <span className="text-slate-700">{fmtDate(r.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                  <span className="num font-semibold">{r.amountPaid ? mwk(r.amountPaid) : "—"}</span>
                  <Badge tone={statusTone(r.status)}>{label(r.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <details className="card p-4">
          <summary className="flex min-h-[44px] items-center justify-center gap-2 text-[15px] font-bold text-bad"><Icon name="alert" /> Report breakdown or incident</summary>
          <form action={reportProblem} className="mt-3 flex flex-col gap-3">
            <label className="block"><span className="label">What happened?</span>
              <select className="input" name="kind"><option>Breakdown</option><option>Accident</option><option>Police stop / impound</option><option>Passenger problem</option><option>Other</option></select>
            </label>
            <label className="block"><span className="label">Details and where you are</span><textarea className="input min-h-[80px]" name="message" required /></label>
            <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="excuse" className="h-4 w-4" defaultChecked /> Ask for today&apos;s target to be excused</label>
            <button className="btn btn-primary">Send report</button>
          </form>
        </details>

        {slips.length ? (
          <section className="card p-4">
            <h2 className="mb-2 text-[15px] font-bold">My payslips</h2>
            <ul className="divide-y divide-slate-100">
              {slips.map(({ p, month }) => (
                <li key={p.id} className="py-2 text-[14px]">
                  <div className="flex justify-between font-semibold"><span>{fmtMonth(month)}</span><span className="num">{mwk(p.net)}</span></div>
                  <div className="text-[12px] text-muted">Gross {mwk(p.gross)} · PAYE {p.paye.toLocaleString()} · pension {p.pensionEmployee.toLocaleString()}{p.shortfallRecovery ? ` · shortfall ${p.shortfallRecovery.toLocaleString()}` : ""}</div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <details className="card p-4">
          <summary className="text-[14px] font-semibold text-brand-700">Change my password</summary>
          {sp.error ? <p className="mt-2 text-[13px] text-bad">Current password is wrong, or the new one is too short.</p> : null}
          {sp.saved ? <p className="mt-2 text-[13px] text-good">Password changed.</p> : null}
          <form action={changeOwnPassword} className="mt-3 flex flex-col gap-3">
            <label className="block"><span className="label">Current password</span><input className="input" type="password" name="current" required /></label>
            <label className="block"><span className="label">New password (8+ characters)</span><input className="input" type="password" name="next" minLength={8} required /></label>
            <button className="btn btn-ghost">Change password</button>
          </form>
        </details>
      </div>
    </main>
  );
}
