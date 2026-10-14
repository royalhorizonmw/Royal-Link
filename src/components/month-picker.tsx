import Link from "next/link";
import { fmtMonth, shiftMonth, thisMonth } from "@/lib/format";

/** Previous / next month links that keep other query params. */
export function MonthPicker({ month, base, params = {} }: { month: string; base: string; params?: Record<string, string | undefined> }) {
  const q = (m: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    p.set("month", m);
    return `${base}?${p.toString()}`;
  };
  const next = shiftMonth(month, 1);
  return (
    <div className="flex items-center gap-2">
      <Link className="btn btn-ghost btn-sm" href={q(shiftMonth(month, -1))} aria-label="Previous month">←</Link>
      <span className="min-w-[130px] text-center text-[14px] font-bold">{fmtMonth(month)}</span>
      {next <= thisMonth() ? <Link className="btn btn-ghost btn-sm" href={q(next)} aria-label="Next month">→</Link> : <span className="w-[38px]" />}
    </div>
  );
}
