import { NextResponse } from "next/server";
import { runReminders } from "@/lib/reminders";
import { logActivity } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called daily by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>". */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await runReminders();
  await logActivity(null, "reminders.cron", `sent ${r.sent}, skipped ${r.skipped}, failed ${r.failed}, nothing ${r.nothingToSay}`);
  return NextResponse.json({ sent: r.sent, skipped: r.skipped, failed: r.failed, nothingToSay: r.nothingToSay });
}
