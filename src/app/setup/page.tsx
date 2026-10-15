import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, logActivity } from "@/lib/auth";

export const metadata = { title: "First-time setup" };
export const dynamic = "force-dynamic";

async function userCount() {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return Number(r?.n ?? 0);
}

function keyMatches(given: string) {
  const expected = process.env.SETUP_KEY ?? "";
  if (expected.length < 12) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Creates the very first Manager. Only works while there are no users and the SETUP_KEY matches. */
async function setup(fd: FormData) {
  "use server";
  if ((await userCount()) > 0) redirect("/login");
  const key = String(fd.get("key") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!keyMatches(key)) redirect("/setup?error=key");
  if (!name || !email || password.length < 10) redirect("/setup?error=fields");
  const [u] = await db.insert(users).values({ name, email, role: "MANAGER", passwordHash: await bcrypt.hash(password, 10) }).returning();
  await logActivity(u.id, "setup.first-manager", email);
  await createSession({ userId: u.id, role: "MANAGER", name });
  redirect("/settings?saved=1");
}

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if ((await userCount()) > 0) redirect("/login");
  const sp = await searchParams;
  const ready = (process.env.SETUP_KEY ?? "").length >= 12;
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-[15px] font-extrabold text-white">RL</div>
          <div>
            <div className="text-[17px] font-extrabold">Royal Link OS</div>
            <div className="text-[13px] text-muted">First-time setup</div>
          </div>
        </div>
        {!ready ? (
          <div className="card p-6 text-[14px]">Setup is locked. Add a <b>SETUP_KEY</b> environment variable (12+ characters) to the hosting settings and redeploy.</div>
        ) : (
          <form action={setup} className="card space-y-4 p-6">
            <h1 className="text-[20px] font-extrabold">Create the manager account</h1>
            <p className="text-[13px] text-muted">This page works once. After the first account exists it sends everyone to sign in.</p>
            {sp.error === "key" ? <div className="rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad">The setup key is wrong.</div> : null}
            {sp.error === "fields" ? <div className="rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad">Fill in every field. The password needs 10+ characters.</div> : null}
            <label className="block"><span className="label">Setup key</span><input className="input" name="key" type="password" required autoComplete="off" /></label>
            <label className="block"><span className="label">Your name</span><input className="input" name="name" required /></label>
            <label className="block"><span className="label">Email</span><input className="input" name="email" type="email" required autoComplete="username" /></label>
            <label className="block"><span className="label">Password (10+ characters)</span><input className="input" name="password" type="password" minLength={10} required autoComplete="new-password" /></label>
            <button className="btn btn-primary w-full">Create account and sign in</button>
          </form>
        )}
      </div>
    </main>
  );
}
