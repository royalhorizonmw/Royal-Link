/** Side-view vehicle illustrations, coloured by status. Pure SVG, no images to load. */

type Palette = { body: string; trim: string; glass: string };

export const STATUS_PALETTE: Record<string, Palette> = {
  ACTIVE: { body: "#2563eb", trim: "#1e40af", glass: "#dbeafe" },
  IN_GARAGE: { body: "#f59e0b", trim: "#b45309", glass: "#fef3c7" },
  PARKED: { body: "#94a3b8", trim: "#64748b", glass: "#e2e8f0" },
  DISPOSED: { body: "#cbd5e1", trim: "#94a3b8", glass: "#f1f5f9" },
};

function Wheel({ cx }: { cx: number }) {
  return (
    <g>
      <circle cx={cx} cy={46} r={8.5} fill="#1f2937" />
      <circle cx={cx} cy={46} r={4.2} fill="#e5e7eb" />
      <circle cx={cx} cy={46} r={1.6} fill="#6b7280" />
    </g>
  );
}

export function MinibusArt({ status = "ACTIVE", className = "" }: { status?: string; className?: string }) {
  const p = STATUS_PALETTE[status] ?? STATUS_PALETTE.ACTIVE;
  return (
    <svg viewBox="0 0 124 58" className={className} aria-hidden="true">
      <ellipse cx="62" cy="55" rx="54" ry="2.5" fill="#0f172a" opacity=".08" />
      {/* body */}
      <path d="M8 44 V18 Q8 10 16 10 H94 Q102 10 108 16 L116 28 Q118 31 118 35 V44 Z" fill={p.body} />
      {/* roof line + skirt */}
      <path d="M8 38 H118 V44 H8 Z" fill={p.trim} />
      {/* windows */}
      <path d="M14 15 H30 V27 H14 Z M34 15 H50 V27 H34 Z M54 15 H70 V27 H54 Z M74 15 H90 V27 H74 Z" fill={p.glass} />
      {/* windscreen */}
      <path d="M95 15 H101 Q104 15 106 18 L112 27 H95 Z" fill={p.glass} />
      {/* door + handle */}
      <path d="M78 29 H90 V38 H78 Z" fill={p.trim} opacity=".35" />
      {/* lights */}
      <rect x="113" y="32" width="5" height="3" rx="1" fill="#fde68a" />
      <rect x="8" y="31" width="3" height="4" rx="1" fill="#ef4444" />
      <Wheel cx={30} />
      <Wheel cx={96} />
    </svg>
  );
}

export function LorryArt({ status = "ACTIVE", className = "" }: { status?: string; className?: string }) {
  const p = STATUS_PALETTE[status] ?? STATUS_PALETTE.ACTIVE;
  return (
    <svg viewBox="0 0 124 58" className={className} aria-hidden="true">
      <ellipse cx="62" cy="55" rx="56" ry="2.5" fill="#0f172a" opacity=".08" />
      {/* cargo box */}
      <rect x="4" y="8" width="78" height="32" rx="3" fill="#f8fafc" stroke={p.trim} strokeWidth="2" />
      <path d="M22 10 V38 M42 10 V38 M62 10 V38" stroke="#e2e8f0" strokeWidth="2" />
      {/* chassis */}
      <rect x="4" y="40" width="114" height="5" rx="1" fill="#334155" />
      {/* cab */}
      <path d="M84 40 V18 Q84 14 88 14 H104 Q108 14 110 18 L118 30 V40 Z" fill={p.body} />
      <path d="M92 18 H104 L111 29 H92 Z" fill={p.glass} />
      <path d="M84 34 H118 V40 H84 Z" fill={p.trim} />
      <rect x="114" y="33" width="4" height="3" rx="1" fill="#fde68a" />
      <Wheel cx={20} />
      <Wheel cx={40} />
      <Wheel cx={102} />
    </svg>
  );
}

/** Real cut-out photos of the fleet's models (Wikimedia Commons, credited in PHOTO_CREDITS). */
export const VEHICLE_PHOTOS = {
  minibus: { src: "/fleet-photos/toyota-hiace-h100.webp", alt: "Toyota HiAce minibus", w: 640, h: 321 },
  lorry: { src: "/fleet-photos/fuso-canter.webp", alt: "Mitsubishi Fuso Canter lorry", w: 640, h: 416 },
} as const;

export const PHOTO_CREDITS = [
  { what: "Toyota HiAce", by: "OSX", licence: "public domain", url: "https://commons.wikimedia.org/wiki/File:1998-2004_Toyota_HiAce_(RZH103R)_van_(2011-11-04).jpg" },
  { what: "Fuso Canter", by: "MarcelX42", licence: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Fuso_Canter_3C15D_IAA_2022_(DSC03808).jpg" },
];

/** Photo of the vehicle, styled by status: full colour on the road, washed out when parked. */
export function VehiclePhoto({ type, status = "ACTIVE", className = "" }: { type: string; status?: string; className?: string }) {
  const p = type === "LORRY" ? VEHICLE_PHOTOS.lorry : VEHICLE_PHOTOS.minibus;
  const look = status === "PARKED" || status === "DISPOSED" ? "grayscale opacity-60" : status === "IN_GARAGE" ? "saturate-50 opacity-90" : "";
  return (
    <div className={`relative flex aspect-[16/10] items-end justify-center ${className}`}>
      <span className="absolute bottom-[3%] left-[8%] right-[8%] h-[9%] rounded-[50%] bg-slate-900/15 blur-[3px]" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.src} alt={p.alt} width={p.w} height={p.h} loading="lazy" decoding="async"
        className={`relative max-h-full w-full object-contain object-bottom drop-shadow-sm transition ${look}`} />
    </div>
  );
}

/** Spanner badge drawn over a vehicle that is in the garage. */
export function GarageBadge() {
  return (
    <span className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow ring-2 ring-white" aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 6.5a4 4 0 0 0 5 5L13 18a2.1 2.1 0 0 1-3-3z" /><path d="M14.5 6.5 17 4l3 3-2.5 2.5" />
      </svg>
    </span>
  );
}

/** Small round icon used on KPI cards. */
export function KpiIcon({ name, tone }: { name: "cash" | "bus" | "wallet" | "trend" | "garage" | "people" | "alert"; tone: "blue" | "green" | "red" | "amber" | "white" }) {
  const bg = { blue: "bg-brand-50 text-brand-700", green: "bg-good-bg text-good", red: "bg-bad-bg text-bad", amber: "bg-warn-bg text-warn", white: "bg-white/15 text-white" }[tone];
  const paths: Record<string, React.ReactNode> = {
    cash: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v5M18 9.5v5" /></>,
    bus: <><rect x="4" y="3" width="16" height="14" rx="2.5" /><path d="M4 10h16M8 20v-2M16 20v-2" /><circle cx="8" cy="13.5" r=".8" /><circle cx="16" cy="13.5" r=".8" /></>,
    wallet: <><path d="M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" /><path d="M3 7l12-3v3M17 13.5h1" /></>,
    trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
    garage: <><path d="M3 21V9l9-5 9 5v12" /><path d="M7 21v-8h10v8M7 16h10" /></>,
    people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2" /></>,
    alert: <><path d="M12 4 2.5 20h19z" /><path d="M12 10v4M12 17h.01" /></>,
  };
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg}`} aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
    </span>
  );
}
