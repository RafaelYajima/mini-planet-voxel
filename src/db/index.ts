import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

// Conexões externas (ex.: Supabase pooler) exigem SSL; o Postgres local não.
const isLocalhost =
  databaseUrl.includes("127.0.0.1") || databaseUrl.includes("localhost");

const globalForDb = globalThis as typeof globalThis & {
  __miniPlanetVoxelPool?: Pool;
};

export const pool =
  globalForDb.__miniPlanetVoxelPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: isLocalhost ? undefined : { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__miniPlanetVoxelPool = pool;
}

export const db = drizzle(pool);
