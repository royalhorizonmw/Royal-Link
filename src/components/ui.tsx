import Link from "next/link";
import { Icon } from "./icons";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {subtitle ? <div className="text-[13px] font-medium text-muted">{subtitle}</div> : null}
        <h1 className="mt-1 text-[26px] font-extrabold tracking-tight sm:text-[30px]">{title}</h1>
      </div>
      {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({ children, className = "", title, action, pad = true }: {
  children: React.ReactNode; className?: string; title?: React.ReactNode; action?: React.ReactNode; pad?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
          <h2 className="text-[16px] font-bold">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className={pad ? (title ? "px-5 pb-5" : "p-5") : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, note, tone = "ink", href }: {
  label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "ink" | "good" | "bad" | "warn" | "brand"; href?: string;
}) {
  const color = { ink: "text-ink", good: "text-good", bad: "text-bad", warn: "text-warn", brand: "text-brand-700" }[tone];
  const body = (
    <>
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className={`num mt-1.5 text-[22px] font-extrabold leading-tight 2xl:text-[25px] ${color}`}>{value}</div>
      {note ? <div className="mt-1 text-[12px] text-muted">{note}</div> : null}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-5 transition hover:border-brand-300">{body}</Link>
  ) : (
    <div className="card p-5">{body}</div>
  );
}

const TONES: Record<string, string> = {
  good: "bg-good-bg text-good",
  bad: "bg-bad-bg text-bad",
  warn: "bg-warn-bg text-warn",
  info: "bg-info-bg text-info",
  muted: "bg-slate-100 text-slate-600",
};

export function Badge({ tone = "muted", children }: { tone?: keyof typeof TONES | string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap ${TONES[tone] ?? TONES.muted}`}>
      {children}
    </span>
  );
}

/** Maps domain statuses to meaning colours. */
export function statusTone(s: string): string {
  const map: Record<string, string> = {
    PAID: "good", ACTIVE: "good", OK: "good", RESOLVED: "good", DONE: "good", APPROVED: "good", DELIVERED: "good",
    SHORT: "bad", OVERDUE: "bad", HIGH: "bad", SUSPENDED: "bad", CANCELLED: "bad", NEW: "bad",
    PENDING: "warn", DUE_SOON: "warn", MEDIUM: "warn", IN_PROGRESS: "warn", DRAFT: "warn", IN_GARAGE: "warn", INVOICED: "warn", OPEN: "warn",
    EXCUSED: "info", IN_TRANSIT: "info", QUOTED: "muted", REST_DAY: "muted", LOW: "muted", PARKED: "muted", LEFT: "muted", DISPOSED: "muted",
  };
  return map[s] ?? "muted";
}

export function Bar({ value, tone }: { value: number | null; tone?: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  const color = tone ?? (value == null ? "#cbd5e1" : value >= 0.85 ? "#16a34a" : value >= 0.7 ? "#f59e0b" : "#dc2626");
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-slate-100">
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="num text-[12px] text-slate-600">{value == null ? "—" : `${Math.round(pct)}%`}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="text-[15px] font-semibold">{title}</div>
      {children ? <div className="mx-auto mt-1 max-w-md text-[13px] text-muted">{children}</div> : null}
    </div>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  // `relative` keeps screen-reader-only labels inside the scroll box so phones don't get sideways scrolling.
  return <div className="relative overflow-x-auto">{children}</div>;
}

export function Field({ label, children, hint, className = "" }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

/** A collapsible "add new" panel built on <details>, no client JS needed. */
export function AddPanel({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="card no-print group" open={open}>
      <summary className="flex items-center justify-between px-5 py-4">
        <span className="flex items-center gap-2 text-[15px] font-bold text-brand-700"><Icon name="plus" /> {title}</span>
        <span className="text-[12px] text-muted group-open:hidden">Show form</span>
        <span className="hidden text-[12px] text-muted group-open:inline">Hide</span>
      </summary>
      <div className="border-t border-line px-5 py-5">{children}</div>
    </details>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "good"; children: React.ReactNode }) {
  const cls = { info: "bg-brand-50 text-brand-900 border-brand-200", warn: "bg-warn-bg text-warn border-amber-200", bad: "bg-bad-bg text-bad border-red-200", good: "bg-good-bg text-good border-green-200" }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-[14px] ${cls}`}>{children}</div>;
}
