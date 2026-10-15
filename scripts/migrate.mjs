// Applies database migrations from ./drizzle. Safe to run on every deploy.
//   node scripts/migrate.mjs
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set yet — skipping migrations. Connect a database and redeploy.");
  process.exit(0);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Database is up to date.");
} finally {
  await pool.end();
}
