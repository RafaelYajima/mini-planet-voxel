#!/usr/bin/env node
/**
 * apply-schema.mjs — aplica o schema do Drizzle no banco via SQL puro.
 *
 * Usado pelo GitHub Actions como alternativa ao `drizzle-kit push`,
 * que tem bug silencioso com URLs do Supabase session pooler.
 *
 * Uso: node scripts/apply-schema.mjs
 * Requer: DATABASE_URL no ambiente.
 */
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const ddl = `
-- Tabela: planets
CREATE TABLE IF NOT EXISTS planets (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  slug        VARCHAR(96)  NOT NULL UNIQUE,
  seed        INTEGER      NOT NULL,
  radius      SMALLINT     NOT NULL DEFAULT 6,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Tabela: voxels
CREATE TABLE IF NOT EXISTS voxels (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  planet_id   UUID         NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
  x           SMALLINT     NOT NULL,
  y           SMALLINT     NOT NULL,
  z           SMALLINT     NOT NULL,
  block_type  VARCHAR(24)  NOT NULL DEFAULT 'grass',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Índices
CREATE UNIQUE INDEX IF NOT EXISTS voxels_planet_coords_uidx ON voxels (planet_id, x, y, z);
CREATE INDEX IF NOT EXISTS voxels_planet_idx ON voxels (planet_id);
`;

try {
  await client.connect();
  console.log("Conectado ao banco.");

  await client.query(ddl);
  console.log("Schema aplicado com sucesso.");

  // Validação: lista as tabelas criadas
  const res = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  console.log("Tabelas encontradas:", res.rows.map((r) => r.table_name).join(", "));

  await client.end();
  console.log("Conexão encerrada. Tudo pronto!");
} catch (err) {
  console.error("Erro:", err.message);
  process.exit(1);
}
