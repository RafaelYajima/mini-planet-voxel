#!/usr/bin/env node
/**
 * apply-schema.mjs — aplica o schema atual no Supabase.
 * Atualizado conforme o projeto evolui.
 */
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida."); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

const ddl = `
-- Nenhuma tabela definida ainda.
SELECT 1;
`;

try {
  await client.connect();
  console.log("Conectado.");
  await client.query(ddl);
  const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`);
  console.log("Tabelas:", res.rows.length === 0 ? "nenhuma" : res.rows.map(r => r.table_name).join(", "));
  await client.end();
  console.log("Pronto!");
} catch (err) {
  console.error("Erro:", err.message);
  process.exit(1);
}
