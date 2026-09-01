import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { loadConfig } from "../config/env.js";

const config = loadConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL, max: 1 });
try {
  const migration = await readFile(resolve("migrations/001_initial.sql"), "utf8");
  await pool.query(migration);
  console.log("Applied migrations/001_initial.sql");
} finally {
  await pool.end();
}
