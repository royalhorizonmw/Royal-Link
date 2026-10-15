import "server-only";
import { db } from "@/db";
import { emailLog } from "@/db/schema";

/**
 * Sends email through Resend (https://resend.com) using its HTTP API.
 * Needs RESEND_API_KEY and EMAIL_FROM, e.g. "Royal Link <noreply@royalhorizonmw.com>".
 * Without a key, emails are recorded as "skipped" so nothing breaks before setup.
 */
export async function sendEmail(opts: {
  to: string; subject: string; html: string; text: string; kind: string; userId?: string | null;
}) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Royal Link <onboarding@resend.dev>";
  const log = (status: string, error?: string) =>
    db.insert(emailLog).values({ userId: opts.userId ?? null, toEmail: opts.to, kind: opts.kind, subject: opts.subject, status, error: error ?? null });

  if (!key) {
    await log("skipped", "RESEND_API_KEY is not set");
    return { ok: false as const, error: "Email is not set up yet (RESEND_API_KEY missing)" };
  }
  try {
    const res = await fetch(process.env.RESEND_API_URL ?? "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
    });
    if (!res.ok) {
      const msg = (await res.text()).slice(0, 500);
      await log("failed", `${res.status} ${msg}`);
      return { ok: false as const, error: `Email provider error ${res.status}` };
    }
    await log("sent");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log("failed", msg);
    return { ok: false as const, error: msg };
  }
}

export function appUrl() {
  return (process.env.APP_URL ?? "https://transport.royalhorizonmw.com").replace(/\/$/, "");
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export type Section = { title: string; tone: "bad" | "warn" | "info" | "good"; items: { text: string; link?: string }[] };

const TONE: Record<Section["tone"], string> = { bad: "#b91c1c", warn: "#b45309", info: "#1d4ed8", good: "#15803d" };

/** Branded HTML email: white with tech blue, meaning colours on section headings. */
export function renderEmail(o: { heading: string; intro?: string; sections?: Section[]; body?: string; button?: { label: string; url: string }; footer?: string }) {
  const sections = (o.sections ?? []).map((s) => `
    <tr><td style="padding:16px 0 4px;font:700 15px/1.4 Arial,sans-serif;color:${TONE[s.tone]}">${esc(s.title)}</td></tr>
    <tr><td><ul style="margin:0;padding-left:20px;font:14px/1.6 Arial,sans-serif;color:#0f172a">
      ${s.items.map((i) => `<li>${i.link ? `<a href="${esc(i.link)}" style="color:#1d4ed8">${esc(i.text)}</a>` : esc(i.text)}</li>`).join("")}
    </ul></td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7fb">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px">
<tr><td style="padding:20px 24px;border-bottom:1px solid #e2e8f0">
  <span style="display:inline-block;background:#2563eb;color:#fff;font:800 13px Arial,sans-serif;padding:7px 9px;border-radius:8px">RL</span>
  <span style="font:700 15px Arial,sans-serif;color:#0f172a;margin-left:8px">Royal Link Transports</span>
</td></tr>
<tr><td style="padding:20px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="font:800 20px/1.3 Arial,sans-serif;color:#0f172a">${esc(o.heading)}</td></tr>
  ${o.intro ? `<tr><td style="padding-top:8px;font:14px/1.6 Arial,sans-serif;color:#334155">${esc(o.intro)}</td></tr>` : ""}
  ${o.body ?? ""}
  ${sections}
  ${o.button ? `<tr><td style="padding-top:22px"><a href="${esc(o.button.url)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font:700 14px Arial,sans-serif;padding:12px 20px;border-radius:10px">${esc(o.button.label)}</a></td></tr>` : ""}
</table></td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #e2e8f0;font:12px/1.5 Arial,sans-serif;color:#64748b">${esc(o.footer ?? "Royal Link OS · a Royal Horizon Limited company · transport.royalhorizonmw.com")}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [o.heading, o.intro ?? "", ...(o.sections ?? []).flatMap((s) => [``, s.title.toUpperCase(), ...s.items.map((i) => `- ${i.text}`)]), o.button ? `\n${o.button.label}: ${o.button.url}` : ""].join("\n");
  return { html, text };
}

export { esc };
