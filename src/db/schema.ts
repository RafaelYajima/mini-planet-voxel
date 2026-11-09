import {
  index,
  integer,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Um mini-planeta voxel: gerado proceduralmente a partir de um seed,
// e editável voxel a voxel (cada alteração vira uma linha em `voxels`).
export const planets = pgTable("planets", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  slug: varchar("slug", { length: 96 }).notNull().unique(),
  // seed determinística da geração procedural do terreno
  seed: integer("seed").notNull(),
  // raio do planeta em voxels
  radius: smallint("radius").notNull().default(6),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Voxels editados/colocados manualmente (override sobre o terreno gerado).
// Um registro por posição (planet, x, y, z) — unique index garante isso.
export const voxels = pgTable(
  "voxels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planetId: uuid("planet_id")
      .notNull()
      .references(() => planets.id, { onDelete: "cascade" }),
    x: smallint("x").notNull(),
    y: smallint("y").notNull(),
    z: smallint("z").notNull(),
    // ex: grass, dirt, stone, sand, snow, water, wood, leaves
    blockType: varchar("block_type", { length: 24 })
      .notNull()
      .default("grass"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("voxels_planet_coords_uidx").on(t.planetId, t.x, t.y, t.z),
    index("voxels_planet_idx").on(t.planetId),
  ],
);

export type Planet = typeof planets.$inferSelect;
export type NewPlanet = typeof planets.$inferInsert;
export type Voxel = typeof voxels.$inferSelect;
