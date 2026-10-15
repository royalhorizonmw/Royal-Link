export const TZ = "Africa/Blantyre";

export function mwk(n: number | null | undefined, opts: { sign?: boolean } = {}) {
  const v = Math.round(n ?? 0);
  const s = Math.abs(v).toLocaleString("en-US");
  if (v < 0) return `−MWK ${s}`;
  return `${opts.sign && v > 0 ? "+" : ""}MWK ${s}`;
}

export function compact(n: number) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/** Today's date (YYYY-MM-DD) in Malawi time. */
export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function thisMonth() {
  return today().slice(0, 7);
}

export function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing the given date (weeks run Monday–Sunday). */
export function weekStart(iso: string) {
  const dow = new Date(iso + "T12:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

export function periodLabel(p: string | null | undefined) {
  return p === "WEEK" ? "per week" : "per day";
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / 86_400_000);
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end, days: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "—";
  return new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("en-GB", { timeZone: TZ, ...opts });
}

export function fmtMonth(month: string) {
  return new Date(month + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function label(s: string | null | undefined) {
  if (!s) return "—";
  const special: Record<string, string> = {
    COF: "Certificate of Fitness", COF_LICENCE: "COF & licences", PSV_LICENCE: "PSV licence",
    AIRTEL_MONEY: "Airtel Money", TNM_MPAMBA: "TNM Mpamba", REST_DAY: "Rest day", PER_JOB: "Per job",
    DAILY_TARGET: "Target", BOTH: "Target + jobs", REPAIRS_PARTS: "Repairs & parts",
    OFFICE_ADMIN: "Office & admin", TOLLS_LEVIES: "Tolls & levies", LOAN_LEASE: "Loan / lease",
    STARTER_FUEL: "Starter fuel", DRIVER_ALLOWANCE: "Driver allowance", IN_GARAGE: "In garage",
    IN_TRANSIT: "In transit", IN_PROGRESS: "In progress",
  };
  if (special[s]) return special[s];
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
}

export const CATEGORY_OPTIONS = [
  "FUEL", "STARTER_FUEL", "REPAIRS_PARTS", "TYRES", "SERVICE", "INSURANCE", "COF_LICENCE",
  "DRIVER_ALLOWANCE", "TOLLS_LEVIES", "LOAN_LEASE", "SALARIES", "OFFICE_ADMIN", "MARKETING", "OTHER",
] as const;

/** Parse a money input like "180,000" or "180000". */
export function toInt(v: FormDataEntryValue | null | undefined) {
  if (v == null) return 0;
  const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export function str(v: FormDataEntryValue | null | undefined) {
  const s = v == null ? "" : String(v).trim();
  return s.length ? s : null;
}
