import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { drivers } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { vehiclePnl } from "@/lib/calc";
import { label, monthRange, mwk, thisMonth } from "@/lib/format";
import { AddPanel, Badge, Bar, Card, Empty, Notice, PageHeader, TableWrap, statusTone } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { createVehicle } from "./actions";

export const metadata = { title: "Fleet" };

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireRole("OPERATIONS", "FINANCE");
  const sp = await searchParams;
  const { start, end } = monthRange(thisMonth());
  const [pnl, ds] = await Promise.all([vehiclePnl(start, end), db.select().from(drivers).orderBy(asc(drivers.fullName))]);
  const canEdit = user.role !== "FINANCE";

  return (
    <>
      <PageHeader title="Fleet" subtitle={`${pnl.length} vehicles · figures for this month`} />
      {sp.error ? <Notice tone="bad">Fleet code and registration number are required.</Notice> : null}
      {canEdit ? <AddPanel title="Add vehicle"><VehicleForm action={createVehicle} submit="Add vehicle" /></AddPanel> : null}
      <Card pad={false}>
        {pnl.length === 0 ? <Empty title="No vehicles yet">Add your first bus or lorry above.</Empty> : (
          <TableWrap>
            <table className="data">
              <thead><tr><th>Vehicle</th><th>Reg.</th><th>Type</th><th>Earns by</th><th>Target</th><th>Driver</th><th>Status</th><th>Income</th><th>Costs</th><th>Profit</th><th>Target hit</th></tr></thead>
              <tbody>
                {pnl.map(({ vehicle: v, income, cost, profit, hit }) => {
                  const drv = ds.find((d) => d.vehicleId === v.id && d.status === "ACTIVE");
                  return (
                    <tr key={v.id}>
                      <td><Link className="font-bold text-brand-700" href={`/vehicles/${v.id}`}>{v.code}</Link></td>
                      <td>{v.regNumber}</td>
                      <td className="text-muted">{label(v.type)}</td>
                      <td>{label(v.earningMode)}</td>
                      <td className="num">{v.earningMode === "PER_JOB" ? "—" : <>{mwk(v.dailyTarget)}<span className="text-[11px] text-muted"> /{v.targetPeriod === "WEEK" ? "week" : "day"}</span></>}</td>
                      <td>{drv ? <Link href={`/drivers/${drv.id}`} className="text-brand-700">{drv.fullName}</Link> : <span className="text-muted">Unassigned</span>}</td>
                      <td><Badge tone={statusTone(v.status)}>{label(v.status)}</Badge></td>
                      <td className="num">{mwk(income)}</td>
                      <td className="num">{mwk(cost)}</td>
                      <td className={`num font-bold ${profit >= 0 ? "text-good" : "text-bad"}`}>{mwk(profit)}</td>
                      <td><Bar value={hit} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
