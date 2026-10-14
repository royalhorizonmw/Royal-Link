import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export type PayeBand = { upTo: number | null; rate: number }; // monthly; upTo null = no upper limit

export type AppSettings = {
  companyName: string;
  payeBands: PayeBand[];
  pensionEmployeeRate: number; // e.g. 0.05
  pensionEmployerRate: number; // e.g. 0.10
  starterFuelLitres: number;
  restDaysPerWeek: number;
  shortStreakAlert: number; // consecutive short days before alert
  complianceWarnDays: number;
  paymentInstructions: string;
};

// Defaults. PAYE bands follow the monthly bands reported effective 1 Jan 2026
// (0% to K170,000; 30% to K1,570,000; 35% to K10,000,000; 40% above).
// Confirm with MRA and edit in Settings before running payroll.
export const DEFAULT_SETTINGS: AppSettings = {
  companyName: "Royal Link Transports & Travels",
  payeBands: [
    { upTo: 170_000, rate: 0 },
    { upTo: 1_570_000, rate: 0.3 },
    { upTo: 10_000_000, rate: 0.35 },
    { upTo: null, rate: 0.4 },
  ],
  pensionEmployeeRate: 0.05,
  pensionEmployerRate: 0.1,
  starterFuelLitres: 5,
  restDaysPerWeek: 1,
  shortStreakAlert: 3,
  complianceWarnDays: 30,
  paymentInstructions: "Send your daily target to the Royal Link Airtel Money or TNM Mpamba merchant number and use your vehicle code as the reference.",
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settings);
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as AppSettings;
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  const existing = await db.select().from(settings).where(eq(settings.key, key));
  if (existing.length) await db.update(settings).set({ value }).where(eq(settings.key, key));
  else await db.insert(settings).values({ key, value });
}
