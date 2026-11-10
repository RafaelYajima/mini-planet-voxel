import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Diagnóstico seguro: NUNCA retorna a senha, apenas metadados da conexão.
function connectionInfo() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return { configured: false, reason: "DATABASE_URL nao definida" };
  }
  try {
    const url = new URL(raw);
    return {
      configured: true,
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, ""),
      hasPassword: Boolean(url.password),
      passwordIsPlaceholder: url.password.includes("[YOUR-PASSWORD]") || url.password === "pass",
      sslEnabled:
        !(url.hostname === "localhost" || url.hostname === "127.0.0.1"),
    };
  } catch {
    return { configured: true, reason: "DATABASE_URL nao e uma URL valida" };
  }
}

export async function GET() {
  const info = connectionInfo();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: info });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "erro desconhecido";
    return Response.json(
      {
        ok: false,
        db: info,
        // mensagem do driver (sem credenciais): ex. ENOTFOUND, password authentication failed
        error: message.slice(0, 300),
        hint:
          "Confira a DATABASE_URL na Vercel: porta 6543, senha real no lugar de [YOUR-PASSWORD], e faca Redeploy apos salvar.",
      },
      { status: 500 },
    );
  }
}
