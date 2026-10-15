import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { driverScores, vehiclePnl } from "@/lib/calc";
import { companyPnl, trend } from "@/lib/reports";
import { fmtMonth, label, monthRange, mwk, thisMonth } from "@/lib/format";
import { Bar, Card, Empty, PageHeader, Stat, TableWrap } from "@/components/ui";
import { MonthPicker } from "@/components/month-picker";
import { PrintButton } from "@/components/print-button";
import { Icon } from "@/components/icons";
import { TrendChart } from "@/components/charts";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireRole("FINANCE");
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : thisMonth();
  const { start, end } = monthRange(month);
  const [pnl, vp, scores, tr] = await Promise.all([companyPnl(month), vehiclePnl(start, end), driverScores(start, end), trend(month)]);
  const margin = pnl.income ? pnl.profit / pnl.income : null;
  // Skip the empty months before the system was in use
  const firstUsed = tr.findIndex((m) => m.income || m.cost);
  const trShown = firstUsed === -1 ? tr.slice(-1) : tr.slice(firstUsed);
  const exp = (type: string) => `/reports/export?type=${type}&month=${month}`;

  return (
    <>
      <PageHeader title={`Reports · ${fmtMonth(month)}`} subtitle="Profit and loss, vehicles and drivers"
        actions={<><MonthPicker month={month} base="/reports" /><PrintButton /></>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Income" value={mwk(pnl.income)} tone="brand" />
        <Stat label="Costs" value={mwk(pnl.totalCost)} />
        <Stat label="Net profit" value={mwk(pnl.profit)} tone={pnl.profit >= 0 ? "good" : "bad"} />
        <Stat label="Profit margin" value={margin == null ? "—" : `${Math.round(margin * 100)}%`} />
      </div>

      <Card title={trShown.length > 1 ? `Last ${trShown.length} months` : "This month"}>
        {trShown.some((m) => m.income || m.cost) ? <TrendChart data={trShown} /> : (
          <Empty title="No income or costs recorded yet">The trend fills in month by month as the ledger, jobs and expenses are used.</Empty>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <Card title="Profit & loss" action={<a className="text-[13px] font-bold text-brand-700" href={exp("pnl")}><Icon name="download" size={14} className="mr-1 inline" />CSV</a>}>
          <dl className="text-[14px]">
            <div className="flex justify-between py-1.5"><dt>Daily target income</dt><dd className="num">{mwk(pnl.targetIncome)}</dd></div>
            <div className="flex justify-between py-1.5"><dt>Haulage jobs (delivered)</dt><dd className="num">{mwk(pnl.jobIncome)}</dd></div>
            <div className="flex justify-between border-t border-line py-2 font-bold"><dt>Total income</dt><dd className="num">{mwk(pnl.income)}</dd></div>
            {pnl.costs.map(([c, v]) => <div key={c} className="flex justify-between py-1.5 text-slate-700"><dt>{label(c)}</dt><dd className="num">−{v.toLocaleString()}</dd></div>)}
            <div className="flex justify-between border-t border-line py-2 font-bold"><dt>Total costs</dt><dd className="num">{mwk(pnl.totalCost)}</dd></div>
            <div className={`flex justify-between border-t-2 border-ink pt-2 text-[17px] font-extrabold ${pnl.profit >= 0 ? "text-good" : "text-bad"}`}><dt>Net profit</dt><dd className="num">{mwk(pnl.profit)}</dd></div>
          </dl>
        </Card>

        <Card title="By vehicle" pad={false} action={<a className="text-[13px] font-bold text-brand-700" href={exp("vehicles")}><Icon name="download" size={14} className="mr-1 inline" />CSV</a>}>
          <TableWrap><table className="data">
            <thead><tr><th>Vehicle</th><th>Target income</th><th>Job income</th><th>Costs</th><th>Profit</th><th>Target hit</th></tr></thead>
            <tbody>{vp.map((r) => (
              <tr key={r.vehicle.id}>
                <td><Link className="font-bold text-brand-700" href={`/vehicles/${r.vehicle.id}`}>{r.vehicle.code}</Link></td>
                <td className="num">{mwk(r.targetIncome)}</td><td className="num">{mwk(r.jobIncome)}</td><td className="num">{mwk(r.cost)}</td>
                <td className={`num font-bold ${r.profit >= 0 ? "text-good" : "text-bad"}`}>{mwk(r.profit)}</td>
                <td><Bar value={r.hit} /></td>
              </tr>
            ))}</tbody>
          </table></TableWrap>
        </Card>
      </div>

      <Card title="Driver performance" pad={false} action={<a className="text-[13px] font-bold text-brand-700" href={exp("drivers")}><Icon name="download" size={14} className="mr-1 inline" />CSV</a>}>
        <TableWrap><table className="data">
          <thead><tr><th>#</th><th>Driver</th><th>Score</th><th>Grade</th><th>Targets (60)</th><th>Complaints (25)</th><th>Licences (15)</th><th>Working days</th><th>Short days</th></tr></thead>
          <tbody>{scores.map((s, i) => (
            <tr key={s.driver.id}>
              <td className="num text-muted">{i + 1}</td>
              <td><Link className="font-semibold text-brand-700" href={`/drivers/${s.driver.id}`}>{s.driver.fullName}</Link></td>
              <td className="num font-extrabold">{s.score.total}</td>
              <td><span className={`font-bold ${s.score.grade === "A" ? "text-good" : s.score.grade === "B" ? "text-ink" : "text-bad"}`}>{s.score.grade}</span></td>
              <td className="num">{s.score.target}</td><td className="num">{s.score.complaints}</td><td className="num">{s.score.documents}</td>
              <td className="num">{s.expectedDays}</td><td className="num">{s.shortDays}</td>
            </tr>
          ))}</tbody>
        </table></TableWrap>
      </Card>
      <div className="no-print text-[13px] text-muted">More exports: <a className="font-semibold text-brand-700" href={exp("ledger")}>daily target ledger (CSV)</a> · <a className="font-semibold text-brand-700" href={exp("expenses")}>expenses (CSV)</a></div>
    </>
  );
}
