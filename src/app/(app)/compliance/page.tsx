import { asc, ne } from "drizzle-orm";
import { db } from "@/db";
import { complianceDocs, vehicles, drivers } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { docState } from "@/lib/calc";
import { getSettings } from "@/lib/settings";
import { addDays, fmtDate, label } from "@/lib/format";
import { AddPanel, Badge, Card, Empty, Field, Notice, PageHeader, Stat, TableWrap, statusTone } from "@/components/ui";
import { createDoc, deleteDoc, renewDoc } from "./actions";

export const metadata = { title: "Compliance" };

const TYPES = ["COF", "INSURANCE", "ROAD_LICENCE", "OPERATOR_PERMIT", "DRIVING_LICENCE", "PSV_LICENCE", "OTHER"] as const;

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("OPERATIONS");
  const sp = await searchParams;
  const [docs, vs, ds, settings] = await Promise.all([
    db.select().from(complianceDocs).orderBy(asc(complianceDocs.expiryDate)),
    db.select().from(vehicles).where(ne(vehicles.status, "DISPOSED")).orderBy(asc(vehicles.code)),
    db.select().from(drivers).where(ne(drivers.status, "LEFT")).orderBy(asc(drivers.fullName)),
    getSettings(),
  ]);
  const rows = docs.map((d) => ({ d, st: docState(d.expiryDate, settings.complianceWarnDays) }));
  const expired = rows.filter((r) => r.st.state === "OVERDUE").length;
  const soon = rows.filter((r) => r.st.state === "DUE_SOON").length;
  // Vehicles missing key documents
  const missing = vs.flatMap((v) => (["COF", "INSURANCE", "ROAD_LICENCE"] as const)
    .filter((t) => !docs.some((d) => d.vehicleId === v.id && d.type === t))
    .map((t) => `${v.code}: ${label(t)}`));

  return (
    <>
      <PageHeader title="Compliance" subtitle={`Alerts start ${settings.complianceWarnDays} days before expiry`} />
      {sp.error ? <Notice tone="bad">Choose who the document belongs to and its expiry date.</Notice> : null}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Expired" value={String(expired)} tone={expired ? "bad" : "good"} />
        <Stat label={`Expiring in ${settings.complianceWarnDays} days`} value={String(soon)} tone={soon ? "warn" : "good"} />
        <Stat label="Documents on file" value={String(docs.length)} />
        <Stat label="Missing vehicle documents" value={String(missing.length)} tone={missing.length ? "warn" : "good"} />
      </div>
      {missing.length ? <Notice tone="warn">Not on file yet: {missing.join(" · ")}</Notice> : null}

      <AddPanel title="Add document">
        <form action={createDoc} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Document"><select className="input" name="type">{TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></Field>
          <Field label="Belongs to">
            <select className="input" name="owner" required>
              <optgroup label="Vehicles">{vs.map((v) => <option key={v.id} value={`v:${v.id}`}>{v.code} · {v.regNumber}</option>)}</optgroup>
              <optgroup label="Drivers">{ds.map((d) => <option key={d.id} value={`d:${d.id}`}>{d.fullName}</option>)}</optgroup>
            </select>
          </Field>
          <Field label="Number"><input className="input" name="number" /></Field>
          <Field label="Issued by"><input className="input" name="issuer" placeholder="e.g. DRTSS, insurer" /></Field>
          <Field label="Issue date"><input className="input" type="date" name="issueDate" /></Field>
          <Field label="Expiry date"><input className="input" type="date" name="expiryDate" required /></Field>
          <Field label="Cost (MWK)" hint="Added to expenses"><input className="input num" name="cost" inputMode="numeric" /></Field>
          <Field label="Notes"><input className="input" name="notes" /></Field>
          <div className="sm:col-span-2 lg:col-span-4"><button className="btn btn-primary">Add document</button></div>
        </form>
      </AddPanel>

      <Card pad={false}>
        {rows.length === 0 ? <Empty title="No documents yet" /> : (
          <TableWrap><table className="data">
            <thead><tr><th>Days left</th><th>Document</th><th>Belongs to</th><th>Number</th><th>Expires</th><th>Renew</th><th><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>{rows.map(({ d, st }) => {
              const v = vs.find((x) => x.id === d.vehicleId);
              const dr = ds.find((x) => x.id === d.driverId);
              return (
                <tr key={d.id}>
                  <td><Badge tone={statusTone(st.state)}>{st.daysLeft < 0 ? `Expired ${-st.daysLeft} d ago` : `${st.daysLeft} days`}</Badge></td>
                  <td className="font-semibold">{label(d.type)}</td>
                  <td>{v ? v.code : dr ? dr.fullName : "—"}</td>
                  <td>{d.number ?? "—"}</td>
                  <td>{fmtDate(d.expiryDate)}</td>
                  <td>
                    <form action={renewDoc.bind(null, d.id)} className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`e-${d.id}`}>New expiry</label>
                      <input id={`e-${d.id}`} className="input !min-h-[34px] !w-[150px] !py-1" type="date" name="expiryDate" defaultValue={addDays(d.expiryDate, 365)} />
                      <input className="input num !min-h-[34px] !w-[110px] !py-1" name="cost" placeholder="Cost" inputMode="numeric" aria-label="Renewal cost" />
                      <button className="btn btn-ghost btn-sm">Renew</button>
                    </form>
                  </td>
                  <td><form action={deleteDoc.bind(null, d.id)}><button className="btn btn-ghost btn-sm">Remove</button></form></td>
                </tr>
              );
            })}</tbody>
          </table></TableWrap>
        )}
      </Card>
    </>
  );
}
