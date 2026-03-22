import {
  sqliteTable,
  text,
  integer,
  index,
} from "drizzle-orm/sqlite-core";

// ─── chats ────────────────────────────────────────────────────────────────────

export const chats = sqliteTable("chats", {
  jid:      text("jid").primaryKey(),
  name:     text("name").notNull().default(""),
  type:     text("type", { enum: ["group", "contact"] }).notNull(),
  active:   integer("active").notNull().default(1),
  added_at: integer("added_at").notNull(),
});

// ─── messages ─────────────────────────────────────────────────────────────────

export const messages = sqliteTable(
  "messages",
  {
    id:          text("id").primaryKey(),
    chat_jid:    text("chat_jid").notNull().references(() => chats.jid),
    sender_jid:  text("sender_jid").notNull().default(""),
    sender_name: text("sender_name").notNull().default(""),
    text:        text("text").notNull(),
    timestamp:   integer("timestamp").notNull(),
  },
  (t) => [
    index("idx_messages_chat_jid").on(t.chat_jid),
    index("idx_messages_timestamp").on(t.chat_jid, t.timestamp),
  ],
);

// ─── summaries ────────────────────────────────────────────────────────────────

export const summaries = sqliteTable(
  "summaries",
  {
    id:           integer("id").primaryKey({ autoIncrement: true }),
    chat_jid:     text("chat_jid").notNull().references(() => chats.jid),
    period_start: integer("period_start").notNull(),
    period_end:   integer("period_end").notNull(),
    content:      text("content").notNull(),
    created_at:   integer("created_at").notNull(),
  },
  (t) => [
    index("idx_summaries_chat_jid").on(t.chat_jid),
  ],
);

// ─── todos ────────────────────────────────────────────────────────────────────

export const todos = sqliteTable(
  "todos",
  {
    id:         integer("id").primaryKey({ autoIncrement: true }),
    summary_id: integer("summary_id").notNull().references(() => summaries.id),
    chat_jid:   text("chat_jid").notNull(),
    text:       text("text").notNull(),
    done:       integer("done").notNull().default(0),
    created_at: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_todos_chat_jid").on(t.chat_jid),
  ],
);

// ─── settings ─────────────────────────────────────────────────────────────────

export const settings = sqliteTable("settings", {
  key:   text("key").primaryKey(),
  value: text("value").notNull(),
});
