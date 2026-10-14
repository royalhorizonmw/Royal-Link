import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, activityLog } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { label } from "@/lib/format";
import { Badge, Card, Field, Notice, PageHeader, TableWrap } from "@/components/ui";
import { createUser, resetPassword, saveSettings, toggleUser } from "./actions";

export const metadata = { title: "Settings" };

const MSG: Record<string, string> = {
  user: "Enter a name, an email and a password of at least 8 characters.",
  email: "That email already has an account.",
  self: "You can't disable your own account.",
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

  return (
    <>
      <PageHeader title="Settings & users" subtitle="Manager only" />
      {sp.saved ? <Notice tone="good">{sp.saved === "user" ? "User created." : sp.saved === "password" ? "Password reset." : "Settings saved."}</Notice> : null}
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

      <Card title="Users & roles" pad={false}>
        <div className="border-b border-line px-5 pb-4 text-[13px] text-muted">
          <b className="text-ink">Manager</b>: everything, approvals. <b className="text-ink">Operations</b>: fleet, drivers, daily targets, jobs, maintenance, compliance, complaints. <b className="text-ink">Finance</b>: daily targets, expenses, jobs, payroll, budgets, reports. <b className="text-ink">Driver</b>: own phone portal only (created from the driver&apos;s page).
        </div>
        <TableWrap><table className="data">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Reset password</th><th><span className="sr-only">Enable</span></th></tr></thead>
          <tbody>{people.map((u) => (
            <tr key={u.id}>
              <td className="font-semibold">{u.name}{u.id === me.id ? " (you)" : ""}</td>
              <td>{u.email}</td>
              <td><Badge tone={u.role === "MANAGER" ? "info" : "muted"}>{label(u.role)}</Badge></td>
              <td><Badge tone={u.active ? "good" : "bad"}>{u.active ? "Active" : "Disabled"}</Badge></td>
              <td>
                <form action={resetPassword.bind(null, u.id)} className="flex gap-2">
                  <input className="input !min-h-[34px] !w-[160px] !py-1" name="password" type="text" minLength={8} placeholder="New password" aria-label={`New password for ${u.name}`} />
                  <button className="btn btn-ghost btn-sm">Reset</button>
                </form>
              </td>
              <td>{u.id !== me.id ? <form action={toggleUser.bind(null, u.id)}><button className={`btn btn-sm ${u.active ? "btn-danger" : "btn-ghost"}`}>{u.active ? "Disable" : "Enable"}</button></form> : null}</td>
            </tr>
          ))}</tbody>
        </table></TableWrap>
        <form action={createUser} className="grid gap-3 border-t border-line p-5 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Name"><input className="input" name="name" required /></Field>
          <Field label="Email"><input className="input" name="email" type="email" required /></Field>
          <Field label="Role"><select className="input" name="role"><option value="OPERATIONS">Operations</option><option value="FINANCE">Finance</option><option value="MANAGER">Manager</option></select></Field>
          <Field label="Temporary password"><input className="input" name="password" type="text" minLength={8} required /></Field>
          <div className="flex items-end"><button className="btn btn-primary">Add user</button></div>
        </form>
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
