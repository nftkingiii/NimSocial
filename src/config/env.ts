import { z } from "zod";
import { Address } from "@nimiq/core";

const optionalAddress = z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string().min(1),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(2_592_000).default(604800),
  CHALLENGE_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  NIMIQ_RPC_URL: z.string().url(),
  NIMIQ_NETWORK: z.enum(["mainnet", "testnet"]).default("testnet"),
  NIMIQ_POST_TREASURY: z.string().refine((value) => { try { Address.fromString(value); return true; } catch { return false; } }, "Invalid Nimiq treasury address"),
  NIMIQ_POST_FEE_LUNA: z.coerce.bigint().nonnegative().default(10_000n),
  NIMIQ_UPDATE_FEE_LUNA: z.coerce.bigint().nonnegative().default(1_000n),
  POLYGON_CHAIN_ID: z.coerce.number().int().positive().default(80002),
  POLYGON_RPC_URL: z.string().url(),
  ESCROW_CONTRACT_ADDRESS: optionalAddress,
  USDT_CONTRACT_ADDRESS: optionalAddress,
  REVISION: z.string().max(80).default("local"),
});

export type AppConfig = z.infer<typeof schema> & { allowedOrigins: Set<string> };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.parse(env);
  const allowedOrigins = new Set(parsed.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean));
  return { ...parsed, allowedOrigins };
}
