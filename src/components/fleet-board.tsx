import Link from "next/link";
import { GarageBadge, LorryArt, MinibusArt } from "./vehicle-art";
import { daysBetween, fmtDate, today } from "@/lib/format";

type V = {
  id: string; code: string; reg: string; type: string; status: string; driver: string | null;
  today: { status: string; paid: number; target: number } | null;
  garageJob: { title: string; since: string } | null;
  trip: string | null;
};

const TODAY: Record<string, { text: string; cls: string }> = {
  PAID: { text: "Paid today", cls: "bg-good-bg text-good" },
  SHORT: { text: "Short today", cls: "bg-bad-bg text-bad" },
  PENDING: { text: "Not paid yet", cls: "bg-warn-bg text-warn" },
  EXCUSED: { text: "Excused today", cls: "bg-info-bg text-info" },
  REST_DAY: { text: "Rest day", cls: "bg-slate-100 text-slate-600" },
};

function Tile({ v }: { v: V }) {
  const Art = v.type === "LORRY" ? LorryArt : MinibusArt;
  const t = v.today ? TODAY[v.today.status] : null;
  const garage = v.status === "IN_GARAGE";
  return (
    <Link href={`/vehicles/${v.id}`}
      className={`group flex flex-col gap-2 rounded-2xl border p-3 transition hover:border-brand-300 hover:shadow-sm ${garage ? "border-amber-200 bg-amber-50/60" : v.status === "PARKED" ? "border-line bg-slate-50" : "border-line bg-white"}`}>
      <div className="relative mx-auto w-full max-w-[150px]">
        <Art status={v.status} className="h-auto w-full transition group-hover:-translate-y-0.5" />
        {garage ? <GarageBadge /> : null}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-extrabold text-ink">{v.code}</span>
        <span className="truncate text-[11px] text-muted">{v.reg}</span>
      </div>
      <div className="truncate text-[12px] text-slate-600">{v.driver ?? <span className="text-muted">No driver</span>}</div>
      {garage && v.garageJob ? (
        <div className="text-[12px] font-semibold text-warn">{v.garageJob.title} · {daysBetween(v.garageJob.since, today())}d</div>
      ) : v.trip ? (
        <div className="truncate text-[12px] font-semibold text-info">On trip: {v.trip}</div>
      ) : t ? (
        <span className={`self-start rounded-full px-2 py-0.5 text-[11px] font-bold ${t.cls}`}>{t.text}{v.today?.status === "SHORT" ? ` (${Math.round((v.today.paid / Math.max(1, v.today.target)) * 100)}%)` : ""}</span>
      ) : (
        <span className="self-start rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{v.status === "PARKED" ? "Parked" : "No sheet today"}</span>
      )}
    </Link>
  );
}

/** "Fleet right now": every vehicle drawn as a bus or lorry, grouped by where it is. */
export function FleetBoard({ vehicles }: { vehicles: V[] }) {
  if (!vehicles.length) return null;
  const order = (v: V) => (v.status === "ACTIVE" ? 0 : v.status === "IN_GARAGE" ? 1 : 2);
  const sorted = [...vehicles].sort((a, b) => order(a) - order(b) || a.code.localeCompare(b.code));
  const onRoad = vehicles.filter((v) => v.status === "ACTIVE").length;
  const garage = vehicles.filter((v) => v.status === "IN_GARAGE");
  const parked = vehicles.filter((v) => v.status === "PARKED").length;
  return (
    <section className="card" aria-label="Fleet right now">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
        <h2 className="text-[16px] font-bold">Fleet right now</h2>
        <div className="flex flex-wrap gap-3 text-[12px] text-slate-600">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-600" />{onRoad} on the road</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />{garage.length} in garage</span>
          {parked ? <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" />{parked} parked</span> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
        {sorted.map((v) => <Tile key={v.id} v={v} />)}
      </div>
      {garage.length ? (
        <div className="border-t border-line px-5 py-3 text-[12px] text-slate-600">
          In the garage: {garage.map((g) => `${g.code}${g.garageJob ? ` (${g.garageJob.title}, since ${fmtDate(g.garageJob.since, { day: "numeric", month: "short" })})` : ""}`).join(" · ")}. Their daily targets are paused.
        </div>
      ) : null}
    </section>
  );
}
