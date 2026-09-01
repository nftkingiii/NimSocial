import { Pool } from "pg";
import { buildApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { NimiqRpcPaymentVerifier } from "./infra/nimiq-rpc.js";
import { PostgresStore } from "./repositories/postgres-store.js";

const config = loadConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
const app = await buildApp({ config, store: new PostgresStore(pool), paymentVerifier: new NimiqRpcPaymentVerifier(config.NIMIQ_RPC_URL) });

const close = async () => { await app.close(); await pool.end(); };
process.on("SIGINT", close);
process.on("SIGTERM", close);
await app.listen({ host: config.HOST, port: config.PORT });
