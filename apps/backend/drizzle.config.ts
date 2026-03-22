import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  // This DB is only used by drizzle-kit generate/push for introspection.
  // At runtime each user gets their own DB via db/client.ts.
  dbCredentials: {
    url: "./data/drizzle-ref.db",
  },
});
