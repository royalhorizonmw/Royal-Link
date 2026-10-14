import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, activityLog } from "@/db/schema";
import { decrypt, encrypt, SESSION_COOKIE, SESSION_DAYS, type SessionPayload } from "./session";

export type Role = SessionPayload["role"];

export async function createSession(payload: SessionPayload) {
  const token = await encrypt(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession() {
  const store = await cookies();
  return decrypt(store.get(SESSION_COOKIE)?.value);
}

/** Returns the signed-in, still-active user or redirects to /login. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user || !user.active) redirect("/login");
  return user;
}

/** Requires one of the given roles. Managers can always pass. */
export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (user.role !== "MANAGER" && !roles.includes(user.role)) {
    redirect(user.role === "DRIVER" ? "/me" : "/?denied=1");
  }
  return user;
}

export async function logActivity(userId: string | null, action: string, detail?: string) {
  await db.insert(activityLog).values({ userId, action, detail });
}
