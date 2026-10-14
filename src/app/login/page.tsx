import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, getSession, logActivity } from "@/lib/auth";

export const metadata = { title: "Sign in" };

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) redirect(`/login?error=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  await createSession({ userId: user.id, role: user.role, name: user.name });
  await logActivity(user.id, "login");
  if (user.role === "DRIVER") redirect("/me");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (session) redirect(session.role === "DRIVER" ? "/me" : "/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-[15px] font-extrabold text-white">RL</div>
          <div>
            <div className="text-[17px] font-extrabold">Royal Link OS</div>
            <div className="text-[13px] text-muted">Transports &amp; Travels · Royal Horizon</div>
          </div>
        </div>
        <form action={login} className="card space-y-4 p-6">
          <h1 className="text-[20px] font-extrabold">Sign in</h1>
          {sp.error ? (
            <div className="rounded-lg border border-red-200 bg-bad-bg px-3 py-2 text-[13px] text-bad">Wrong email or password, or the account is disabled.</div>
          ) : null}
          <input type="hidden" name="next" value={sp.next ?? ""} />
          <label className="block">
            <span className="label">Email</span>
            <input className="input" type="email" name="email" autoComplete="username" required />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input className="input" type="password" name="password" autoComplete="current-password" required />
          </label>
          <button className="btn btn-primary w-full" type="submit">Sign in</button>
        </form>
        <p className="mt-6 text-center text-[13px] text-muted">
          Passenger or client? <a className="font-semibold text-brand-700" href="/report">Send feedback or a complaint</a>
        </p>
      </div>
    </main>
  );
}
