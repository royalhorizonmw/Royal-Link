import "server-only";
import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { appUrl, esc, renderEmail, sendEmail } from "./email";
import { label } from "./format";

// No look-alike characters (0/O, 1/l/I) so passwords are easy to read and type on a phone.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** A unique random temporary password, e.g. "Rk7m-Pq4x-Tw9n". */
export function tempPassword() {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${part()}-${part()}-${part()}`;
}

/**
 * Gives the user a new personal temporary password, emails it to them,
 * and makes them choose their own password at next sign-in.
 */
export async function sendWelcome(userId: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) return { ok: false as const, error: "User not found" };
  const pw = tempPassword();
  await db.update(users).set({ passwordHash: await bcrypt.hash(pw, 10), mustChangePassword: true }).where(eq(users.id, userId));
  const loginUrl = `${appUrl()}/login`;
  const { html, text } = renderEmail({
    heading: `Welcome to Royal Link, ${u.name.split(" ")[0]}`,
    intro: `An account has been set up for you as ${label(u.role)}. Sign in with the details below. You will be asked to choose your own password straight away.`,
    body: `<tr><td style="padding-top:16px"><table role="presentation" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;width:100%">
      <tr><td style="padding:14px 16px;font:14px/1.8 Arial,sans-serif;color:#0f172a">
        Email: <b>${esc(u.email)}</b><br>
        Temporary password: <b style="font-family:Consolas,monospace;font-size:16px;letter-spacing:1px">${esc(pw)}</b>
      </td></tr></table></td></tr>
      <tr><td style="padding-top:12px;font:13px/1.6 Arial,sans-serif;color:#64748b">This password is only for you. Do not share it. It stops working once you set your own.</td></tr>`,
    button: { label: "Sign in to Royal Link", url: loginUrl },
  });
  const r = await sendEmail({
    to: u.email, subject: "Your Royal Link account", html,
    text: `${text}\n\nEmail: ${u.email}\nTemporary password: ${pw}`, kind: "welcome", userId,
  });
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error, tempPassword: pw };
}
