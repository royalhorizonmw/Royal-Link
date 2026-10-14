import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { haulageJobs, vehicles, drivers } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, label, mwk } from "@/lib/format";
import { Badge, Card, Field, PageHeader, statusTone } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { recordJobPayment, setJobStatus } from "../actions";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("OPERATIONS", "FINANCE");
  const { id } = await params;
  const j = await db.query.haulageJobs.findFirst({ where: eq(haulageJobs.id, id) });
  if (!j) notFound();
  const [v, d, s] = await Promise.all([
    db.query.vehicles.findFirst({ where: eq(vehicles.id, j.vehicleId) }),
    j.driverId ? db.query.drivers.findFirst({ where: eq(drivers.id, j.driverId) }) : Promise.resolve(undefined),
    getSettings(),
  ]);
  const next: Record<string, { to: "IN_TRANSIT" | "DELIVERED" | "INVOICED"; text: string } | null> = {
    QUOTED: { to: "IN_TRANSIT", text: "Start trip" },
    IN_TRANSIT: { to: "DELIVERED", text: "Mark delivered" },
    DELIVERED: { to: "INVOICED", text: "Mark invoiced" },
    INVOICED: null, PAID: null, CANCELLED: null,
  };
  const step = next[j.status];
  const balance = j.rate - j.amountPaid;

  return (
    <>
      <PageHeader
        title={`Waybill ${j.waybillNo}`}
        subtitle={<><Link href="/jobs" className="text-brand-700">Haulage jobs</Link> · {fmtDate(j.date)}</>}
        actions={
          <>
            {step ? <form action={setJobStatus.bind(null, id, step.to)}><button className="btn btn-primary">{step.text}</button></form> : null}
            {!["PAID", "CANCELLED"].includes(j.status) ? <form action={setJobStatus.bind(null, id, "CANCELLED")}><button className="btn btn-danger">Cancel job</button></form> : null}
            <PrintButton />
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="text-[18px] font-extrabold">{s.companyName}</div>
            <div className="text-[13px] text-muted">A branch of Royal Horizon Limited · royalhorizonmw.com</div>
          </div>
          <div className="text-right">
            <div className="text-[13px] text-muted">Waybill / Invoice</div>
            <div className="text-[20px] font-extrabold">{j.waybillNo}</div>
            <Badge tone={statusTone(j.status)}>{label(j.status)}</Badge>
          </div>
        </div>
        <dl className="grid gap-x-8 gap-y-3 py-5 text-[14px] sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Client", j.client], ["Client phone", j.clientPhone ?? "—"], ["Date", fmtDate(j.date)],
            ["From", j.origin], ["To", j.destination], ["Delivered", fmtDate(j.deliveredAt)],
            ["Vehicle", v ? `${v.code} · ${v.regNumber}` : "—"], ["Driver", d?.fullName ?? "—"], ["Cargo", `${j.cargo}${j.weightTons ? ` · ${j.weightTons} t` : ""}`],
          ].map(([k, val]) => (
            <div key={k}><dt className="text-[12px] font-semibold text-muted">{k}</dt><dd className="font-semibold">{val}</dd></div>
          ))}
        </dl>
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="flex justify-between text-[14px]"><span>Agreed haulage charge</span><span className="num font-bold">{mwk(j.rate)}</span></div>
          <div className="mt-1 flex justify-between text-[14px]"><span>Paid</span><span className="num">{mwk(j.amountPaid)}</span></div>
          <div className="mt-2 flex justify-between border-t border-line pt-2 text-[16px] font-extrabold"><span>Balance due</span><span className={`num ${balance > 0 ? "text-bad" : "text-good"}`}>{mwk(balance)}</span></div>
        </div>
        {j.notes ? <p className="mt-4 text-[14px] text-muted">Notes: {j.notes}</p> : null}
        <div className="mt-8 grid gap-8 text-[13px] text-muted sm:grid-cols-2">
          <div className="border-t border-slate-300 pt-2">Received in good order by (name, signature, date)</div>
          <div className="border-t border-slate-300 pt-2">For {s.companyName}</div>
        </div>
      </Card>

      {user.role !== "OPERATIONS" && balance > 0 && j.status !== "CANCELLED" ? (
        <Card title="Record client payment" className="no-print">
          <form action={recordJobPayment.bind(null, id)} className="flex flex-wrap items-end gap-3">
            <Field label="Amount received (MWK)"><input className="input num" name="amount" inputMode="numeric" defaultValue={balance} required /></Field>
            <button className="btn btn-primary">Record payment</button>
          </form>
        </Card>
      ) : null}
    </>
  );
}
