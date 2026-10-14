import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payrollRuns } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtMonth, label, mwk } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export default async function SlipsPage({ params }: { params: Promise<{ month: string }> }) {
  await requireRole("FINANCE");
  const { month } = await params;
  const [run, s] = await Promise.all([
    db.query.payrollRuns.findFirst({ where: eq(payrollRuns.month, month), with: { payslips: { with: { staff: true } } } }),
    getSettings(),
  ]);
  if (!run) notFound();
  return (
    <>
      <PageHeader title={`Payslips · ${fmtMonth(month)}`} subtitle={<><Link href={`/payroll/${month}`} className="text-brand-700">Back to payroll</Link> · {label(run.status)}</>} actions={<PrintButton />} />
      <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-1">
        {run.payslips.sort((a, b) => a.staff.fullName.localeCompare(b.staff.fullName)).map((p) => (
          <article key={p.id} className="card break-inside-avoid p-6">
            <div className="flex items-start justify-between border-b border-line pb-3">
              <div><div className="text-[15px] font-extrabold">{s.companyName}</div><div className="text-[12px] text-muted">Payslip · {fmtMonth(month)}</div></div>
              <div className="text-right"><div className="font-bold">{p.staff.fullName}</div><div className="text-[12px] text-muted">{p.staff.jobTitle} · {p.staff.department}</div></div>
            </div>
            <dl className="mt-3 space-y-1.5 text-[14px]">
              {[
                ["Basic salary", p.basic], ["Bonus", p.bonus], ["Allowances", p.allowances],
              ].map(([k, v]) => <div key={k as string} className="flex justify-between"><dt>{k}</dt><dd className="num">{mwk(v as number)}</dd></div>)}
              <div className="flex justify-between border-t border-line pt-1.5 font-bold"><dt>Gross pay</dt><dd className="num">{mwk(p.gross)}</dd></div>
              {[
                ["PAYE", p.paye], ["Pension (employee)", p.pensionEmployee], ["Target shortfall recovered", p.shortfallRecovery], ["Other deductions", p.otherDeductions],
              ].map(([k, v]) => <div key={k as string} className="flex justify-between text-slate-600"><dt>{k}</dt><dd className="num">−{(v as number).toLocaleString()}</dd></div>)}
              <div className="flex justify-between border-t-2 border-ink pt-2 text-[16px] font-extrabold"><dt>Net pay</dt><dd className="num">{mwk(p.net)}</dd></div>
            </dl>
            <div className="mt-3 text-[12px] text-muted">Employer pension contribution: {mwk(p.pensionEmployer)}{p.staff.bankName ? ` · Paid to ${p.staff.bankName} ${p.staff.bankAccount ?? ""}` : ""}</div>
          </article>
        ))}
      </div>
    </>
  );
}
