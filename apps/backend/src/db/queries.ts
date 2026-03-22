import { eq, desc, asc, inArray, sql } from "drizzle-orm";
import type { UserDb } from "./client.js";
import { chats, messages, summaries, todos, settings } from "./schema.js";
import type {
  Chat,
  DashboardChat,
  Message,
  Summary,
  Todo,
  TodoWithChat,
} from "@viaduct/types";
import { DateTime } from "luxon";

// Re-export types so the rest of the backend can import from one place
export type { Chat, DashboardChat, Message, Summary, Todo, TodoWithChat };

// ─── Chats ────────────────────────────────────────────────────────────────────

export function getActiveChats(db: UserDb): Chat[] {
  const rows = db.select().from(chats).where(eq(chats.active, 1)).all();
  return rows.map((r) => ({ ...r, message_count: 0, summary_count: 0 }));
}

export function getAllChats(db: UserDb): Chat[] {
  const rows = db
    .select({
      jid:      chats.jid,
      name:     chats.name,
      type:     chats.type,
      active:   chats.active,
      added_at: chats.added_at,
      message_count: sql<number>`(SELECT COUNT(*) FROM messages WHERE chat_jid = ${chats.jid})`,
      summary_count: sql<number>`(SELECT COUNT(*) FROM summaries WHERE chat_jid = ${chats.jid})`,
    })
    .from(chats)
    .orderBy(desc(chats.added_at))
    .all();
  return rows as Chat[];
}

// Single-query dashboard payload: active chats with latest summary + pending
// todo count. Replaces N+1 per-chat SWR fetches on the dashboard.
export function getDashboardChats(db: UserDb): DashboardChat[] {
  const rows = db
    .select({
      jid:  chats.jid,
      name: chats.name,
      type: chats.type,
      pending_todos: sql<number>`(
        SELECT COUNT(*) FROM todos
        WHERE chat_jid = ${chats.jid} AND done = 0
      )`,
      message_count: sql<number>`(
        SELECT COUNT(*) FROM messages
        WHERE chat_jid = ${chats.jid}
      )`,
      last_summary_content: sql<string | null>`(
        SELECT content FROM summaries
        WHERE chat_jid = ${chats.jid}
        ORDER BY created_at DESC LIMIT 1
      )`,
      last_summary_at: sql<number | null>`(
        SELECT created_at FROM summaries
        WHERE chat_jid = ${chats.jid}
        ORDER BY created_at DESC LIMIT 1
      )`,
    })
    .from(chats)
    .where(eq(chats.active, 1))
    .all();
  return rows as DashboardChat[];
}

export function getChatByJid(db: UserDb, jid: string): Chat | null {
  const row = db.select().from(chats).where(eq(chats.jid, jid)).get();
  if (!row) return null;
  return { ...row, message_count: 0, summary_count: 0 };
}

export function upsertChat(
  db: UserDb,
  chat: Omit<Chat, "message_count" | "summary_count" | "added_at"> & { added_at?: number },
): void {
  db
    .insert(chats)
    .values({
      jid:      chat.jid,
      name:     chat.name,
      type:     chat.type,
      active:   chat.active ?? 1,
      added_at: chat.added_at ?? DateTime.now().toUnixInteger(),
    })
    .onConflictDoUpdate({
      target: chats.jid,
      set: {
        name:   sql`excluded.name`,
        active: sql`excluded.active`,
      },
    })
    .run();
}

export function setChatActive(db: UserDb, jid: string, active: boolean): void {
  db.update(chats).set({ active: active ? 1 : 0 }).where(eq(chats.jid, jid)).run();
}

export function deleteChat(db: UserDb, jid: string): void {
  db.transaction((tx) => {
    tx.delete(todos).where(eq(todos.chat_jid, jid)).run();
    tx.delete(summaries).where(eq(summaries.chat_jid, jid)).run();
    tx.delete(messages).where(eq(messages.chat_jid, jid)).run();
    tx.delete(chats).where(eq(chats.jid, jid)).run();
  });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function insertMessage(db: UserDb, msg: Message): void {
  db
    .insert(messages)
    .values(msg)
    .onConflictDoNothing()
    .run();
}

export function getMessages(
  db: UserDb,
  chatJid: string,
  limit = 50,
  offset = 0,
): Message[] {
  return db
    .select()
    .from(messages)
    .where(eq(messages.chat_jid, chatJid))
    .orderBy(desc(messages.timestamp))
    .limit(limit)
    .offset(offset)
    .all();
}

export function getUnsummarizedMessages(db: UserDb, chatJid: string): Message[] {
  return db
    .select()
    .from(messages)
    .where(eq(messages.chat_jid, chatJid))
    .orderBy(asc(messages.timestamp))
    .limit(500)
    .all();
}

export function deleteMessagesByIds(db: UserDb, ids: string[]): void {
  if (ids.length === 0) return;
  db.delete(messages).where(inArray(messages.id, ids)).run();
}

// ─── Summaries ────────────────────────────────────────────────────────────────

export function insertSummary(db: UserDb, summary: Omit<Summary, "id">): number {
  const result = db
    .insert(summaries)
    .values(summary)
    .returning({ id: summaries.id })
    .get();
  return result!.id;
}

export function getSummaries(db: UserDb, chatJid: string): Summary[] {
  return db
    .select()
    .from(summaries)
    .where(eq(summaries.chat_jid, chatJid))
    .orderBy(desc(summaries.created_at))
    .all();
}

export function getRecentSummaries(db: UserDb, chatJid: string, limit = 5): Summary[] {
  // Fetch the N most recent, then reverse to oldest-first for prompt context
  const rows = db
    .select()
    .from(summaries)
    .where(eq(summaries.chat_jid, chatJid))
    .orderBy(desc(summaries.created_at))
    .limit(limit)
    .all();
  return rows.reverse();
}

// ─── Todos ────────────────────────────────────────────────────────────────────

export function insertTodos(db: UserDb, items: Omit<Todo, "id">[]): void {
  if (items.length === 0) return;
  db.insert(todos).values(items).run();
}

export function getTodos(
  db: UserDb,
  chatJid: string,
  filter: "all" | "done" | "pending" = "all",
): Todo[] {
  const base = db
    .select()
    .from(todos)
    .where(
      filter === "done"
        ? sql`${todos.chat_jid} = ${chatJid} AND ${todos.done} = 1`
        : filter === "pending"
        ? sql`${todos.chat_jid} = ${chatJid} AND ${todos.done} = 0`
        : eq(todos.chat_jid, chatJid),
    )
    .orderBy(desc(todos.created_at))
    .all();
  return base;
}

export function getRecentTodos(db: UserDb, chatJid: string, limit = 5): Todo[] {
  const rows = db
    .select()
    .from(todos)
    .where(eq(todos.chat_jid, chatJid))
    .orderBy(desc(todos.created_at))
    .limit(limit)
    .all();
  return rows.reverse();
}

export function getAllPendingTodos(db: UserDb): TodoWithChat[] {
  const rows = db
    .select({
      id:         todos.id,
      summary_id: todos.summary_id,
      chat_jid:   todos.chat_jid,
      text:       todos.text,
      done:       todos.done,
      created_at: todos.created_at,
      chat_name:  chats.name,
      chat_type:  chats.type,
    })
    .from(todos)
    .innerJoin(chats, eq(chats.jid, todos.chat_jid))
    .where(eq(todos.done, 0))
    .orderBy(desc(todos.created_at))
    .all();
  return rows as TodoWithChat[];
}

export function setTodoDone(db: UserDb, id: number, done: boolean): Todo | null {
  const result = db
    .update(todos)
    .set({ done: done ? 1 : 0 })
    .where(eq(todos.id, id))
    .returning()
    .get();
  return result ?? null;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getSetting(db: UserDb, key: string): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export function setSetting(db: UserDb, key: string, value: string): void {
  db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export function getAllSettings(db: UserDb): Record<string, string> {
  const rows = db.select().from(settings).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
