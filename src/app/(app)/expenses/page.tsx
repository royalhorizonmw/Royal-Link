import Link from "next/link";
import { and, asc, desc, eq, gte, isNull, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { expenses, vehicles } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { CATEGORY_OPTIONS, fmtDate, label, monthRange, mwk, thisMonth, today } from "@/lib/format";
import { AddPanel, Card, Empty, Field, Notice, PageHeader, TableWrap } from "@/components/ui";
import { MonthPicker } from "@/components/month-picker";
import { createExpense, deleteExpense } from "./actions";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string; v?: string; c?: string; saved?: string; error?: string }> }) {
  const user = await requireRole("OPERATIONS", "FINANCE");
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : thisMonth();
  const { start, end } = monthRange(month);
  const conds: SQL[] = [gte(expenses.date, start), lte(expenses.date, end)];
  if (sp.v === "company") conds.push(isNull(expenses.vehicleId));
  else if (sp.v) conds.push(eq(expenses.vehicleId, sp.v));
  if (sp.c && (CATEGORY_OPTIONS as readonly string[]).includes(sp.c)) conds.push(eq(expenses.category, sp.c as (typeof CATEGORY_OPTIONS)[number]));

  const [vs, rows] = await Promise.all([
    db.select().from(vehicles).orderBy(asc(vehicles.code)),
    db.select().from(expenses).where(and(...conds)).orderBy(desc(expenses.date), desc(expenses.createdAt)),
  ]);
  const filtered = rows;
  const total = filtered.reduce((s, r) => s + r.amount, 0);
  const byCat = new Map<string, number>();
  for (const r of filtered) byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...cats.map((c) => c[1]));

  return (
    <>
      <PageHeader title="Expenses" subtitle={`${filtered.length} entries · ${mwk(total)}`} actions={<MonthPicker month={month} base="/expenses" params={{ v: sp.v, c: sp.c }} />} />
      {sp.saved ? <Notice tone="good">Expense recorded.</Notice> : null}
      {sp.error ? <Notice tone="bad">Enter an amount, a category and a description.</Notice> : null}

      <AddPanel title="Record expense" open={!!sp.error}>
        <form action={createExpense} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date"><input className="input" type="date" name="date" defaultValue={today()} max={today()} /></Field>
          <Field label="Vehicle">
            <select className="input" name="vehicleId" defaultValue="">
              <option value="">Company-wide (no vehicle)</option>
              {vs.map((v) => <option key={v.id} value={v.id}>{v.code} · {v.regNumber}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select className="input" name="category" defaultValue="REPAIRS_PARTS">
              {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </Field>
          <Field label="Amount (MWK)"><input className="input num" name="amount" inputMode="numeric" required /></Field>
          <Field label="Description" className="sm:col-span-2"><input className="input" name="description" placeholder="e.g. Front brake pads and labour" required /></Field>
          <Field label="Supplier / garage"><input className="input" name="supplier" /></Field>
          <Field label="Odometer (km)"><input className="input num" name="odometer" inputMode="numeric" /></Field>
          <Field label="Litres (fuel only)"><input className="input num" name="litres" inputMode="decimal" /></Field>
          <div className="flex items-end sm:col-span-2 lg:col-span-3"><button className="btn btn-primary">Save expense</button></div>
        </form>
      </AddPanel>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card pad={false}>
          <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4">
            <input type="hidden" name="month" value={month} />
            <Field label="Vehicle" className="min-w-[180px]">
              <select className="input" name="v" defaultValue={sp.v ?? ""}>
                <option value="">All</option><option value="company">Company-wide only</option>
                {vs.map((v) => <option key={v.id} value={v.id}>{v.code}</option>)}
              </select>
            </Field>
            <Field label="Category" className="min-w-[180px]">
              <select className="input" name="c" defaultValue={sp.c ?? ""}>
                <option value="">All</option>{CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </Field>
            <button className="btn btn-ghost">Filter</button>
            {(sp.v || sp.c) ? <Link className="btn btn-ghost" href={`/expenses?month=${month}`}>Clear</Link> : null}
          </form>
          {filtered.length === 0 ? <Empty title="No expenses for this filter" /> : (
            <TableWrap><table className="data">
              <thead><tr><th>Date</th><th>Vehicle</th><th>Category</th><th>Description</th><th>Supplier</th><th>Amount</th>{user.role !== "OPERATIONS" ? <th><span className="sr-only">Delete</span></th> : null}</tr></thead>
              <tbody>{filtered.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.date)}</td>
                  <td>{vs.find((v) => v.id === e.vehicleId)?.code ?? <span className="text-muted">Company</span>}</td>
                  <td>{label(e.category)}</td>
                  <td className="max-w-[320px] truncate">{e.description}{e.litres ? ` · ${e.litres} L` : ""}</td>
                  <td className="text-muted">{e.supplier ?? "—"}</td>
                  <td className="num font-semibold">{mwk(e.amount)}</td>
                  {user.role !== "OPERATIONS" ? <td><form action={deleteExpense.bind(null, e.id)}><button className="btn btn-danger btn-sm" aria-label={`Delete ${e.description}`}>Delete</button></form></td> : null}
                </tr>
              ))}</tbody>
            </table></TableWrap>
          )}
        </Card>
        <Card title="By category">
          {cats.length === 0 ? <div className="text-[14px] text-muted">Nothing yet.</div> : cats.map(([c, v]) => (
            <div key={c} className="py-1.5">
              <div className="flex justify-between text-[13px]"><span className="font-semibold">{label(c)}</span><span className="num">{mwk(v)}</span></div>
              <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${(v / max) * 100}%` }} /></div>
            </div>
          ))}
          <div className="mt-3 flex justify-between border-t border-line pt-3 text-[14px] font-bold"><span>Total</span><span className="num">{mwk(total)}</span></div>
        </Card>
      </div>
    </>
  );
}
