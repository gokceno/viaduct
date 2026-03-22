import { DateTime, Duration } from "luxon";
import { runAIPipeline } from "../ai/gemini.js";
import {
  getChatByJid,
  deleteMessagesByIds,
  getRecentSummaries,
  getRecentTodos,
  getSetting,
  getUnsummarizedMessages,
  insertSummary,
  insertTodos,
} from "../db/queries.js";
import type { UserDb } from "../db/client.js";
import { getConnectedUserName } from "../whatsapp/client.js";

// Timer key: "${userId}:${chatJid}"
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function getQuietPeriodMs(db: UserDb): number {
  const minutes = parseInt(getSetting(db, "quiet_period_minutes") ?? "30", 10);
  return Duration.fromObject({ minutes: isNaN(minutes) ? 30 : minutes }).toMillis();
}

export function scheduleQuietCheck(userId: string, db: UserDb, chatJid: string): void {
  const key = `${userId}:${chatJid}`;
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);

  const delay = getQuietPeriodMs(db);

  const timer = setTimeout(async () => {
    timers.delete(key);
    await triggerSummarization(userId, db, chatJid);
  }, delay);

  timers.set(key, timer);
}

export async function triggerSummarization(
  userId: string,
  db: UserDb,
  chatJid: string,
): Promise<{ summaryId: number; todosCount: number } | null> {
  const messages = getUnsummarizedMessages(db, chatJid);
  if (messages.length === 0) {
    console.log(`[viaduct:${userId}] No unsummarized messages for ${chatJid} — skipping.`);
    return null;
  }

  const chat = getChatByJid(db, chatJid);
  const chatName = chat?.name ?? chatJid;
  const priorSummaries = getRecentSummaries(db, chatJid, 5);
  const priorTodos = getRecentTodos(db, chatJid, 5);
  const userName = getConnectedUserName(userId);

  console.log(
    `[viaduct:${userId}] Summarizing ${messages.length} messages for "${chatName}"...`,
  );

  try {
    const { summary, todos } = await runAIPipeline(
      chatName,
      messages,
      priorSummaries,
      userName,
      priorTodos,
    );

    const periodStart = messages[0].timestamp;
    const periodEnd = messages[messages.length - 1].timestamp;
    const now = DateTime.now().toUnixInteger();

    const summaryId = insertSummary(db, {
      chat_jid: chatJid,
      period_start: periodStart,
      period_end: periodEnd,
      content: summary,
      created_at: now,
    });

    const todoRows = todos.map((t) => ({
      summary_id: summaryId,
      chat_jid: chatJid,
      text: t.assignee ? `[${t.assignee}] ${t.text}` : t.text,
      done: 0,
      created_at: now,
    }));

    insertTodos(db, todoRows);
    deleteMessagesByIds(db, messages.map((m) => m.id));

    console.log(
      `[viaduct:${userId}] Done — summary #${summaryId}, ${todos.length} todos extracted.`,
    );

    return { summaryId, todosCount: todos.length };
  } catch (err) {
    console.error(`[viaduct:${userId}] AI pipeline failed for ${chatJid}:`, err);
    return null;
  }
}

export function clearAllTimers(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}
