import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import * as schema from "./schema.js";
import { DATA_DIR } from "./central.js";

export type UserDb = ReturnType<typeof drizzle<typeof schema>>;

// Connection pool: one open DB per userId
const pool = new Map<string, UserDb>();

/**
 * Returns (or opens) the Drizzle DB instance for a given user.
 * On first open: creates the directory, runs all migrations, seeds defaults.
 */
export function getDb(userId: string): UserDb {
  const existing = pool.get(userId);
  if (existing) return existing;

  const dbPath = join(DATA_DIR, userId, "viaduct.db");
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath, { create: true });
  sqlite.run("PRAGMA journal_mode = WAL;");
  sqlite.run("PRAGMA foreign_keys = ON;");

  const db = drizzle(sqlite, { schema });

  // Run all pending migrations from the generated migrations folder
  migrate(db, {
    migrationsFolder: join(import.meta.dir, "migrations"),
  });

  // Seed default settings (idempotent — INSERT OR IGNORE)
  sqlite.run(`
    INSERT OR IGNORE INTO settings(key, value) VALUES
      ('quiet_period_minutes', '30'),
      ('allow_all_contacts',   '0'),
      ('allow_all_groups',     '0');
  `);

  pool.set(userId, db);
  console.log(`[viaduct] DB opened for user ${userId}`);
  return db;
}

/**
 * Returns the DB instance only if it is already open (no side-effects).
 * Used for shutdown / cleanup paths.
 */
export function getDbIfOpen(userId: string): UserDb | undefined {
  return pool.get(userId);
}
