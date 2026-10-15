import "server-only";
import { and, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  users, vehicles, drivers, dailyRecords, complianceDocs, serviceSchedules, complaints, payrollRuns, haulageJobs, workOrders,
} from "@/db/schema";
import { getSettings } from "./settings";
import { docState, driverBalances, scheduleStatus } from "./calc";
import { addDays, fmtDate, label, mwk, today } from "./format";
import { appUrl, renderEmail, sendEmail, type Section } from "./email";

type Role = "MANAGER" | "OPERATIONS" | "FINANCE" | "DRIVER";

/** Collects everything reminders can mention, once per run. */
async function gather() {
  const t = today();
  const y = addDays(t, -1);
  const s = await getSettings();
  const [vs, ds, docs, scheds, openComplaints, drafts, invoiced, openWO, yRows, tRows, awaiting] = await Promise.all([
    db.select().from(vehicles).where(ne(vehicles.status, "DISPOSED")),
    db.select().from(drivers).where(ne(drivers.status, "LEFT")),
    db.select().from(complianceDocs),
    db.select().from(serviceSchedules).where(eq(serviceSchedules.active, true)),
    db.select().from(complaints).where(and(ne(complaints.status, "RESOLVED"), sql`${complaints.description} not ilike 'Compliment%'`)),
    db.select().from(payrollRuns).where(eq(payrollRuns.status, "DRAFT")),
    db.select().from(haulageJobs).where(eq(haulageJobs.status, "INVOICED")),
    db.select().from(workOrders).where(inArray(workOrders.status, ["OPEN", "IN_PROGRESS"])),
    db.select().from(dailyRecords).where(eq(dailyRecords.date, y)),
    db.select({ n: sql<number>`count(*)::int` }).from(dailyRecords).where(eq(dailyRecords.date, t)),
    db.select().from(dailyRecords).where(and(eq(dailyRecords.status, "EXCUSED"), isNull(dailyRecords.approvedById))),
  ]);
  const balances = await driverBalances();
  const vmap = new Map(vs.map((v) => [v.id, v]));
  const dmap = new Map(ds.map((d) => [d.id, d]));

  // Short streaks up to yesterday
  const recent = await db.select({ driverId: dailyRecords.driverId, status: dailyRecords.status })
    .from(dailyRecords).where(and(gte(dailyRecords.date, addDays(t, -14)), lte(dailyRecords.date, y)))
    .orderBy(sql`${dailyRecords.date} desc`);
  const streak = new Map<string, number>();
  for (const d of ds) {
    let n = 0;
    for (const r of recent.filter((x) => x.driverId === d.id)) { if (r.status === "SHORT") n++; else if (r.status === "PAID") break; }
    if (n >= s.shortStreakAlert) streak.set(d.id, n);
  }

  const docAlerts = docs.map((d) => ({ d, st: docState(d.expiryDate, s.complianceWarnDays) }))
    .filter((x) => x.st.state !== "OK")
    .map(({ d, st }) => ({
      ...d,
      owner: d.vehicleId ? vmap.get(d.vehicleId)?.code : d.driverId ? dmap.get(d.driverId)?.fullName : undefined,
      daysLeft: st.daysLeft,
    }))
    .filter((x) => x.owner)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const svcAlerts = scheds.flatMap((sc) => {
    const v = vmap.get(sc.vehicleId);
    if (!v) return [];
    const st = scheduleStatus(sc, v.odometer);
    return st.state === "OK" ? [] : [{ sc, v, st }];
  });

  const yExpected = yRows.filter((r) => ["PAID", "SHORT", "PENDING"].includes(r.status)).reduce((a, r) => a + r.target, 0);
  const yPaid = yRows.reduce((a, r) => a + r.amountPaid, 0);
  const yPending = yRows.filter((r) => r.status === "PENDING").length;
  const yShort = yRows.filter((r) => r.status === "SHORT");

  return {
    t, y, s, vs, ds, vmap, dmap, balances, streak, docAlerts, svcAlerts, openComplaints, drafts, invoiced, openWO,
    yRows, yExpected, yPaid, yPending, yShort, todayOpened: Number(tRows[0]?.n ?? 0) > 0, awaiting,
  };
}

type Data = Awaited<ReturnType<typeof gather>>;
const u = (p: string) => `${appUrl()}${p}`;

function docSection(d: Data, onlyDrivers = false): Section | null {
  const list = d.docAlerts.filter((x) => (onlyDrivers ? !!x.driverId : true));
  if (!list.length) return null;
  return {
    title: "Documents expiring or expired", tone: list.some((x) => x.daysLeft < 0) ? "bad" : "warn",
    items: list.slice(0, 15).map((x) => ({
      text: `${x.owner}: ${label(x.type)} ${x.daysLeft < 0 ? `EXPIRED ${-x.daysLeft} days ago` : `expires in ${x.daysLeft} days (${fmtDate(x.expiryDate)})`}`,
      link: u("/compliance"),
    })),
  };
}

function sectionsFor(role: Role, d: Data): Section[] {
  const out: Section[] = [];
  const add = (s: Section | null) => { if (s && s.items.length) out.push(s); };

  const yesterday: Section = {
    title: `Yesterday's targets (${fmtDate(d.y, { weekday: "short", day: "numeric", month: "short" })})`,
    tone: d.yShort.length ? "warn" : "good",
    items: d.yRows.length ? [
      { text: `Collected ${mwk(d.yPaid)} of ${mwk(d.yExpected)} expected${d.yExpected ? ` (${Math.round((d.yPaid / d.yExpected) * 100)}%)` : ""}`, link: u(`/ledger?date=${d.y}`) },
      ...(d.yShort.length ? [{ text: `${d.yShort.length} vehicle(s) short: ${d.yShort.map((r) => d.vmap.get(r.vehicleId)?.code).join(", ")}` }] : []),
      ...(d.yPending ? [{ text: `${d.yPending} payment(s) still pending, close the day in the ledger`, link: u(`/ledger?date=${d.y}`) }] : []),
    ] : [{ text: "No daily sheet was opened yesterday.", link: u(`/ledger?date=${d.y}`) }],
  };

  const streaks: Section = {
    title: "Drivers short several days in a row", tone: "bad",
    items: [...d.streak.entries()].map(([id, n]) => ({ text: `${d.dmap.get(id)?.fullName}: ${n} days short, owes ${mwk(d.balances.get(id) ?? 0)}`, link: u(`/drivers/${id}`) })),
  };
  const service: Section = {
    title: "Maintenance due", tone: d.svcAlerts.some((x) => x.st.state === "OVERDUE") ? "bad" : "warn",
    items: d.svcAlerts.map(({ sc, v, st }) => {
      const parts: string[] = [];
      if (st.kmLeft != null) parts.push(st.kmLeft < 0 ? `${(-st.kmLeft).toLocaleString()} km overdue` : `${st.kmLeft.toLocaleString()} km left`);
      if (st.daysLeft != null) parts.push(st.daysLeft < 0 ? `${-st.daysLeft} days overdue` : `${st.daysLeft} days left`);
      return { text: `${v.code} ${sc.title}: ${st.state === "OVERDUE" ? "OVERDUE" : "due soon"} (${parts.join(" / ")})`, link: u("/maintenance") };
    }),
  };
  const complaintsSec: Section = {
    title: "Open complaints", tone: d.openComplaints.some((c) => c.severity === "HIGH") ? "bad" : "warn",
    items: d.openComplaints.sort((a, b) => (a.severity === "HIGH" ? -1 : 0) - (b.severity === "HIGH" ? -1 : 0)).slice(0, 10).map((c) => ({
      text: `[${label(c.severity)}] ${c.description.slice(0, 90)}${c.vehicleId ? ` (${d.vmap.get(c.vehicleId)?.code})` : ""}`, link: u("/complaints"),
    })),
  };
  const garage: Section = {
    title: "Vehicles in the garage", tone: "info",
    items: d.openWO.map((w) => ({ text: `${d.vmap.get(w.vehicleId)?.code}: ${w.title} since ${fmtDate(w.openedAt)}`, link: u("/maintenance") })),
  };
  const money: Section = {
    title: "Money to collect", tone: "warn",
    items: [
      ...(d.invoiced.length ? [{ text: `Clients owe ${mwk(d.invoiced.reduce((a, j) => a + j.rate - j.amountPaid, 0))} on ${d.invoiced.length} haulage invoice(s)`, link: u("/jobs") }] : []),
      ...(() => { const owed = [...d.balances.values()].filter((x) => x > 0); return owed.length ? [{ text: `Drivers owe ${mwk(owed.reduce((a, x) => a + x, 0))} in target shortfalls (${owed.length} drivers)`, link: u("/drivers") }] : []; })(),
    ],
  };
  const approvals: Section = {
    title: "Waiting for your approval", tone: "info",
    items: [
      ...(d.awaiting.length ? [{ text: `${d.awaiting.length} excused day(s) in the ledger`, link: u(`/ledger?date=${d.awaiting[0].date}`) }] : []),
      ...d.drafts.map((r) => ({ text: `Payroll ${r.month} is prepared`, link: u(`/payroll/${r.month}`) })),
    ],
  };
  const openSheet: Section = {
    title: "Today", tone: "info",
    items: d.todayOpened ? [] : [{ text: "Open today's daily target sheet", link: u("/ledger") }],
  };

  if (role === "MANAGER") {
    add(yesterday); add(approvals); add(streaks); add(docSection(d)); add(service); add(complaintsSec); add(money); add(garage);
  } else if (role === "OPERATIONS") {
    add(openSheet); add(yesterday); add(streaks); add(docSection(d)); add(service); add(complaintsSec); add(garage);
  } else if (role === "FINANCE") {
    add(yesterday); add(money);
    add({ title: "Payroll", tone: "info", items: d.drafts.map((r) => ({ text: `Payroll ${r.month} is still a draft (awaiting manager approval)`, link: u(`/payroll/${r.month}`) })) });
    // Remind Finance to prepare payroll from the 25th of the month
    const day = Number(d.t.slice(8, 10));
    if (day >= 25 && !d.drafts.some((r) => r.month === d.t.slice(0, 7))) add({ title: "Payroll", tone: "warn", items: [{ text: `Prepare payroll for ${d.t.slice(0, 7)}`, link: u("/payroll") }] });
  }
  return out;
}

async function driverSections(driverId: string, d: Data): Promise<Section[]> {
  const out: Section[] = [];
  const drv = d.dmap.get(driverId);
  if (!drv) return out;
  const myDocs = d.docAlerts.filter((x) => x.driverId === driverId);
  if (myDocs.length) out.push({ title: "Your documents", tone: myDocs.some((x) => x.daysLeft < 0) ? "bad" : "warn", items: myDocs.map((x) => ({ text: `${label(x.type)} ${x.daysLeft < 0 ? `expired ${-x.daysLeft} days ago, renew now` : `expires in ${x.daysLeft} days`}` })) });
  const bal = d.balances.get(driverId) ?? 0;
  const n = d.streak.get(driverId);
  if (n) out.push({ title: "Daily target", tone: "bad", items: [{ text: `You have been short ${n} days in a row. You owe ${mwk(bal)}.`, link: u("/me") }] });
  else if (bal > 0 && new Date(d.t + "T12:00:00Z").getUTCDay() === 1) out.push({ title: "Balance", tone: "warn", items: [{ text: `Your balance owed is ${mwk(bal)}.`, link: u("/me") }] });
  return out;
}

export type RunResult = { sent: number; skipped: number; failed: number; nothingToSay: number; details: string[] };

/** Sends each active user with reminders switched on a digest for their role. */
export async function runReminders(opts: { onlyUserId?: string } = {}): Promise<RunResult> {
  const d = await gather();
  const people = await db.select().from(users).where(and(eq(users.active, true), eq(users.notify, true), opts.onlyUserId ? eq(users.id, opts.onlyUserId) : undefined));
  const res: RunResult = { sent: 0, skipped: 0, failed: 0, nothingToSay: 0, details: [] };
  for (const p of people) {
    if (p.email.endsWith(".royallink") || !p.email.includes("@")) { res.nothingToSay++; continue; } // demo / placeholder addresses
    const sections = p.role === "DRIVER" ? (p.driverId ? await driverSections(p.driverId, d) : []) : sectionsFor(p.role as Role, d);
    // Managers always get the daily summary; others only when there is something to act on
    if (!sections.length && p.role !== "MANAGER") { res.nothingToSay++; continue; }
    const count = sections.reduce((a, s) => a + s.items.length, 0);
    const subject = p.role === "DRIVER"
      ? `Royal Link: reminder for ${p.name.split(" ")[0]}`
      : `Royal Link daily reminders: ${count} item${count === 1 ? "" : "s"} (${fmtDate(d.t, { day: "numeric", month: "short" })})`;
    const { html, text } = renderEmail({
      heading: `Good morning, ${p.name.split(" ")[0]}`,
      intro: sections.length ? `Here is what needs attention today in Royal Link (${label(p.role)}).` : "All clear today. Nothing needs your attention.",
      sections,
      button: { label: p.role === "DRIVER" ? "Open my day" : "Open Royal Link", url: u(p.role === "DRIVER" ? "/me" : "/") },
      footer: "You get this because reminders are switched on for your account. A manager can turn them off in Settings & users.",
    });
    const r = await sendEmail({ to: p.email, subject, html, text, kind: "reminder", userId: p.id });
    if (r.ok) res.sent++; else if (r.error?.includes("not set up")) res.skipped++; else res.failed++;
    res.details.push(`${p.email}: ${r.ok ? "sent" : r.error}`);
  }
  return res;
}
