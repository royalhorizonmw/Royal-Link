// Fills an EMPTY database with sample data for training and testing.
//   npm run demo          (refuses to run if vehicles already exist)
// All demo logins use the password "royallink123".
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as s from "../src/db/schema";

const TZ = "Africa/Blantyre";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
  const db = drizzle(pool, { schema: s });
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.vehicles);
  if (Number(n) > 0) { console.log("Database already has vehicles — demo data not loaded."); await pool.end(); return; }

  const pw = await bcrypt.hash("royallink123", 10);
  const [mgr] = await db.insert(s.users).values([
    { name: "Demo Manager", email: "manager@demo.royallink", role: "MANAGER", passwordHash: pw },
    { name: "Demo Operations", email: "ops@demo.royallink", role: "OPERATIONS", passwordHash: pw },
    { name: "Demo Finance", email: "finance@demo.royallink", role: "FINANCE", passwordHash: pw },
  ]).onConflictDoNothing().returning();

  const vdefs = [
    { code: "BUS-01", regNumber: "LL 1101", type: "MINIBUS", dailyTarget: 180000, seats: 15, odometer: 104800 },
    { code: "BUS-02", regNumber: "LL 1102", type: "MINIBUS", dailyTarget: 180000, seats: 15, odometer: 88200 },
    { code: "BUS-03", regNumber: "LL 1103", type: "MINIBUS", dailyTarget: 180000, seats: 15, odometer: 94300 },
    { code: "BUS-04", regNumber: "LL 1104", type: "MINIBUS", dailyTarget: 170000, seats: 15, odometer: 121000, status: "IN_GARAGE" },
    { code: "BUS-05", regNumber: "LL 1105", type: "MINIBUS", dailyTarget: 180000, seats: 15, odometer: 67000 },
    { code: "BUS-06", regNumber: "LL 1106", type: "MINIBUS", dailyTarget: 170000, seats: 15, odometer: 143500 },
    { code: "LRY-01", regNumber: "LL 2201", type: "LORRY", dailyTarget: 300000, capacityTons: 10, odometer: 186400, earningMode: "BOTH" },
    { code: "LRY-02", regNumber: "LL 2202", type: "LORRY", dailyTarget: 0, capacityTons: 7, odometer: 151200, earningMode: "PER_JOB" },
  ] as const;
  const vs = await db.insert(s.vehicles).values(vdefs.map((v) => ({ ...v, make: v.type === "LORRY" ? "Mitsubishi Fuso" : "Toyota", model: v.type === "LORRY" ? "Canter 2t" : "HiAce", year: 2004 }))).returning();

  const names = ["Chisomo Banda", "Mphatso Phiri", "Kondwani Mwale", "Yamikani Tembo", "Blessings Chirwa", "Limbani Nyirenda", "Madalitso Kumwenda", "Tiyamike Gondwe"];
  const ds = await db.insert(s.drivers).values(names.map((fullName, i) => ({
    fullName, phone: `0999 10${i} 2${i}${i}`, startDate: addDays(today, -200 + i * 10), vehicleId: vs[i].id, starterFuelGiven: true, licenceNumber: `DL-${4000 + i}`,
  }))).returning();
  await db.insert(s.assignments).values(ds.map((d) => ({ driverId: d.id, vehicleId: d.vehicleId!, startDate: d.startDate })));
  await db.insert(s.users).values({ name: ds[0].fullName, email: "driver@demo.royallink", role: "DRIVER", passwordHash: pw, driverId: ds[0].id }).onConflictDoNothing();

  // 45 days of ledger
  const reliability = [0.95, 0.8, 0.9, 0.85, 0.88, 0.6, 0.97, 0];
  for (let back = 45; back >= 0; back--) {
    const date = addDays(today, -back);
    const dow = new Date(date + "T12:00:00Z").getUTCDay();
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (v.earningMode === "PER_JOB") continue;
      let status: "PAID" | "SHORT" | "EXCUSED" | "REST_DAY" | "PENDING" = "PAID";
      let paid = v.dailyTarget;
      if (back === 0 && i % 3 === 0) { status = "PENDING"; paid = 0; }
      else if (v.status === "IN_GARAGE" && back < 6) { status = "EXCUSED"; paid = 0; }
      else if (dow === 0 && i % 2 === 0) { status = "REST_DAY"; paid = 0; }
      else if (rand() > reliability[i]) { status = "SHORT"; paid = Math.round((v.dailyTarget * (0.3 + rand() * 0.5)) / 1000) * 1000; }
      const method = status === "PAID" || status === "SHORT" ? (rand() > 0.3 ? (rand() > 0.5 ? "AIRTEL_MONEY" : "TNM_MPAMBA") : "CASH") : null;
      await db.insert(s.dailyRecords).values({
        date, vehicleId: v.id, driverId: ds[i].id, target: v.dailyTarget, amountPaid: paid, status, method,
        excuseReason: status === "EXCUSED" ? "Vehicle in garage" : null, approvedById: status === "EXCUSED" ? mgr?.id : null,
      });
    }
  }
  // Some recoveries
  await db.insert(s.driverAdjustments).values([
    { driverId: ds[1].id, type: "RECOVERY", amount: 120000, method: "AIRTEL_MONEY", date: addDays(today, -10), note: "Part payment" },
    { driverId: ds[5].id, type: "RECOVERY", amount: 80000, method: "CASH", date: addDays(today, -4) },
  ]);

  // Haulage jobs
  const clients = ["Mulli Brothers", "Press Cane", "Lilongwe Grain Traders", "Kambewa Hardware", "Blantyre Cement Depot"];
  const routes = [["Lilongwe", "Blantyre"], ["Lilongwe", "Mzuzu"], ["Salima", "Lilongwe"], ["Blantyre", "Zomba"], ["Lilongwe", "Kasungu"]];
  for (let k = 0; k < 14; k++) {
    const r = routes[k % routes.length];
    const status = k < 2 ? "IN_TRANSIT" : k < 5 ? "INVOICED" : k < 6 ? "DELIVERED" : "PAID";
    const rate = 450000 + Math.round(rand() * 10) * 50000;
    await db.insert(s.haulageJobs).values({
      waybillNo: `WB-DEMO-${String(k + 1).padStart(3, "0")}`, date: addDays(today, -k * 3), vehicleId: k % 2 ? vs[6].id : vs[7].id, driverId: k % 2 ? ds[6].id : ds[7].id,
      client: clients[k % clients.length], cargo: ["Maize bags", "Cement", "Sugar", "Building materials"][k % 4], weightTons: 6 + (k % 4),
      origin: r[0], destination: r[1], rate, amountPaid: status === "PAID" ? rate : 0, status, deliveredAt: status === "IN_TRANSIT" ? null : addDays(today, -k * 3 + 1),
    });
  }

  // Expenses
  const exp: (typeof s.expenses.$inferInsert)[] = [];
  for (let back = 45; back >= 0; back -= 3) {
    const i = Math.floor(rand() * vs.length);
    const cat = (["REPAIRS_PARTS", "TYRES", "SERVICE", "REPAIRS_PARTS", "TOLLS_LEVIES"] as const)[Math.floor(rand() * 5)];
    exp.push({ date: addDays(today, -back), vehicleId: vs[i].id, category: cat, amount: Math.round((40000 + rand() * 400000) / 1000) * 1000, description: `${cat === "TYRES" ? "Tyre replacement" : cat === "SERVICE" ? "Routine service" : cat === "TOLLS_LEVIES" ? "Council levies" : "Parts and labour"}`, supplier: "Area 47 Motors" });
  }
  exp.push({ date: addDays(today, -20), vehicleId: vs[7].id, category: "FUEL", amount: 820000, description: "Diesel for Mzuzu trip", litres: 300 });
  exp.push({ date: addDays(today, -15), category: "OFFICE_ADMIN", amount: 350000, description: "Office rent share" });
  exp.push({ date: addDays(today, -2), vehicleId: vs[3].id, category: "REPAIRS_PARTS", amount: 680000, description: "Gearbox repair (in garage)", supplier: "Kanengo Garage" });
  await db.insert(s.expenses).values(exp);

  // Compliance
  const docs: (typeof s.complianceDocs.$inferInsert)[] = [];
  vs.forEach((v, i) => {
    docs.push({ type: "COF", vehicleId: v.id, number: `COF-${7000 + i}`, issuer: "DRTSS", expiryDate: addDays(today, [6, 64, 120, 40, 200, 150, 90, 15][i]) });
    docs.push({ type: "INSURANCE", vehicleId: v.id, number: `INS-${300 + i}`, issuer: "NICO General", expiryDate: addDays(today, [180, 21, 250, 300, 90, 60, 330, 120][i]) });
    if (i !== 5) docs.push({ type: "ROAD_LICENCE", vehicleId: v.id, expiryDate: addDays(today, [100, 140, 28, 210, 75, 0, 28, 190][i] || 50) });
  });
  ds.forEach((d, i) => {
    docs.push({ type: "DRIVING_LICENCE", driverId: d.id, number: d.licenceNumber, expiryDate: addDays(today, i === 4 ? -3 : 300 + i * 20) });
    docs.push({ type: "PSV_LICENCE", driverId: d.id, expiryDate: addDays(today, i === 2 ? 12 : 200 + i * 15) });
  });
  await db.insert(s.complianceDocs).values(docs);

  // Maintenance
  for (const v of vs) {
    await db.insert(s.serviceSchedules).values([
      { vehicleId: v.id, title: "Oil & filter change", intervalKm: 5000, intervalDays: 90, lastDoneKm: v.odometer - [4200, 1500, 4300, 800, 2000, 5600, 3000, 6200][vs.indexOf(v)], lastDoneDate: addDays(today, -60) },
      { vehicleId: v.id, title: "Full service", intervalKm: 20000, intervalDays: 365, lastDoneKm: v.odometer - 9000, lastDoneDate: addDays(today, -150) },
    ]);
  }
  await db.insert(s.workOrders).values([
    { vehicleId: vs[3].id, title: "Gearbox overhaul", mechanic: "Kanengo Garage", status: "IN_PROGRESS", openedAt: addDays(today, -5), odometer: vs[3].odometer },
    { vehicleId: vs[0].id, title: "Brake pads", mechanic: "Area 47 Motors", status: "DONE", openedAt: addDays(today, -20), closedAt: addDays(today, -19), odometer: vs[0].odometer - 900 },
  ]);

  // Complaints
  await db.insert(s.complaints).values([
    { date: today, source: "PASSENGER", severity: "HIGH", vehicleId: vs[5].id, driverId: ds[5].id, description: "Reckless or dangerous driving: overtaking on a bend near Mitundu", contactPhone: "0888 555 111" },
    { date: addDays(today, -1), source: "PASSENGER", severity: "MEDIUM", vehicleId: vs[1].id, driverId: ds[1].id, description: "Overcharged fare / no change: conductor kept MWK 500 change", status: "IN_PROGRESS" },
    { date: addDays(today, -3), source: "PASSENGER", severity: "LOW", vehicleId: vs[2].id, driverId: ds[2].id, description: "Radio too loud on the Area 25 route", status: "IN_PROGRESS" },
    { date: addDays(today, -6), source: "CLIENT", severity: "HIGH", vehicleId: vs[6].id, driverId: ds[6].id, description: "Delivery to Mzuzu one day late", status: "RESOLVED", resolution: "Client called, 5% discount on next job", resolvedAt: addDays(today, -5) },
    { date: addDays(today, -12), source: "PASSENGER", severity: "MEDIUM", vehicleId: vs[5].id, driverId: ds[5].id, description: "Rude driver or conductor", status: "RESOLVED", resolution: "Driver warned", resolvedAt: addDays(today, -10) },
  ]);

  // Staff & budget
  await db.insert(s.staff).values([
    { fullName: "Operations Lead (demo)", jobTitle: "Operations lead", department: "Operations", basicSalary: 450000, startDate: addDays(today, -300) },
    { fullName: "Finance Officer (demo)", jobTitle: "Finance officer", department: "Finance", basicSalary: 420000, startDate: addDays(today, -300) },
    { fullName: "Head Mechanic (demo)", jobTitle: "Mechanic", department: "Garage", basicSalary: 300000, startDate: addDays(today, -250) },
    { fullName: ds[6].fullName, jobTitle: "Lorry driver", department: "Drivers", basicSalary: 280000, startDate: ds[6].startDate, driverId: ds[6].id },
    { fullName: ds[7].fullName, jobTitle: "Lorry driver", department: "Drivers", basicSalary: 280000, startDate: ds[7].startDate, driverId: ds[7].id },
  ]);
  const month = today.slice(0, 7);
  await db.insert(s.budgets).values([
    { month, category: "REPAIRS_PARTS", amount: 2500000 }, { month, category: "TYRES", amount: 800000 }, { month, category: "SERVICE", amount: 600000 },
    { month, category: "SALARIES", amount: 2200000 }, { month, category: "OFFICE_ADMIN", amount: 500000 }, { month, category: "FUEL", amount: 1500000 },
    { month, category: "TOLLS_LEVIES", amount: 300000 }, { month, category: "INSURANCE", amount: 400000 },
  ]);
  await db.insert(s.incomeTargets).values({ month, amount: 34000000 });

  console.log("Demo data loaded. Sign in as manager@demo.royallink / ops@ / finance@ / driver@ with password royallink123");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
