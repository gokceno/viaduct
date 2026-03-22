import type { BaileysEventMap, proto } from "@whiskeysockets/baileys";
import {
  getChatByJid,
  getSetting,
  insertMessage,
  upsertChat,
} from "../db/queries.js";
import type { UserDb } from "../db/client.js";
import { onWAEvent, getSocket } from "./client.js";
import { scheduleQuietCheck } from "../scheduler/quietPeriod.js";
import { DateTime, Duration } from "luxon";

// Safely convert a Baileys timestamp (number | Long | null | undefined) to a
// plain JS number. Baileys uses protobuf int64 which arrives as a Long object
// from protobufjs — Number() produces NaN for those, so we use .toNumber().
type LongLike = { toNumber(): number; low: number };

function toTimestamp(t: number | LongLike | null | undefined): number {
  if (!t) return 0;
  if (typeof t === "number") return t;
  if (typeof (t as LongLike).toNumber === "function") return (t as LongLike).toNumber();
  if (typeof (t as LongLike).low === "number") return (t as LongLike).low;
  return 0;
}

// ─── Phone number → JID normalization ────────────────────────────────────────

export function phoneToJid(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

export function isContactJid(jid: string): boolean {
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid");
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

// ─── Filter logic ─────────────────────────────────────────────────────────────

function shouldIndex(db: UserDb, jid: string): boolean {
  if (isGroupJid(jid)) {
    if (getSetting(db, "allow_all_groups") === "1") return true;
    const chat = getChatByJid(db, jid);
    return chat !== null && chat.active === 1;
  }
  if (isContactJid(jid)) {
    if (getSetting(db, "allow_all_contacts") === "1") return true;
    const chat = getChatByJid(db, jid);
    return chat !== null && chat.active === 1;
  }
  return false;
}

async function fetchGroupName(userId: string, jid: string): Promise<string> {
  try {
    const sock = getSocket(userId);
    if (!sock) return jid.replace(/@.*$/, "");
    const meta = await sock.groupMetadata(jid);
    return meta.subject || jid.replace(/@.*$/, "");
  } catch {
    return jid.replace(/@.*$/, "");
  }
}

// ─── Message handler ──────────────────────────────────────────────────────────

function extractText(msg: proto.IWebMessageInfo): string | null {
  const m = msg.message;
  if (!m) return null;

  // Unwrap common envelope types first
  const inner =
    m.ephemeralMessage?.message ??
    m.viewOnceMessage?.message ??
    m.viewOnceMessageV2?.message ??
    m.documentWithCaptionMessage?.message ??
    m;

  return (
    inner.conversation ??
    inner.extendedTextMessage?.text ??
    inner.imageMessage?.caption ??
    inner.videoMessage?.caption ??
    inner.documentMessage?.caption ??
    inner.buttonsResponseMessage?.selectedDisplayText ??
    inner.listResponseMessage?.title ??
    null
  );
}

type MessagesUpsertPayload = BaileysEventMap["messages.upsert"];

async function handleMessagesUpsert(
  userId: string,
  db: UserDb,
  payload: MessagesUpsertPayload,
): Promise<void> {
  const { messages, type } = payload;

  console.log(`[viaduct:${userId}] messages.upsert type=${type} count=${messages.length}`);

  if (type !== "notify" && type !== "append") {
    console.log(`[viaduct:${userId}] skipping — type is "${type}"`);
    return;
  }

  const cutoff = DateTime.now().toUnixInteger() - Duration.fromObject({ hours: 24 }).as("seconds");

  for (const msg of messages) {
    const chatJid = msg.key.remoteJid;
    if (!chatJid) {
      console.log(`[viaduct:${userId}] skip — no remoteJid`);
      continue;
    }

    // Only index incoming messages. Exception: "Saved Messages" (user messaging
    // themselves) — identified by the chat JID matching the user's own phone JID
    // or their LID. We must NOT use chatJid.endsWith("@lid") here because that
    // would match any contact's LID, not just the user's own.
    if (msg.key.fromMe) {
      const sock = getSocket(userId);
      const myId = sock?.user?.id?.replace(/:.*$/, "") + "@s.whatsapp.net";
      const myLid = sock?.user?.lid?.replace(/:.*$/, "") + "@lid";
      const isSavedMessages = chatJid === myId || chatJid === myLid;
      if (!isSavedMessages) {
        console.log(`[viaduct:${userId}] skip ${chatJid} — fromMe`);
        continue;
      }
    }

    const msgTs = toTimestamp(msg.messageTimestamp);
    if (msgTs > 0 && msgTs < cutoff) {
      console.log(`[viaduct:${userId}] skip ${chatJid} — older than 24h (ts=${msgTs} cutoff=${cutoff})`);
      continue;
    }

    if (!shouldIndex(db, chatJid)) {
      console.log(`[viaduct:${userId}] skip ${chatJid} — shouldIndex=false`);
      continue;
    }

    const existing = getChatByJid(db, chatJid);
    if (!existing) {
      const name = isGroupJid(chatJid)
        ? await fetchGroupName(userId, chatJid)
        : (msg.pushName ?? chatJid.replace(/@.*$/, ""));
      upsertChat(db, {
        jid: chatJid,
        name,
        type: isGroupJid(chatJid) ? "group" : "contact",
        active: 1,
      });
    } else if (
      !isGroupJid(chatJid) &&
      msg.pushName &&
      existing.name !== msg.pushName
    ) {
      upsertChat(db, { ...existing, name: msg.pushName });
    }

    const text = extractText(msg);
    if (!text || text.trim() === "") {
      const msgTypes = Object.keys(msg.message ?? {}).join(",");
      console.log(`[viaduct:${userId}] skip ${chatJid} — no text (message types: ${msgTypes})`);
      continue;
    }

    const timestamp = msgTs > 0 ? msgTs : DateTime.now().toUnixInteger();
    const senderJid = msg.key.participant ?? msg.key.remoteJid ?? "";

    console.log(
      `[viaduct:${userId}] indexing message chat=${chatJid} sender=${senderJid} text="${text.slice(0, 60)}..."`,
    );

    insertMessage(db, {
      id: msg.key.id ?? `${chatJid}-${timestamp}`,
      chat_jid: chatJid,
      sender_jid: senderJid,
      sender_name: msg.pushName ?? senderJid.replace(/@.*$/, ""),
      text: text.trim(),
      timestamp,
    });

    scheduleQuietCheck(userId, db, chatJid);
    console.log(`[viaduct:${userId}] quiet-check scheduled for ${chatJid}`);
  }
}

export function registerMessageListener(userId: string, db: UserDb): void {
  onWAEvent(userId, "messages.upsert", async (payload: MessagesUpsertPayload) => {
    try {
      await handleMessagesUpsert(userId, db, payload);
    } catch (err) {
      console.error(`[viaduct:${userId}] Unhandled error in messages.upsert handler:`, err);
    }
  });

  onWAEvent(userId, "groups.update", (updates) => {
    for (const update of updates) {
      if (!update.id || !update.subject) continue;
      const existing = getChatByJid(db, update.id);
      if (existing) {
        upsertChat(db, { ...existing, name: update.subject });
      }
    }
  });
}
