import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Link, NavLink } from "react-router-dom";
import {
  api,
  fetcher,
  type DashboardChat,
  type TodoWithChat,
} from "../api/client";
import PageHeader, { GearIcon } from "../components/PageHeader";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function TypeBadge({ type, small }: { type: string; small?: boolean }) {
  return (
    <span className={`badge ${type === "group" ? "secondary" : "outline"}${small ? " small" : ""}`}>
      {type === "group" ? "Group" : "Contact"}
    </span>
  );
}

function formatDateTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const isThisYear = d.getFullYear() === now.getFullYear();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today, ${time}`;
  if (isThisYear)
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
  return `${d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}, ${time}`;
}

// ─── Conversations tab ────────────────────────────────────────────────────────

function ChatCard({ chat }: { chat: DashboardChat }) {
  return (
    <Link
      to={`/chat/${encodeURIComponent(chat.jid)}`}
      className="chat-card-link"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <article className="card chat-card">
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <strong
            style={{
              fontSize: "0.95rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {chat.name || chat.jid}
          </strong>
          <TypeBadge type={chat.type} />
        </header>

        {chat.last_summary_content ? (
          <p
            style={{
              fontSize: "0.85rem",
              color: "var(--muted-foreground)",
              margin: "0.5rem 0 0.75rem",
              lineHeight: 1.55,
            }}
          >
            {chat.last_summary_content.slice(0, 140)}
            {chat.last_summary_content.length > 140 ? "…" : ""}
          </p>
        ) : (
          <p
            style={{
              fontSize: "0.85rem",
              color: "var(--faint-foreground)",
              fontStyle: "italic",
              margin: "0.5rem 0 0.75rem",
            }}
          >
            No summary yet
          </p>
        )}

        <footer
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}
        >
          {chat.pending_todos > 0 ? (
            <span className="badge warning">
              {chat.pending_todos} open to-do{chat.pending_todos !== 1 ? "s" : ""}
            </span>
          ) : (
            <span />
          )}
          {chat.last_summary_at && (
            <small style={{ color: "var(--faint-foreground)" }}>
              {formatDateTime(chat.last_summary_at)}
            </small>
          )}
        </footer>
      </article>
    </Link>
  );
}

function ChatGrid({ chats }: { chats: DashboardChat[] }) {
  const sorted = [...chats].sort(
    (a, b) => (b.last_summary_at ?? 0) - (a.last_summary_at ?? 0),
  );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "1rem",
      }}
    >
      {sorted.map((chat) => (
        <ChatCard key={chat.jid} chat={chat} />
      ))}
    </div>
  );
}

// ─── Tasks tab ────────────────────────────────────────────────────────────────

function TaskRow({
  todo,
  onToggle,
}: {
  todo: TodoWithChat;
  onToggle: (id: number, done: boolean) => void;
}) {
  return (
    <div className="todo-item">
      <input
        type="checkbox"
        checked={false}
        onChange={(e) => onToggle(todo.id, e.target.checked)}
        style={{ marginTop: 3, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ lineHeight: 1.5 }}>{todo.text}</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "0.2rem",
            flexWrap: "wrap",
          }}
        >
          <small style={{ color: "var(--faint-foreground)" }}>
            {formatDateTime(todo.created_at)}
          </small>
          <span style={{ color: "var(--faint-foreground)", fontSize: "0.7rem" }}>·</span>
          <Link
            to={`/chat/${encodeURIComponent(todo.chat_jid)}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              fontSize: "0.8rem",
              color: "var(--muted-foreground)",
              textDecoration: "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <TypeBadge type={todo.chat_type} small />
            <span>{todo.chat_name || todo.chat_jid}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function TasksTab() {
  const { mutate } = useSWRConfig();
  const { data: todos, mutate: mutateTodos } = useSWR<TodoWithChat[]>(
    api.allTodos(),
    fetcher,
    { refreshInterval: 15_000 },
  );

  async function handleToggle(id: number, done: boolean) {
    await api.patchTodo(id, done);
    mutateTodos();
    mutate((key) => typeof key === "string" && key.includes("/todos"), undefined, {
      revalidate: true,
    });
  }

  if (!todos) {
    return (
      <>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ marginBottom: "0.75rem" }}>
            <div
              role="status"
              className="skeleton line"
              style={{ width: "70%", marginBottom: "0.35rem" }}
            />
            <div role="status" className="skeleton line" style={{ width: "40%" }} />
          </div>
        ))}
      </>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <p className="empty-state-title">All caught up</p>
        <p className="empty-state-body">
          There are no open tasks across any of your conversations.
          Tasks appear here automatically after a summary is generated.
        </p>
      </div>
    );
  }

  return (
    <>
      {todos.map((t) => (
        <TaskRow key={t.id} todo={t} onToggle={handleToggle} />
      ))}
    </>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

type DashTab = "conversations" | "tasks";

export default function Dashboard() {
  const [tab, setTab] = useState<DashTab>("conversations");

  const { data: dashChats, error } = useSWR<DashboardChat[]>(
    api.dashboard(),
    fetcher,
    { refreshInterval: 10_000 },
  );

  if (error) {
    return (
      <div className="page-content">
        <PageHeader />
        <div role="alert" data-variant="error">
          Failed to load chats.
        </div>
      </div>
    );
  }

  // Only show chats that have at least a summary, pending todos, or unsummarized messages
  const active = dashChats?.filter(
    (c) => c.last_summary_content !== null || c.pending_todos > 0 || c.message_count > 0,
  ) ?? [];

  return (
    <div className="page-content">
      <PageHeader hideSettings />

      <ot-tabs>
        <div role="tablist" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            {(["conversations", "tasks"] as DashTab[]).map((t) => (
              <button
                key={t}
                role="tab"
                onClick={() => setTab(t)}
                aria-selected={tab === t || undefined}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <NavLink to="/settings" className="page-header-settings" aria-label="Settings" title="Settings">
            <GearIcon />
          </NavLink>
        </div>

        {/* Conversations */}
        <div role="tabpanel" style={{ display: tab === "conversations" ? undefined : "none" }}>
          {!dashChats ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "1rem",
              }}
            >
              {[1, 2, 3].map((i) => (
                <article
                  key={i}
                  style={{
                    padding: "1.2rem",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                  }}
                >
                  <div
                    role="status"
                    className="skeleton line"
                    style={{ marginBottom: "0.75rem" }}
                  />
                  <div
                    role="status"
                    className="skeleton line"
                    style={{ width: "80%", marginBottom: "0.5rem" }}
                  />
                  <div role="status" className="skeleton line" style={{ width: "60%" }} />
                </article>
              ))}
            </div>
          ) : active.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="empty-state-title">No conversations monitored yet</p>
              <p className="empty-state-body">
                Add a WhatsApp group or contact in Settings and Viaduct will start
                indexing messages, generating summaries, and extracting to-dos.
              </p>
              <Link to="/settings" className="button small outline">
                Go to Settings →
              </Link>
            </div>
          ) : (
            <ChatGrid chats={active} />
          )}
        </div>

        {/* Tasks */}
        <div role="tabpanel" style={{ display: tab === "tasks" ? undefined : "none" }}>
          <TasksTab />
        </div>
      </ot-tabs>
    </div>
  );
}
