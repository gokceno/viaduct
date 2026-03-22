import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { eq } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { uuidv7 } from "uuidv7";
import { DateTime } from "luxon";
import { users } from "./central-schema.js";

export { users };

// ─── Open central DB ──────────────────────────────────────────────────────────

const DATA_DIR = process.env.DATA_DIR ?? "./data";
mkdirSync(DATA_DIR, { recursive: true });

const centralSqlite = new Database(join(DATA_DIR, "viaduct.db"), { create: true });
centralSqlite.run("PRAGMA journal_mode = WAL;");
centralSqlite.run("PRAGMA foreign_keys = ON;");

const centralDb = drizzle(centralSqlite);

migrate(centralDb, { migrationsFolder: join(import.meta.dir, "migrations-central") });

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Given an external username (from Remote-User header), returns a stable
 * internal UUIDv7 user ID. Creates a new user record on first encounter.
 */
export function resolveUser(username: string): string {
  const existing = centralDb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get();

  if (existing) return existing.id;

  const id = uuidv7();
  centralDb.insert(users).values({
    id,
    username,
    created_at: DateTime.now().toUnixInteger(),
  }).run();

  console.log(`[viaduct] New user registered: ${username} → ${id}`);
  return id;
}

/**
 * Returns all registered users (for boot-time session restoration).
 */
export function getAllUsers(): Array<{ id: string; username: string }> {
  return centralDb.select({ id: users.id, username: users.username }).from(users).all();
}

/**
 * Returns the username for a given userId, or null if not found.
 */
export function getUsernameById(userId: string): string | null {
  const row = centralDb
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.username ?? null;
}

export { DATA_DIR };
