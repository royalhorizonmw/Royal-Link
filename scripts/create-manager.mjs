// Creates the first Manager login (no build tools needed; works inside Docker).
//   ADMIN_EMAIL=you@royalhorizonmw.com ADMIN_PASSWORD='long-password' ADMIN_NAME='Hope Chidule' node scripts/create-manager.mjs
import bcrypt from "bcryptjs";
import pg from "pg";
import { randomUUID } from "node:crypto";

const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
const name = process.env.ADMIN_NAME ?? "Manager";
if (!email || password.length < 8) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters).");
  process.exit(1);
}
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});
await client.connect();
try {
  const { rows } = await client.query("select id from users where email = $1", [email]);
  if (rows.length) {
    console.log(`${email} already exists.`);
  } else {
    await client.query(
      "insert into users (id, name, email, password_hash, role) values ($1, $2, $3, $4, 'MANAGER')",
      [randomUUID(), name, email, await bcrypt.hash(password, 10)],
    );
    console.log(`Manager ${email} created. Sign in and add your team under Settings & users.`);
  }
} finally {
  await client.end();
}
