// All shared types come from @viaduct/types (single source of truth)
export type {
  Chat,
  DashboardChat,
  Message,
  Summary,
  Todo,
  TodoWithChat,
  AppConfig,
  WAStatus,
  Me,
} from "@viaduct/types";

import type { Chat, DashboardChat, Todo, AppConfig, Me } from "@viaduct/types";

// ─── Fetcher for SWR ─────────────────────────────────────────────────────────

export const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  });

// ─── API helpers ──────────────────────────────────────────────────────────────

const BASE = "/api";

export const api = {
  me: () => `${BASE}/me`,
  status: () => `${BASE}/status`,
  dashboard: () => `${BASE}/dashboard`,
  chats: () => `${BASE}/chats`,
  chat: (jid: string) => `${BASE}/chats/${encodeURIComponent(jid)}`,
  allTodos: () => `${BASE}/todos`,
  messages: (jid: string, limit = 50, offset = 0) =>
    `${BASE}/chats/${encodeURIComponent(jid)}/messages?limit=${limit}&offset=${offset}`,
  summaries: (jid: string) =>
    `${BASE}/chats/${encodeURIComponent(jid)}/summaries`,
  todos: (jid: string, filter: "all" | "done" | "pending" = "all") =>
    `${BASE}/chats/${encodeURIComponent(jid)}/todos?filter=${filter}`,
  config: () => `${BASE}/config`,

  async patchTodo(id: number, done: boolean): Promise<Todo> {
    const r = await fetch(`${BASE}/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async summarize(
    jid: string,
  ): Promise<{ summaryId: number; todosCount: number } | { message: string }> {
    const r = await fetch(`${BASE}/summarize/${encodeURIComponent(jid)}`, {
      method: "POST",
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async patchConfig(body: Partial<AppConfig>): Promise<AppConfig> {
    const r = await fetch(`${BASE}/config/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async addChat(payload: {
    jid?: string;
    phone?: string;
    name?: string;
    type?: "group" | "contact";
  }): Promise<Chat> {
    const r = await fetch(`${BASE}/config/chats`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", ...payload }),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async removeChat(jid: string): Promise<void> {
    const r = await fetch(`${BASE}/config/chats`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", jid }),
    });
    if (!r.ok) throw new Error(await r.text());
  },

  async refreshName(jid: string): Promise<{ name: string }> {
    const r = await fetch(
      `${BASE}/chats/${encodeURIComponent(jid)}/refresh-name`,
      { method: "POST" },
    );
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async logout(): Promise<void> {
    const r = await fetch(`${BASE}/logout`, { method: "POST" });
    if (!r.ok) throw new Error(await r.text());
  },

  async getMe(): Promise<Me> {
    const r = await fetch(`${BASE}/me`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
};
