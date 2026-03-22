import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAllUsers, DATA_DIR } from "./db/central.js";
import { getDb } from "./db/client.js";
import { connectToWhatsApp } from "./whatsapp/client.js";
import { registerMessageListener } from "./whatsapp/listener.js";
import { createServer } from "./api/server.js";
import { clearAllTimers } from "./scheduler/quietPeriod.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);


console.log("[viaduct] Starting up...");

// 1. Boot existing users: for each user in the central registry that has an
//    auth directory, open their DB and restore their WA session.
const registeredUsers = getAllUsers();
for (const user of registeredUsers) {
  const authDir = join(DATA_DIR, user.id, "auth");
  if (existsSync(authDir)) {
    console.log(`[viaduct] Restoring session for ${user.username} (${user.id})`);
    const db = getDb(user.id);
    registerMessageListener(user.id, db);
    connectToWhatsApp(user.id).catch((err) => {
      console.error(`[viaduct] Failed to restore session for ${user.username}:`, err);
    });
  }
}

// 2. Start HTTP server
const server = createServer();

Bun.serve({
  port: PORT,
  fetch: server.fetch,
});

console.log(`[viaduct] API server listening on http://localhost:${PORT}`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[viaduct] Shutting down...");
  clearAllTimers();
  process.exit(0);
});
process.on("SIGTERM", () => {
  clearAllTimers();
  process.exit(0);
});
