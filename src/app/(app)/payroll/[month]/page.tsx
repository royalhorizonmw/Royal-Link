import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payrollRuns } from "@/db/schema";
import { requireUser, requireRole } from "@/lib/auth";
import { driverBalances, driverScores } from "@/lib/calc";
import { fmtMonth, label, monthRange, mwk } from "@/lib/format";
import { Badge, Card, Notice, PageHeader, Stat, TableWrap, statusTone } from "@/components/ui";
import { approveRun, markRunPaid, recalcRun, reopenRun, updatePayslip } from "../actions";

export default async function RunPage({ params }: { params: Promise<{ month: string }> }) {
  await requireRole("FINANCE");
  const user = await requireUser();
  const { month } = await params;
  const run = await db.query.payrollRuns.findFirst({
    where: eq(payrollRuns.month, month),
    with: { payslips: { with: { staff: true } } },
  });
  if (!run) notFound();
  const { start, end } = monthRange(month);
  const driverIds = run.payslips.map((p) => p.staff.driverId).filter(Boolean) as string[];
  const [balances, scores] = await Promise.all([
    driverIds.length ? driverBalances(driverIds) : Promise.resolve(new Map<string, number>()),
    driverScores(start, end),
  ]);
  const slips = [...run.payslips].sort((a, b) => a.staff.fullName.localeCompare(b.staff.fullName));
  const sum = (k: keyof (typeof slips)[number]) => slips.reduce((s, p) => s + (Number(p[k]) || 0), 0);
  const draft = run.status === "DRAFT";
  const isManager = user.role === "MANAGER";

  return (
    <>
      <PageHeader
        title={`Payroll · ${fmtMonth(month)}`}
        subtitle={<><Link href="/payroll" className="text-brand-700">Payroll & HR</Link> · <Badge tone={statusTone(run.status)}>{label(run.status)}</Badge></>}
        actions={
          <>
            {draft ? <form action={recalcRun.bind(null, month)}><button className="btn btn-ghost">Recalculate tax</button></form> : null}
            {draft && isManager ? <form action={approveRun.bind(null, month)}><button className="btn btn-primary">Approve payroll</button></form> : null}
            {run.status === "APPROVED" ? <form action={markRunPaid.bind(null, month)}><button className="btn btn-primary">Mark as paid</button></form> : null}
            {!draft && isManager ? <form action={reopenRun.bind(null, month)}><button className="btn btn-danger">Reopen</button></form> : null}
            <Link className="btn btn-ghost" href={`/payroll/${month}/slips`}>Payslips (print)</Link>
          </>
        }
      />
      {draft && !isManager ? <Notice tone="info">Prepared by Finance. A manager approves it, which books salaries into expenses and deducts the recovered shortfalls from each driver&apos;s balance.</Notice> : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Gross pay" value={mwk(sum("gross"))} />
        <Stat label="PAYE" value={mwk(sum("paye"))} />
        <Stat label="Pension (employee + employer)" value={mwk(sum("pensionEmployee") + sum("pensionEmployer"))} />
        <Stat label="Shortfalls recovered" value={mwk(sum("shortfallRecovery"))} tone="good" />
        <Stat label="Net to pay" value={mwk(sum("net"))} tone="brand" />
      </div>

      <Card pad={false}>
        <TableWrap><table className="data">
          <thead><tr><th>Staff</th><th>Score</th><th>Basic</th><th>Bonus</th><th>Allowances</th><th>Shortfall recovery</th><th>Other ded.</th><th>Gross</th><th>PAYE</th><th>Pension</th><th>Net</th>{draft ? <th><span className="sr-only">Save</span></th> : null}</tr></thead>
          <tbody>
            {slips.map((p) => {
              const bal = p.staff.driverId ? balances.get(p.staff.driverId) ?? 0 : 0;
              const sc = p.staff.driverId ? scores.find((x) => x.driver.id === p.staff.driverId) : undefined;
              const formId = `f-${p.id}`;
              const inp = (name: string, val: number, w = "!w-[105px]") => draft
                ? <input form={formId} className={`input num !min-h-[34px] ${w} !py-1`} name={name} defaultValue={val} inputMode="numeric" aria-label={`${name} for ${p.staff.fullName}`} />
                : <span className="num">{mwk(val)}</span>;
              return (
                <tr key={p.id}>
                  <td><div className="font-semibold">{p.staff.fullName}</div><div className="text-[12px] text-muted">{p.staff.jobTitle}</div></td>
                  <td>{sc ? <Badge tone={sc.score.grade === "A" ? "good" : sc.score.grade === "B" ? "warn" : "bad"}>{sc.score.total} · {sc.score.grade}</Badge> : <span className="text-muted">—</span>}</td>
                  <td>{inp("basic", p.basic, "!w-[115px]")}</td>
                  <td>{inp("bonus", p.bonus)}</td>
                  <td>{inp("allowances", p.allowances)}</td>
                  <td>{inp("shortfallRecovery", p.shortfallRecovery)}{p.staff.driverId && draft ? <div className="mt-1 text-[11px] text-bad">Owes {mwk(bal)}</div> : null}</td>
                  <td>{inp("otherDeductions", p.otherDeductions)}</td>
                  <td className="num">{mwk(p.gross)}</td>
                  <td className="num">{mwk(p.paye)}</td>
                  <td className="num">{mwk(p.pensionEmployee)}</td>
                  <td className="num font-bold">{mwk(p.net)}</td>
                  {draft ? <td><form id={formId} action={updatePayslip.bind(null, p.id, month)}><button className="btn btn-ghost btn-sm">Save</button></form></td> : null}
                </tr>
              );
            })}
          </tbody>
        </table></TableWrap>
      </Card>
      <p className="text-[12px] text-muted">Employee pension is taken off before PAYE. Employer pension ({mwk(sum("pensionEmployer"))}) is a company cost and is booked with salaries when approved.</p>
    </>
  );
}
