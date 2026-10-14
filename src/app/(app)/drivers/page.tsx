import Link from "next/link";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { drivers, vehicles, complianceDocs } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { docState, driverBalances, driverScores } from "@/lib/calc";
import { getSettings } from "@/lib/settings";
import { fmtDate, label, monthRange, mwk, thisMonth } from "@/lib/format";
import { AddPanel, Badge, Card, Empty, Field, Notice, PageHeader, TableWrap, statusTone } from "@/components/ui";
import { createDriver } from "./actions";

export const metadata = { title: "Drivers" };

export default async function DriversPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireRole("OPERATIONS", "FINANCE");
  const sp = await searchParams;
  const { start, end } = monthRange(thisMonth());
  const [ds, vs, balances, scores, docs, settings] = await Promise.all([
    db.select().from(drivers).orderBy(asc(drivers.fullName)),
    db.select().from(vehicles).orderBy(asc(vehicles.code)),
    driverBalances(),
    driverScores(start, end),
    db.select().from(complianceDocs).where(inArray(complianceDocs.type, ["DRIVING_LICENCE", "PSV_LICENCE"])),
    getSettings(),
  ]);
  const canEdit = user.role !== "FINANCE";

  return (
    <>
      <PageHeader title="Drivers" subtitle={`${ds.filter((d) => d.status === "ACTIVE").length} active · scores for this month`} />
      {sp.error ? <Notice tone="bad">Name and phone number are required.</Notice> : null}
      {canEdit ? (
        <AddPanel title="Add driver">
          <form action={createDriver} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Full name"><input className="input" name="fullName" required /></Field>
            <Field label="Phone"><input className="input" name="phone" inputMode="tel" required /></Field>
            <Field label="National ID"><input className="input" name="nationalId" /></Field>
            <Field label="Start date"><input className="input" type="date" name="startDate" /></Field>
            <Field label="Driving licence no."><input className="input" name="licenceNumber" /></Field>
            <Field label="Licence expiry"><input className="input" type="date" name="licenceExpiry" /></Field>
            <Field label="PSV licence expiry"><input className="input" type="date" name="psvExpiry" /></Field>
            <Field label="Assign vehicle">
              <select className="input" name="vehicleId" defaultValue="">
                <option value="">Not yet</option>
                {vs.filter((v) => v.status !== "DISPOSED").map((v) => <option key={v.id} value={v.id}>{v.code} · {v.regNumber}</option>)}
              </select>
            </Field>
            <Field label="Guarantor name"><input className="input" name="guarantorName" /></Field>
            <Field label="Guarantor phone"><input className="input" name="guarantorPhone" inputMode="tel" /></Field>
            <Field label="Address"><input className="input" name="address" /></Field>
            <Field label={`Starter fuel cost (${settings.starterFuelLitres} L, MWK)`} hint="Recorded as an onboarding expense"><input className="input num" name="starterFuelCost" inputMode="numeric" /></Field>
            <Field label="Notes" className="sm:col-span-2 lg:col-span-4"><textarea className="input min-h-[60px]" name="notes" /></Field>
            <div className="sm:col-span-2 lg:col-span-4"><button className="btn btn-primary">Add driver</button></div>
          </form>
        </AddPanel>
      ) : null}

      <Card pad={false}>
        {ds.length === 0 ? <Empty title="No drivers yet" /> : (
          <TableWrap><table className="data">
            <thead><tr><th>Driver</th><th>Phone</th><th>Vehicle</th><th>Status</th><th>Owes</th><th>Score</th><th>Short days</th><th>Complaints</th><th>Licence</th></tr></thead>
            <tbody>
              {ds.map((d) => {
                const v = vs.find((x) => x.id === d.vehicleId);
                const bal = balances.get(d.id) ?? 0;
                const sc = scores.find((x) => x.driver.id === d.id);
                const lic = docs.filter((x) => x.driverId === d.id).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0];
                const ls = lic ? docState(lic.expiryDate, settings.complianceWarnDays) : null;
                return (
                  <tr key={d.id}>
                    <td><Link href={`/drivers/${d.id}`} className="font-bold text-brand-700">{d.fullName}</Link></td>
                    <td>{d.phone}</td>
                    <td>{v ? v.code : <span className="text-muted">—</span>}</td>
                    <td><Badge tone={statusTone(d.status)}>{label(d.status)}</Badge></td>
                    <td className={`num font-semibold ${bal > 0 ? "text-bad" : "text-muted"}`}>{bal > 0 ? mwk(bal) : "—"}</td>
                    <td>{sc ? <span className={`num font-extrabold ${sc.score.total >= 85 ? "text-good" : sc.score.total >= 70 ? "text-ink" : "text-bad"}`}>{sc.score.total} <span className="text-[12px] font-semibold text-muted">· {sc.score.grade}</span></span> : "—"}</td>
                    <td className="num">{sc?.shortDays ?? 0}</td>
                    <td className="num">{sc?.complaintCount ?? 0}</td>
                    <td>{ls ? <Badge tone={statusTone(ls.state)}>{ls.daysLeft < 0 ? "Expired" : fmtDate(lic!.expiryDate)}</Badge> : <span className="text-muted">Not on file</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></TableWrap>
        )}
      </Card>
      <p className="text-[12px] text-muted">Score out of 100: target compliance 60, complaints 25 (−10 high, −5 medium, −2 low), valid licences 15. Grades: A 85+, B 70+, C 55+, D below.</p>
    </>
  );
}
