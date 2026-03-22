import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/central-schema.ts",
  out: "./src/db/migrations-central",
  // Dummy reference DB for drizzle-kit introspection only — not used at runtime.
  dbCredentials: {
    url: "./data/drizzle-central-ref.db",
  },
});
