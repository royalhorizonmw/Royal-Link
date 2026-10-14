"use client";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const fmt = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
};
const money = (n: number) => `MWK ${Math.round(n).toLocaleString("en-US")}`;
const axis = { fontSize: 11, fill: "#64748b" };

/** Daily collections vs expected target. */
export function DailyChart({ data }: { data: { label: string; paid: number; expected: number }[] }) {
  return (
    <div className="h-[260px] w-full" role="img" aria-label="Bar chart of money collected each day against the expected daily target">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef2f7" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
          <YAxis tickFormatter={fmt} tick={axis} tickLine={false} axisLine={false} width={44} />
          <Tooltip formatter={(v, n) => [money(Number(v)), n === "paid" ? "Collected" : "Expected"]} cursor={{ fill: "#eff6ff" }} contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 13 }} />
          <Bar isAnimationActive={false} dataKey="paid" name="paid" fill="#2563eb" radius={[5, 5, 0, 0]} maxBarSize={28} />
          <Line isAnimationActive={false} dataKey="expected" name="expected" stroke="#0f172a" strokeWidth={2} strokeDasharray="5 4" dot={false} type="linear" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Monthly income, costs and profit. */
export function TrendChart({ data }: { data: { label: string; income: number; cost: number; profit: number }[] }) {
  return (
    <div className="h-[280px] w-full" role="img" aria-label="Monthly income, costs and profit for recent months">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef2f7" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
          <YAxis tickFormatter={fmt} tick={axis} tickLine={false} axisLine={false} width={48} />
          <Tooltip formatter={(v, n) => [money(Number(v)), String(n)]} cursor={{ fill: "#eff6ff" }} contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 13 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar isAnimationActive={false} dataKey="income" name="Income" fill="#2563eb" radius={[5, 5, 0, 0]} maxBarSize={32} />
          <Bar isAnimationActive={false} dataKey="cost" name="Costs" fill="#93c5fd" radius={[5, 5, 0, 0]} maxBarSize={32} />
          <Line isAnimationActive={false} dataKey="profit" name="Profit" stroke="#15803d" strokeWidth={2.5} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars, e.g. profit by vehicle. Negative values show in red. */
export function VehicleBars({ data }: { data: { label: string; value: number }[] }) {
  return (
    <div className="w-full" style={{ height: Math.max(160, data.length * 34 + 30) }} role="img" aria-label="Profit by vehicle this month">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#eef2f7" />
          <XAxis type="number" tickFormatter={fmt} tick={axis} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" tick={{ ...axis, fill: "#0f172a", fontWeight: 600 }} tickLine={false} axisLine={false} width={64} />
          <Tooltip formatter={(v) => [money(Number(v)), "Profit"]} cursor={{ fill: "#eff6ff" }} contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 13 }} />
          <Bar isAnimationActive={false} dataKey="value" radius={[0, 5, 5, 0]} maxBarSize={20}
            shape={(props: unknown) => {
              const p = props as { x: number; y: number; width: number; height: number; value: number };
              const w = Math.abs(p.width);
              const x = p.width < 0 ? p.x + p.width : p.x;
              return <rect x={x} y={p.y} width={w} height={p.height} rx={4} fill={p.value < 0 ? "#dc2626" : "#2563eb"} />;
            }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
