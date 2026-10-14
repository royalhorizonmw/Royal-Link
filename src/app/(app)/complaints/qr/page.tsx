import { asc, ne } from "drizzle-orm";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Bus QR codes" };

export default async function QrPage() {
  await requireRole("OPERATIONS");
  const h = await headers();
  const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const vs = await db.select().from(vehicles).where(ne(vehicles.status, "DISPOSED")).orderBy(asc(vehicles.code));
  const codes = await Promise.all(vs.map(async (v) => ({
    v, url: `${base}/report?v=${encodeURIComponent(v.code)}`,
    svg: await QRCode.toString(`${base}/report?v=${encodeURIComponent(v.code)}`, { type: "svg", margin: 1, color: { dark: "#0f172a", light: "#ffffff" } }),
  })));
  return (
    <>
      <PageHeader title="Feedback QR codes" subtitle="Print and stick one inside each vehicle. Passengers scan it to send feedback or a complaint." actions={<PrintButton />} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
        {codes.map(({ v, url, svg }) => (
          <div key={v.id} className="card flex flex-col items-center gap-3 p-6 text-center break-inside-avoid">
            <div className="text-[13px] font-semibold text-muted">Royal Link Transports</div>
            <div className="text-[20px] font-extrabold">How was your trip on {v.code}?</div>
            <div className="w-[190px]" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="text-[13px]">Scan to send feedback or a complaint</div>
            <div className="text-[11px] break-all text-muted">{url}</div>
          </div>
        ))}
      </div>
    </>
  );
}
