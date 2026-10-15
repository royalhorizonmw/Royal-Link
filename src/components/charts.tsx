"use client";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const fmt = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
};
const money = (n: number) => `MWK ${Math.round(n).toLocaleString("en-US")}`;
const axis = { fontSize: 11, fill: "#64748b" };
const tipStyle = { borderRadius: 10, borderColor: "#e2e8f0", fontSize: 13, boxShadow: "0 4px 16px rgba(15,23,42,.08)" };

/** A tidy maximum for an axis: 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10^n above the largest value. */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v * 1.05) return m * p;
  return 10 * p;
}

/** Evenly spaced round ticks (e.g. 0, 400K, 800K, 1.2M, 1.6M) covering [min, max]. */
function niceTicks(min: number, max: number, count = 4) {
  const span = Math.max(max - min, 1);
  const raw = span / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * p >= raw) ?? 10) * p;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil((max * 1.02) / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v));
  return { lo, hi, ticks };
}

type Day = { label: string; paid: number; expected: number };

/**
 * Daily collections. Each day is a light "target" bar with the collected bar drawn over it,
 * coloured by how much of the target came in: green 100%+, blue 70–99%, red under 70%.
 */
export function DailyChart({ data }: { data: Day[] }) {
  const { hi: max, ticks } = niceTicks(0, Math.max(...data.map((d) => Math.max(d.paid, d.expected))));
  const color = (d: Day) => (d.expected === 0 ? "#2563eb" : d.paid >= d.expected ? "#16a34a" : d.paid >= d.expected * 0.7 ? "#2563eb" : "#dc2626");
  return (
    <div>
      <div className="h-[260px] w-full" role="img" aria-label="Money collected each day over the last 14 days, against the expected target for that day">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap="-100%" barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="#eef2f7" />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickFormatter={fmt} tick={axis} tickLine={false} axisLine={false} width={44} domain={[0, max]} ticks={ticks} />
            <Tooltip
              cursor={{ fill: "#eff6ff" }} contentStyle={tipStyle} itemStyle={{ color: "#0f172a" }}
              formatter={(v, n) => [money(Number(v)), n === "paid" ? "Collected" : "Target"]}
              labelFormatter={(l, p) => {
                const d = p?.[0]?.payload as Day | undefined;
                return d && d.expected ? `${l} · ${Math.round((d.paid / d.expected) * 100)}% of target` : String(l);
              }}
            />
            <Bar isAnimationActive={false} dataKey="expected" name="expected" fill="#e2e8f0" radius={[5, 5, 0, 0]} maxBarSize={30} />
            <Bar isAnimationActive={false} dataKey="paid" name="paid" radius={[5, 5, 0, 0]} maxBarSize={30}>
              {data.map((d, i) => <Cell key={i} fill={color(d)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600">
        <Key c="#e2e8f0">Target</Key><Key c="#16a34a">Target met</Key><Key c="#2563eb">70–99%</Key><Key c="#dc2626">Under 70%</Key>
      </div>
    </div>
  );
}

function Key({ c, children }: { c: string; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />{children}</span>;
}

/** Monthly income and costs as side-by-side bars, profit as a line. */
export function TrendChart({ data }: { data: { label: string; income: number; cost: number; profit: number }[] }) {
  const { lo, hi, ticks } = niceTicks(
    Math.min(0, ...data.map((d) => d.profit)),
    Math.max(...data.map((d) => Math.max(d.income, d.cost, d.profit))),
  );
  return (
    <div className="h-[280px] w-full" role="img" aria-label="Monthly income, costs and profit for recent months">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="#eef2f7" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
          <YAxis tickFormatter={fmt} tick={axis} tickLine={false} axisLine={false} width={48} domain={[lo, hi]} ticks={ticks} />
          {lo < 0 ? <ReferenceLine y={0} stroke="#94a3b8" /> : null}
          <Tooltip formatter={(v, n) => [money(Number(v)), String(n)]} cursor={{ fill: "#eff6ff" }} contentStyle={tipStyle} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar isAnimationActive={false} dataKey="income" name="Income" fill="#2563eb" radius={[5, 5, 0, 0]} maxBarSize={34} />
          <Bar isAnimationActive={false} dataKey="cost" name="Costs" fill="#93c5fd" radius={[5, 5, 0, 0]} maxBarSize={34} />
          <Line isAnimationActive={false} dataKey="profit" name="Profit" stroke="#15803d" strokeWidth={2.5} dot={{ r: 4, fill: "#15803d", strokeWidth: 0 }} activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Profit per vehicle, largest first, value printed at the end of each bar. Losses in red. */
export function VehicleBars({ data }: { data: { label: string; value: number }[] }) {
  const rows = [...data].sort((a, b) => b.value - a.value);
  const hi = niceMax(Math.max(0, ...rows.map((r) => r.value)));
  const minV = Math.min(0, ...rows.map((r) => r.value));
  // Only make room for losses as big as they really are (plus a little), not a whole tick step
  const lo = minV < 0 ? Math.min(minV * 1.15, -hi * 0.08) : 0;
  return (
    <div className="w-full" style={{ height: Math.max(170, rows.length * 34 + 24) }} role="img" aria-label="Profit by vehicle this month, largest first">
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 2, right: 64, left: 4, bottom: 2 }} barCategoryGap="24%">
          <XAxis type="number" hide domain={[lo, hi]} />
          <YAxis type="category" dataKey="label" tick={{ ...axis, fill: "#0f172a", fontWeight: 600 }} tickLine={false} axisLine={false} width={62} />
          <ReferenceLine x={0} stroke="#cbd5e1" />
          <Tooltip formatter={(v) => [money(Number(v)), "Profit"]} cursor={{ fill: "#eff6ff" }} contentStyle={tipStyle} />
          <Bar isAnimationActive={false} dataKey="value" radius={4} maxBarSize={20}>
            {rows.map((r, i) => <Cell key={i} fill={r.value < 0 ? "#dc2626" : "#2563eb"} />)}
            <LabelList dataKey="value" position="right" formatter={(v) => fmt(Number(v))} style={{ fontSize: 11, fontWeight: 700, fill: "#334155" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
