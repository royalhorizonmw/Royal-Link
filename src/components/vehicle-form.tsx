import { Field } from "./ui";

type V = {
  code?: string; regNumber?: string; type?: string; make?: string | null; model?: string | null; year?: number | null;
  seats?: number | null; capacityTons?: number | null; earningMode?: string; dailyTarget?: number; targetPeriod?: string; odometer?: number;
  purchaseDate?: string | null; purchaseCost?: number | null; notes?: string | null; status?: string;
};

export function VehicleForm({ action, v = {}, submit, withStatus = false }: {
  action: (fd: FormData) => void | Promise<void>; v?: V; submit: string; withStatus?: boolean;
}) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Fleet code" hint="e.g. BUS-01 or LRY-01"><input className="input" name="code" defaultValue={v.code} required /></Field>
      <Field label="Registration number"><input className="input" name="regNumber" defaultValue={v.regNumber} required /></Field>
      <Field label="Type">
        <select className="input" name="type" defaultValue={v.type ?? "MINIBUS"}>
          <option value="MINIBUS">Minibus</option><option value="BUS">Bus</option><option value="LORRY">Lorry</option>
        </select>
      </Field>
      <Field label="How it earns">
        <select className="input" name="earningMode" defaultValue={v.earningMode ?? "DAILY_TARGET"}>
          <option value="DAILY_TARGET">Target (daily or weekly)</option>
          <option value="PER_JOB">Per haulage job</option>
          <option value="BOTH">Target + haulage jobs</option>
        </select>
      </Field>
      <Field label="Target (MWK)"><input className="input num" name="dailyTarget" inputMode="numeric" defaultValue={v.dailyTarget ?? ""} /></Field>
      <Field label="Target is" hint="Buses usually daily, lorries weekly">
        <select className="input" name="targetPeriod" defaultValue={v.targetPeriod ?? ""}>
          <option value="">Automatic (bus daily, lorry weekly)</option>
          <option value="DAY">Per day</option>
          <option value="WEEK">Per week (Mon–Sun)</option>
        </select>
      </Field>
      <Field label="Odometer (km)"><input className="input num" name="odometer" inputMode="numeric" defaultValue={v.odometer ?? ""} /></Field>
      <Field label="Make"><input className="input" name="make" defaultValue={v.make ?? ""} /></Field>
      <Field label="Model"><input className="input" name="model" defaultValue={v.model ?? ""} /></Field>
      <Field label="Year"><input className="input num" name="year" inputMode="numeric" defaultValue={v.year ?? ""} /></Field>
      <Field label="Seats (buses)"><input className="input num" name="seats" inputMode="numeric" defaultValue={v.seats ?? ""} /></Field>
      <Field label="Capacity in tonnes (lorries)"><input className="input num" name="capacityTons" inputMode="decimal" defaultValue={v.capacityTons ?? ""} /></Field>
      <Field label="Purchase date"><input className="input" type="date" name="purchaseDate" defaultValue={v.purchaseDate ?? ""} /></Field>
      <Field label="Purchase cost (MWK)"><input className="input num" name="purchaseCost" inputMode="numeric" defaultValue={v.purchaseCost ?? ""} /></Field>
      {withStatus ? (
        <Field label="Status">
          <select className="input" name="status" defaultValue={v.status ?? "ACTIVE"}>
            <option value="ACTIVE">Active (on the road)</option>
            <option value="IN_GARAGE">In garage (target paused)</option>
            <option value="PARKED">Parked</option>
            <option value="DISPOSED">Sold / disposed</option>
          </select>
        </Field>
      ) : null}
      <Field label="Notes" className="sm:col-span-2 lg:col-span-4"><textarea className="input min-h-[70px]" name="notes" defaultValue={v.notes ?? ""} /></Field>
      <div className="sm:col-span-2 lg:col-span-4"><button className="btn btn-primary" type="submit">{submit}</button></div>
    </form>
  );
}
