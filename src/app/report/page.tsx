import { redirect } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { complaints, vehicles, drivers } from "@/db/schema";
import { str, today } from "@/lib/format";

export const metadata = { title: "Feedback" };
export const dynamic = "force-dynamic";

const TOPICS: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
  "Reckless or dangerous driving": "HIGH",
  "Overloading": "HIGH",
  "Rude driver or conductor": "MEDIUM",
  "Overcharged fare / no change": "MEDIUM",
  "Late or skipped stop": "MEDIUM",
  "Dirty or damaged vehicle": "LOW",
  "Lost property": "LOW",
  "Compliment": "LOW",
  "Other": "MEDIUM",
};

async function submit(fd: FormData) {
  "use server";
  const message = str(fd.get("message"));
  const topic = str(fd.get("topic")) ?? "Other";
  if (!message || message.length < 5) redirect("/report?error=1");
  // Simple honeypot against bots
  if (str(fd.get("website"))) redirect("/report?sent=1");
  const code = str(fd.get("vehicle"));
  const v = code ? await db.query.vehicles.findFirst({ where: eq(vehicles.code, code) }) : undefined;
  const d = v ? await db.query.drivers.findFirst({ where: and(eq(drivers.vehicleId, v.id), eq(drivers.status, "ACTIVE")) }) : undefined;
  await db.insert(complaints).values({
    date: today(), source: "PASSENGER", severity: TOPICS[topic] ?? "MEDIUM",
    vehicleId: v?.id ?? null, driverId: d?.id ?? null,
    description: `${topic}: ${message}`.slice(0, 2000),
    contactName: str(fd.get("name")), contactPhone: str(fd.get("phone")),
    // Compliments are recorded (they count for nothing against the driver) but need no action
    ...(topic === "Compliment" ? { status: "RESOLVED" as const, resolution: "Compliment, no action needed", resolvedAt: today() } : {}),
  });
  redirect("/report?sent=1");
}

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ v?: string; sent?: string; error?: string }> }) {
  const sp = await searchParams;
  const vs = await db.select({ code: vehicles.code }).from(vehicles).where(ne(vehicles.status, "DISPOSED")).orderBy(asc(vehicles.code));
  return (
    <main className="min-h-screen bg-canvas px-4 py-8">
      <div className="mx-auto max-w-[480px]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 font-extrabold text-white">RL</div>
          <div><div className="text-[17px] font-extrabold">Royal Link Transports</div><div className="text-[13px] text-muted">Tell us about your trip</div></div>
        </div>
        {sp.sent ? (
          <div className="card p-6">
            <h1 className="text-[20px] font-extrabold">Thank you</h1>
            <p className="mt-2 text-[15px] text-slate-700">Your message has reached our operations team. If you left a phone number, we may call you back.</p>
          </div>
        ) : (
          <form action={submit} className="card space-y-4 p-6">
            {sp.error ? <div className="rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad">Please write a short message.</div> : null}
            <label className="block"><span className="label">Vehicle</span>
              <select className="input" name="vehicle" defaultValue={sp.v ?? ""}>
                <option value="">I don&apos;t know</option>{vs.map((v) => <option key={v.code} value={v.code}>{v.code}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">What is it about?</span>
              <select className="input" name="topic">{Object.keys(TOPICS).map((t) => <option key={t}>{t}</option>)}</select>
            </label>
            <label className="block"><span className="label">Your message</span><textarea className="input min-h-[110px]" name="message" required /></label>
            <label className="block"><span className="label">Your name (optional)</span><input className="input" name="name" /></label>
            <label className="block"><span className="label">Phone (optional)</span><input className="input" name="phone" inputMode="tel" /></label>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
            <button className="btn btn-primary w-full">Send</button>
          </form>
        )}
      </div>
    </main>
  );
}
