import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser, logActivity } from "@/lib/auth";

export const metadata = { title: "Choose your password" };
export const dynamic = "force-dynamic";

async function choose(fd: FormData) {
  "use server";
  const me = await requireUser();
  const a = String(fd.get("password") ?? "");
  const b = String(fd.get("confirm") ?? "");
  if (a.length < 8) redirect("/welcome?error=short");
  if (a !== b) redirect("/welcome?error=match");
  if (/^(\d)\1+$|^1234567890?$|^0123456789$|^password/i.test(a)) redirect("/welcome?error=weak");
  await db.update(users).set({ passwordHash: await bcrypt.hash(a, 10), mustChangePassword: false }).where(eq(users.id, me.id));
  await logActivity(me.id, "password.first-set");
  redirect(me.role === "DRIVER" ? "/me" : "/");
}

const MSG: Record<string, string> = {
  short: "Use at least 8 characters.",
  match: "The two passwords don't match.",
  weak: "That password is too easy to guess. Choose another.",
};

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireUser();
  if (!me.mustChangePassword) redirect(me.role === "DRIVER" ? "/me" : "/");
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-[15px] font-extrabold text-white">RL</div>
          <div><div className="text-[17px] font-extrabold">Welcome, {me.name.split(" ")[0]}</div><div className="text-[13px] text-muted">One last step</div></div>
        </div>
        <form action={choose} className="card space-y-4 p-6">
          <h1 className="text-[20px] font-extrabold">Choose your own password</h1>
          <p className="text-[13px] text-muted">You signed in with a temporary password. Pick one only you know. At least 8 characters.</p>
          {sp.error ? <div className="rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad">{MSG[sp.error] ?? "Try again."}</div> : null}
          <label className="block"><span className="label">New password</span><input className="input" type="password" name="password" minLength={8} required autoComplete="new-password" /></label>
          <label className="block"><span className="label">Type it again</span><input className="input" type="password" name="confirm" minLength={8} required autoComplete="new-password" /></label>
          <button className="btn btn-primary w-full">Save and continue</button>
        </form>
      </div>
    </main>
  );
}
