import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, activityLog, emailLog } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { label } from "@/lib/format";
import { Badge, Card, Field, Notice, PageHeader, TableWrap } from "@/components/ui";
import { createUser, inviteAllPending, resetPassword, saveSettings, sendInvite, sendRemindersNow, toggleNotify, toggleUser } from "./actions";

export const metadata = { title: "Settings" };

const MSG: Record<string, string> = {
  user: "Enter a name, an email and a password of at least 8 characters.",
  email: "That email already has an account.",
  self: "You can't disable your own account.",
  mail: "The email could not be sent. Email isn't connected yet, or the address bounced. See 'Emails sent' below. You can use 'Set manually' to give a temporary password in person.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireRole();
  const sp = await searchParams;
  const [s, people, log] = await Promise.all([
    getSettings(),
    db.select().from(users).orderBy(asc(users.role), asc(users.name)),
    db.select({ a: activityLog, name: users.name }).from(activityLog).leftJoin(users, eq(users.id, activityLog.userId)).orderBy(desc(activityLog.createdAt)).limit(40),
  ]);
  const bands = [...s.payeBands, ...Array(Math.max(0, 5 - s.payeBands.length)).fill(null)];
  const mails = await db.select().from(emailLog).orderBy(desc(emailLog.createdAt)).limit(25);
  const emailReady = !!process.env.RESEND_API_KEY;
  const pendingCount = people.filter((u) => u.active && !u.lastLoginAt && u.id !== me.id && !u.email.endsWith(".royallink")).length;
  const saved = sp.saved ?? "";
  const savedMsg = saved === "user" ? "User created."
    : saved === "password" ? "Temporary password set. They must choose their own at next sign-in."
    : saved === "invited" ? "Login details emailed."
    : saved.startsWith("invited-") ? `Login details emailed to ${saved.split("-")[1]} people.`
    : saved.startsWith("reminders-") ? `Reminders sent: ${saved.split("-")[1]}${saved.split("-")[2] !== "0" ? `, failed: ${saved.split("-")[2]}` : ""}.`
    : "Settings saved.";

  return (
    <>
      <PageHeader title="Settings & users" subtitle="Manager only" />
      {sp.saved ? <Notice tone="good">{savedMsg}</Notice> : null}
      {sp.error ? <Notice tone="bad">{MSG[sp.error] ?? "Something went wrong."}</Notice> : null}

      <form action={saveSettings} className="grid gap-5 xl:grid-cols-2">
        <Card title="Company & operations rules">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" className="sm:col-span-2"><input className="input" name="companyName" defaultValue={s.companyName} /></Field>
            <Field label="Starter fuel for new drivers (litres)"><input className="input num" name="starterFuelLitres" defaultValue={s.starterFuelLitres} inputMode="decimal" /></Field>
            <Field label="Rest days allowed per week"><input className="input num" name="restDaysPerWeek" defaultValue={s.restDaysPerWeek} inputMode="numeric" /></Field>
            <Field label="Alert after this many short days in a row"><input className="input num" name="shortStreakAlert" defaultValue={s.shortStreakAlert} inputMode="numeric" /></Field>
            <Field label="Warn this many days before a document expires"><input className="input num" name="complianceWarnDays" defaultValue={s.complianceWarnDays} inputMode="numeric" /></Field>
            <Field label="How drivers pay (shown in the driver app)" className="sm:col-span-2" hint="Put your Airtel Money and TNM Mpamba merchant numbers here">
              <textarea className="input min-h-[70px]" name="paymentInstructions" defaultValue={s.paymentInstructions} />
            </Field>
          </div>
        </Card>
        <Card title="Payroll tax & pension">
          <p className="mb-3 text-[13px] text-muted">Monthly PAYE bands. Leave the last &quot;up to&quot; blank for &quot;and above&quot;. Confirm current bands with the Malawi Revenue Authority.</p>
          <div className="grid grid-cols-[1fr_120px] gap-2 text-[12px] font-semibold text-muted"><span>Taxable pay up to (MWK)</span><span>Rate %</span></div>
          {bands.map((b, i) => (
            <div key={i} className="mt-2 grid grid-cols-[1fr_120px] gap-2">
              <input className="input num" name={`upTo${i}`} defaultValue={b?.upTo ?? ""} inputMode="numeric" aria-label={`Band ${i + 1} upper limit`} placeholder={b ? "and above" : ""} />
              <input className="input num" name={`rate${i}`} defaultValue={b ? Math.round(b.rate * 1000) / 10 : ""} inputMode="decimal" aria-label={`Band ${i + 1} rate`} />
            </div>
          ))}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Employee pension % of basic"><input className="input num" name="pensionEmployeeRate" defaultValue={s.pensionEmployeeRate * 100} inputMode="decimal" /></Field>
            <Field label="Employer pension % of basic"><input className="input num" name="pensionEmployerRate" defaultValue={s.pensionEmployerRate * 100} inputMode="decimal" /></Field>
          </div>
        </Card>
        <div className="xl:col-span-2"><button className="btn btn-primary">Save settings</button></div>
      </form>

      <Card title="Email reminders" action={<Badge tone={emailReady ? "good" : "warn"}>{emailReady ? "Email connected" : "Email not connected yet"}</Badge>}>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="space-y-1.5 text-[14px] text-slate-700">
            <p>Every morning at <b>06:00</b> each person gets an email about what needs their attention:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><b>Manager</b>: yesterday&apos;s collections, approvals waiting, short streaks, expiring documents, maintenance, complaints, money owed.</li>
              <li><b>Operations</b>: open today&apos;s sheet, short streaks, expiring documents, maintenance due, complaints, vehicles in the garage.</li>
              <li><b>Finance</b>: yesterday&apos;s collections and unclosed days, money owed, payroll (from the 25th).</li>
              <li><b>Drivers</b> (with a real email): their own licence expiry, short-day streak, and a Monday balance reminder.</li>
            </ul>
            <p className="text-[12px] text-muted">People only get an email when there is something to act on; managers always get the daily summary.</p>
          </div>
          <div className="flex flex-col gap-2 lg:w-[230px]">
            <form action={sendRemindersNow.bind(null, true)}><button className="btn btn-ghost w-full">Send me a test now</button></form>
            <form action={sendRemindersNow.bind(null, false)}><button className="btn btn-primary w-full">Send today&apos;s reminders to all</button></form>
          </div>
        </div>
        {!emailReady ? <div className="mt-4"><Notice tone="warn">Emails can&apos;t go out until an email service is connected (RESEND_API_KEY in the hosting settings). Until then, attempts are listed below as &quot;skipped&quot;.</Notice></div> : null}
      </Card>

      <Card title="Users & roles" pad={false} action={pendingCount ? <form action={inviteAllPending}><button className="btn btn-primary btn-sm">Email login details to {pendingCount} who haven&apos;t signed in</button></form> : null}>
        <div className="border-b border-line px-5 pb-4 text-[13px] text-muted">
          <b className="text-ink">Manager</b>: everything, approvals. <b className="text-ink">Operations</b>: fleet, drivers, daily targets, jobs, maintenance, compliance, complaints. <b className="text-ink">Finance</b>: daily targets, expenses, jobs, payroll, budgets, reports. <b className="text-ink">Driver</b>: own phone portal only (created from the driver&apos;s page).
          <div className="mt-1">New people get an email with <b>their own</b> temporary password and must choose a new one when they first sign in.</div>
        </div>
        <TableWrap><table className="data">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Reminders</th><th>Login details</th><th><span className="sr-only">Enable</span></th></tr></thead>
          <tbody>{people.map((u) => (
            <tr key={u.id}>
              <td className="font-semibold">{u.name}{u.id === me.id ? " (you)" : ""}</td>
              <td>{u.email}</td>
              <td><Badge tone={u.role === "MANAGER" ? "info" : "muted"}>{label(u.role)}</Badge></td>
              <td><Badge tone={u.active ? "good" : "bad"}>{u.active ? "Active" : "Disabled"}</Badge>{u.mustChangePassword ? <div className="mt-1 text-[11px] text-warn">Must set own password</div> : null}</td>
              <td className="text-muted">{u.lastLoginAt ? u.lastLoginAt.toLocaleDateString("en-GB", { timeZone: "Africa/Blantyre", day: "numeric", month: "short" }) : "Never"}</td>
              <td><form action={toggleNotify.bind(null, u.id)}><button className={`btn btn-sm ${u.notify ? "btn-ghost" : "btn-danger"}`} aria-label={`Turn reminders ${u.notify ? "off" : "on"} for ${u.name}`}>{u.notify ? "On" : "Off"}</button></form></td>
              <td>
                <div className="flex flex-wrap items-center gap-2">
                  {u.id !== me.id ? <form action={sendInvite.bind(null, u.id)}><button className="btn btn-ghost btn-sm">Email temporary password</button></form> : null}
                  <details>
                    <summary className="text-[12px] font-semibold text-brand-700">Set manually</summary>
                    <form action={resetPassword.bind(null, u.id)} className="mt-2 flex gap-2">
                      <input className="input !min-h-[34px] !w-[150px] !py-1" name="password" type="text" minLength={8} placeholder="Temporary password" aria-label={`Temporary password for ${u.name}`} />
                      <button className="btn btn-ghost btn-sm">Set</button>
                    </form>
                  </details>
                </div>
              </td>
              <td>{u.id !== me.id ? <form action={toggleUser.bind(null, u.id)}><button className={`btn btn-sm ${u.active ? "btn-danger" : "btn-ghost"}`}>{u.active ? "Disable" : "Enable"}</button></form> : null}</td>
            </tr>
          ))}</tbody>
        </table></TableWrap>
        <form action={createUser} className="grid gap-3 border-t border-line p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name"><input className="input" name="name" required /></Field>
          <Field label="Email"><input className="input" name="email" type="email" required /></Field>
          <Field label="Role"><select className="input" name="role"><option value="OPERATIONS">Operations</option><option value="FINANCE">Finance</option><option value="MANAGER">Manager</option></select></Field>
          <div className="flex items-end"><button className="btn btn-primary w-full">Add and email login details</button></div>
        </form>
      </Card>

      <Card title="Emails sent" pad={false}>
        {mails.length === 0 ? <div className="px-5 pb-5 text-[14px] text-muted">No emails yet.</div> : (
          <TableWrap><table className="data">
            <thead><tr><th>When</th><th>To</th><th>Type</th><th>Subject</th><th>Result</th></tr></thead>
            <tbody>{mails.map((m) => (
              <tr key={m.id}>
                <td>{m.createdAt.toLocaleString("en-GB", { timeZone: "Africa/Blantyre", dateStyle: "medium", timeStyle: "short" })}</td>
                <td>{m.toEmail}</td>
                <td>{label(m.kind)}</td>
                <td className="max-w-[300px] truncate">{m.subject}</td>
                <td><Badge tone={m.status === "sent" ? "good" : m.status === "failed" ? "bad" : "warn"}>{label(m.status)}</Badge>{m.error && m.status === "failed" ? <div className="max-w-[260px] truncate text-[11px] text-muted">{m.error}</div> : null}</td>
              </tr>
            ))}</tbody>
          </table></TableWrap>
        )}
      </Card>

      <Card title="Recent activity" pad={false}>
        <TableWrap><table className="data">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>{log.map(({ a, name }) => (
            <tr key={a.id}><td>{a.createdAt.toLocaleString("en-GB", { timeZone: "Africa/Blantyre", dateStyle: "medium", timeStyle: "short" })}</td><td>{name ?? "—"}</td><td>{a.action}</td><td className="max-w-[360px] truncate text-muted">{a.detail ?? ""}</td></tr>
          ))}</tbody>
        </table></TableWrap>
      </Card>
    </>
  );
}
