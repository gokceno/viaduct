import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { ZodError } from "zod";
import { DateTime, Duration } from "luxon";
import {
  getAllChats,
  getDashboardChats,
  getChatByJid,
  getMessages,
  getSummaries,
  getTodos,
  getAllPendingTodos,
  setTodoDone,
  getAllSettings,
  setSetting,
  upsertChat,
  deleteChat,
} from "../db/queries.js";
import { resolveUser } from "../db/central.js";
import { getDb } from "../db/client.js";
import { isGroupJid, phoneToJid } from "../whatsapp/listener.js";
import { triggerSummarization } from "../scheduler/quietPeriod.js";
import { getWAState, getSocket, logoutWhatsApp, connectToWhatsApp } from "../whatsapp/client.js";
import { registerMessageListener } from "../whatsapp/listener.js";
import {
  PatchTodoBodySchema,
  PatchConfigBodySchema,
  PatchChatBodySchema,
  JidParamSchema,
  TodoIdParamSchema,
  MessagesQuerySchema,
  TodosFilterSchema,
} from "@viaduct/types";

const STATIC_DIR = process.env.STATIC_DIR ?? "./public";
// Fallback username when no Remote-User header is present (local dev without Traefik+TinyAuth).
const DEFAULT_USER = process.env.DEFAULT_USER ?? "local";
// Public URL of TinyAuth — returned by /api/config so the frontend can build logout URLs.
const TINYAUTH_URL = process.env.TINYAUTH_URL ?? "";

// ── Summarize cooldown ────────────────────────────────────────────────────────
// Prevents repeated manual triggers from hammering the Gemini API.
// Key: `${userId}:${jid}`, value: DateTime of last trigger.
const summarizeCooldowns = new Map<string, DateTime>();
const SUMMARIZE_COOLDOWN = Duration.fromObject({ seconds: 60 });

// Hono context variable types
type Variables = {
  userId: string;
  username: string;
};

export function createServer() {
  const app = new Hono<{ Variables: Variables }>();

  // ── Error handler ─────────────────────────────────────────────────────────
  app.onError((err, c) => {
    if (err instanceof ZodError) {
      return c.json({ error: err.flatten() }, 400);
    }
    console.error("[viaduct] Unhandled error:", err);
    return c.json({ error: "Internal server error" }, 500);
  });

  // ── Auth middleware ────────────────────────────────────────────────────────
  // Traefik handles forward-auth against TinyAuth and injects Remote-User on
  // every authenticated request. We just read that header here.
  // In local dev (no Traefik), DEFAULT_USER is used as a fallback.
  app.use("*", async (c, next) => {
    const username = c.req.header("Remote-User") ?? DEFAULT_USER;
    const userId = resolveUser(username);
    c.set("userId", userId);
    c.set("username", username);
    await next();
  });

  // ── Me ────────────────────────────────────────────────────────────────────
  app.get("/api/me", (c) => {
    return c.json({ userId: c.get("userId"), username: c.get("username") });
  });

  // ── Status ────────────────────────────────────────────────────────────────
  app.get("/api/status", async (c) => {
    const userId = c.get("userId");

    // Lazily connect if no session exists yet for this user
    const state = getWAState(userId);
    if (state.status === "connecting" && !getSocket(userId)) {
      const db = getDb(userId);
      registerMessageListener(userId, db);
      connectToWhatsApp(userId).catch((err) =>
        console.error(`[viaduct:${userId}] Failed to connect:`, err),
      );
    }

    const wa = getWAState(userId);
    return c.json({
      whatsapp: wa.status,
      qrDataUrl: wa.qrDataUrl ?? null,
      qrRaw: wa.qrRaw ?? null,
    });
  });

  app.post("/api/logout", async (c) => {
    await logoutWhatsApp(c.get("userId"));
    return c.json({ ok: true });
  });

  // ── Chats ─────────────────────────────────────────────────────────────────
  app.get("/api/chats", (c) => {
    const db = getDb(c.get("userId"));
    return c.json(getAllChats(db));
  });

  // ── Dashboard ─────────────────────────────────────────────────────────────
  // Single endpoint that returns all active chats with their latest summary
  // content/timestamp and pending todo count — no per-chat follow-up needed.
  app.get("/api/dashboard", (c) => {
    const db = getDb(c.get("userId"));
    return c.json(getDashboardChats(db));
  });

  app.get("/api/chats/:jid", (c) => {
    const { jid } = JidParamSchema.parse(c.req.param());
    const db = getDb(c.get("userId"));
    const chat = getChatByJid(db, jid);
    if (!chat) return c.json({ error: "Not found" }, 404);
    return c.json(chat);
  });

  app.post("/api/chats/:jid/refresh-name", async (c) => {
    const { jid } = JidParamSchema.parse(c.req.param());
    const userId = c.get("userId");
    const db = getDb(userId);
    const chat = getChatByJid(db, jid);
    if (!chat) return c.json({ error: "Not found" }, 404);
    if (!jid.endsWith("@g.us"))
      return c.json({ error: "Only groups have a subject to refresh" }, 400);
    const sock = getSocket(userId);
    if (!sock) return c.json({ error: "WhatsApp not connected" }, 503);
    try {
      const meta = await sock.groupMetadata(jid);
      if (meta.subject && meta.subject !== chat.name) {
        upsertChat(db, { ...chat, name: meta.subject });
      }
      return c.json(getChatByJid(db, jid)!);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.get("/api/chats/:jid/messages", (c) => {
    const { jid } = JidParamSchema.parse(c.req.param());
    const { limit, offset } = MessagesQuerySchema.parse(c.req.query());
    const db = getDb(c.get("userId"));
    return c.json(getMessages(db, jid, limit, offset));
  });

  // ── Summaries ─────────────────────────────────────────────────────────────
  app.get("/api/chats/:jid/summaries", (c) => {
    const { jid } = JidParamSchema.parse(c.req.param());
    const db = getDb(c.get("userId"));
    return c.json(getSummaries(db, jid));
  });

  // ── Todos ─────────────────────────────────────────────────────────────────
  app.get("/api/todos", (c) => {
    const db = getDb(c.get("userId"));
    return c.json(getAllPendingTodos(db));
  });

  app.get("/api/chats/:jid/todos", (c) => {
    const { jid } = JidParamSchema.parse(c.req.param());
    const { filter } = TodosFilterSchema.parse(c.req.query());
    const db = getDb(c.get("userId"));
    return c.json(getTodos(db, jid, filter));
  });

  app.patch("/api/todos/:id", async (c) => {
    const { id } = TodoIdParamSchema.parse(c.req.param());
    const db = getDb(c.get("userId"));
    const { done } = PatchTodoBodySchema.parse(await c.req.json());
    const updated = setTodoDone(db, id, done);
    if (!updated) return c.json({ error: "Todo not found" }, 404);
    return c.json(updated);
  });

  // ── Manual summarize ──────────────────────────────────────────────────────
  app.post("/api/summarize/:jid", async (c) => {
    const { jid } = JidParamSchema.parse(c.req.param());
    const userId = c.get("userId");
    const db = getDb(userId);

    // Rate limit: 60-second cooldown per user per chat
    const cooldownKey = `${userId}:${jid}`;
    const lastTriggered = summarizeCooldowns.get(cooldownKey);
    if (lastTriggered) {
      const elapsed = lastTriggered.diffNow().negate();
      if (elapsed < SUMMARIZE_COOLDOWN) {
        const retryAfter = Math.ceil(SUMMARIZE_COOLDOWN.minus(elapsed).as("seconds"));
        return c.json(
          { error: `Please wait ${retryAfter}s before summarizing this chat again.` },
          429,
        );
      }
    }
    summarizeCooldowns.set(cooldownKey, DateTime.now());

    const chat = getChatByJid(db, jid);
    if (!chat) return c.json({ error: "Chat not found or not watched" }, 404);
    const result = await triggerSummarization(userId, db, jid);
    if (!result) return c.json({ message: "No unsummarized messages." }, 200);
    return c.json({ summaryId: result.summaryId, todosCount: result.todosCount });
  });

  // ── Config ────────────────────────────────────────────────────────────────
  app.get("/api/config", (c) => {
    const db = getDb(c.get("userId"));
    const s = getAllSettings(db);
    return c.json({
      tinyauthUrl: TINYAUTH_URL,
      quiet_period_minutes: Number(s.quiet_period_minutes ?? "30"),
      allow_all_contacts: s.allow_all_contacts === "1",
      allow_all_groups: s.allow_all_groups === "1",
    });
  });

  app.patch("/api/config/settings", async (c) => {
    const db = getDb(c.get("userId"));
    const body = PatchConfigBodySchema.parse(await c.req.json());

    if (body.quiet_period_minutes !== undefined)
      setSetting(db, "quiet_period_minutes", String(body.quiet_period_minutes));
    if (body.allow_all_contacts !== undefined)
      setSetting(db, "allow_all_contacts", body.allow_all_contacts ? "1" : "0");
    if (body.allow_all_groups !== undefined)
      setSetting(db, "allow_all_groups", body.allow_all_groups ? "1" : "0");

    const s = getAllSettings(db);
    return c.json({
      quiet_period_minutes: Number(s.quiet_period_minutes ?? "30"),
      allow_all_contacts: s.allow_all_contacts === "1",
      allow_all_groups: s.allow_all_groups === "1",
    });
  });

  app.patch("/api/config/chats", async (c) => {
    const db = getDb(c.get("userId"));
    const body = PatchChatBodySchema.parse(await c.req.json());

    let jid = body.action === "add" ? (body.jid?.trim() ?? "") : body.jid;
    if (!jid && body.action === "add" && body.phone) jid = phoneToJid(body.phone);
    if (!jid) return c.json({ error: "Provide either jid or phone" }, 400);

    if (body.action === "remove") {
      if (!getChatByJid(db, jid)) return c.json({ error: "Chat not found" }, 404);
      deleteChat(db, jid);
      return c.json({ removed: jid });
    }

    const inferredType: "group" | "contact" =
      body.type ?? (isGroupJid(jid) ? "group" : "contact");

    upsertChat(db, { jid, name: body.name ?? jid, type: inferredType, active: 1 });
    return c.json(getChatByJid(db, jid)!);
  });

  // ── Static frontend ───────────────────────────────────────────────────────
  // Serve the Vite build output as static files, with SPA fallback to
  // index.html for client-side routes.
  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) return next();
    return serveStatic({ root: STATIC_DIR })(c, next);
  });
  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) return next();
    return serveStatic({ path: `${STATIC_DIR}/index.html` })(c, next);
  });

  return app;
}
