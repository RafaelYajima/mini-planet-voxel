import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Por padrão aponta para o PostgreSQL local do sandbox.
// Em outros ambientes (GitHub Actions, sua máquina, etc.) basta definir
// DATABASE_URL — no caso do Supabase, use a Session Pooler URL (porta 5432)
// para migrações de schema.
const dbUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

const parsed = new URL(dbUrl);
const isSupabase = parsed.hostname.includes("supabase.com");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: isSupabase
    ? {
        host: parsed.hostname,
        port: Number(parsed.port || 5432),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, "") || "postgres",
        ssl: "require",
      }
    : {
        url: dbUrl,
      },
});
