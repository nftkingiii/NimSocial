import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { loadConfig } from "../config/env.js";

const config = loadConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL, max: 1 });
try {
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  const existingSchema = await pool.query("SELECT to_regclass('public.users') AS users");
  if (existingSchema.rows[0]?.users) await pool.query("INSERT INTO schema_migrations(name) VALUES('001_initial.sql') ON CONFLICT DO NOTHING");
  const files = (await readdir(resolve("migrations"))).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
  for (const file of files) {
    const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE name=$1", [file]);
    if (applied.rows[0]) continue;
    const migration = await readFile(resolve("migrations", file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(migration);
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [file]);
      await client.query("COMMIT");
      console.log(`Applied migrations/${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
