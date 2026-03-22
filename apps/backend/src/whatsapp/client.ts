import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type BaileysEventMap,
} from "@whiskeysockets/baileys";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { toDataURL } from "qrcode";
import pino from "pino";
import { Boom } from "@hapi/boom";
import { DATA_DIR } from "../db/central.js";

const logger = pino({ level: "silent" }); // Baileys internal logger — keep silent

// ─── Types ────────────────────────────────────────────────────────────────────

export type WAStatus = "connecting" | "qr" | "open" | "closed";

export interface WAState {
  status: WAStatus;
  qrDataUrl: string | null;
  qrRaw: string | null;
}

// ─── Per-user state maps ───────────────────────────────────────────────────────

const waStates = new Map<string, WAState>();
const waSockets = new Map<string, WASocket | null>();

type EventListener<K extends keyof BaileysEventMap> = (
  data: BaileysEventMap[K],
) => void | Promise<void>;

// eventListeners[userId][event] = [handler, ...]
const eventListeners = new Map<
  string,
  Partial<{ [K in keyof BaileysEventMap]: EventListener<K>[] }>
>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authDir(userId: string): string {
  return join(DATA_DIR, userId, "auth");
}

function getState(userId: string): WAState {
  return waStates.get(userId) ?? { status: "connecting", qrDataUrl: null, qrRaw: null };
}

function setState(userId: string, state: WAState): void {
  waStates.set(userId, state);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function onWAEvent<K extends keyof BaileysEventMap>(
  userId: string,
  event: K,
  handler: EventListener<K>,
): void {
  if (!eventListeners.has(userId)) eventListeners.set(userId, {});
  const userListeners = eventListeners.get(userId)!;
  if (!userListeners[event]) {
    (userListeners as Record<string, unknown[]>)[event] = [];
  }
  (userListeners[event] as EventListener<K>[]).push(handler);
}

export function getWAState(userId: string): WAState {
  return getState(userId);
}

export function getSocket(userId: string): WASocket | null {
  return waSockets.get(userId) ?? null;
}

export function getConnectedUserName(userId: string): string | null {
  return waSockets.get(userId)?.user?.name ?? null;
}

// ─── Connect ──────────────────────────────────────────────────────────────────

export async function connectToWhatsApp(userId: string): Promise<void> {
  const dir = authDir(userId);
  mkdirSync(dir, { recursive: true });

  const { state: authState, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: authState.creds,
      keys: makeCacheableSignalKeyStore(authState.keys, logger),
    },
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
  });

  waSockets.set(userId, sock);
  setState(userId, { status: "connecting", qrDataUrl: null, qrRaw: null });

  // Forward all registered event handlers for this user
  const userListeners = eventListeners.get(userId) ?? {};
  for (const [event, handlers] of Object.entries(userListeners)) {
    for (const handler of handlers as EventListener<keyof BaileysEventMap>[]) {
      sock.ev.on(
        event as keyof BaileysEventMap,
        handler as EventListener<keyof BaileysEventMap>,
      );
    }
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      setState(userId, {
        status: "qr",
        qrDataUrl: await toDataURL(qr),
        qrRaw: qr,
      });
      console.log(`[viaduct:${userId}] QR ready — open the dashboard to scan.`);
    }

    if (connection === "open") {
      setState(userId, { status: "open", qrDataUrl: null, qrRaw: null });
      console.log(`[viaduct:${userId}] WhatsApp connected.`);
    }

    if (connection === "close") {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;

      console.log(
        `[viaduct:${userId}] Connection closed (reason: ${reason}). Reconnect: ${shouldReconnect}`,
      );

      setState(userId, { status: "closed", qrDataUrl: null, qrRaw: null });

      if (shouldReconnect) {
        setTimeout(() => connectToWhatsApp(userId), 5_000);
      } else {
        console.log(`[viaduct:${userId}] Logged out — delete auth folder to re-link.`);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutWhatsApp(userId: string): Promise<void> {
  const sock = waSockets.get(userId);
  if (sock) {
    try {
      await sock.logout();
    } catch {
      // ignore — socket may already be in a bad state
    }
    waSockets.delete(userId);
  }

  setState(userId, { status: "connecting", qrDataUrl: null, qrRaw: null });

  const dir = authDir(userId);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  // Reconnect to produce a fresh QR
  connectToWhatsApp(userId);
}
