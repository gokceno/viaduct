import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id:         text("id").primaryKey(),
  username:   text("username").notNull().unique(),
  created_at: integer("created_at").notNull(),
});
