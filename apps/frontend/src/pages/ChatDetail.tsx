import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useParams } from "react-router-dom";
import {
  api,
  fetcher,
  type Chat,
  type Message,
  type Summary,
  type Todo,
} from "../api/client";
import PageHeader from "../components/PageHeader";

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`badge ${type === "group" ? "secondary" : "outline"}`}>
      {type === "group" ? "Group" : "Contact"}
    </span>
  );
}

/** Renders a compact relative/absolute timestamp for a unix epoch (seconds). */
function Timestamp({ ts, prefix }: { ts: number; prefix?: string }) {
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const label = isToday
    ? time
    : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
  return (
    <small style={{ color: "var(--faint-foreground)" }}>
      {prefix ? `${prefix} ${label}` : label}
    </small>
  );
}

function TodoItem({
  todo,
  onToggle,
  summaryPeriod,
}: {
  todo: Todo;
  onToggle: (id: number, done: boolean) => void;
  /** Optional compact label like "Jan 5, 14:32 → 16:00" shown as sub-text */
  summaryPeriod?: string;
}) {
  return (
    <div className="todo-item" style={{ opacity: todo.done ? 0.5 : 1 }}>
      <input
        type="checkbox"
        checked={todo.done === 1}
        onChange={(e) => onToggle(todo.id, e.target.checked)}
        style={{ marginTop: 3, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            textDecoration: todo.done === 1 ? "line-through" : "none",
            lineHeight: 1.5,
          }}
        >
          {todo.text}
        </span>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            marginTop: "0.15rem",
            flexWrap: "wrap",
          }}
        >
          <Timestamp ts={todo.created_at} prefix="Added" />
          {summaryPeriod && (
            <small style={{ color: "var(--faint-foreground)" }}>
              From summary: {summaryPeriod}
            </small>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryBlock({
  summary,
  todoCount,
}: {
  summary: Summary;
  todoCount: number | null;
}) {
  const start = new Date(summary.period_start * 1000).toLocaleString();
  const end   = new Date(summary.period_end   * 1000).toLocaleString();
  return (
    <div className="summary-block" style={{ marginBottom: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.75rem",
          margin: "0 0 0.5rem",
          flexWrap: "wrap",
        }}
      >
        <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0 }}>
          {start} → {end}
        </p>
        {todoCount !== null && todoCount > 0 && (
          <span className="badge warning" style={{ fontSize: "0.7rem" }}>
            {todoCount} to-do{todoCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <p style={{ margin: 0, lineHeight: 1.7 }}>{summary.content}</p>
    </div>
  );
}

type Tab = "summaries" | "todos" | "messages";
type TodoFilter = "all" | "done" | "pending";

export default function ChatDetail() {
  const { jid: encodedJid } = useParams<{ jid: string }>();
  const jid = decodeURIComponent(encodedJid ?? "");
  const { mutate } = useSWRConfig();

  const [tab, setTab]                     = useState<Tab>("summaries");
  const [summarizing, setSummarizing]     = useState(false);
  const [todoFilter, setTodoFilter]       = useState<TodoFilter>("pending");

  const { data: chat } = useSWR<Chat>(api.chat(jid), fetcher);

  // Always fetch all todos so we can correlate counts to summaries
  const { data: allTodos, mutate: mutateTodos } = useSWR<Todo[]>(
    api.todos(jid, "all"),
    fetcher,
  );

  const { data: messages } = useSWR<Message[]>(
    tab === "messages" ? api.messages(jid) : null,
    fetcher,
  );
  const { data: summaries } = useSWR<Summary[]>(
    tab === "summaries" ? api.summaries(jid) : null,
    fetcher,
  );

  // Filtered view for the Todos tab — re-derived from allTodos
  const filteredTodos: Todo[] | undefined = allTodos?.filter((t) => {
    if (todoFilter === "pending") return t.done === 0;
    if (todoFilter === "done")    return t.done === 1;
    return true;
  });

  // Build a map of summaryId → todo count for the Summaries tab
  const todosPerSummary = new Map<number, number>();
  if (allTodos) {
    for (const t of allTodos) {
      todosPerSummary.set(t.summary_id, (todosPerSummary.get(t.summary_id) ?? 0) + 1);
    }
  }

  // Build a map of summaryId → compact period string for the Todos tab
  const summaryPeriodLabel = new Map<number, string>();
  if (summaries) {
    for (const s of summaries) {
      const fmt = (ts: number) =>
        new Date(ts * 1000).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      summaryPeriodLabel.set(s.id, `${fmt(s.period_start)} → ${fmt(s.period_end)}`);
    }
  }

  async function handleToggleTodo(id: number, done: boolean) {
    await api.patchTodo(id, done);
    mutateTodos();
  }

  async function handleSummarize() {
    setSummarizing(true);
    try {
      await api.summarize(jid);
      mutate(api.summaries(jid));
      mutateTodos();
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="page-content">
      <PageHeader backTo="/" />

      {/* Chat title + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>{chat?.name ?? jid}</h1>
          {chat && <TypeBadge type={chat.type} />}
        </div>
        <button
          onClick={handleSummarize}
          disabled={summarizing}
          aria-busy={summarizing || undefined}
          data-spinner={summarizing ? "small" : undefined}
          style={{ alignSelf: "flex-start", marginTop: "0.25rem" }}
        >
          {summarizing ? "Summarizing…" : "Summarize now"}
        </button>
      </div>

      {/* Tabs */}
      <ot-tabs>
        <div role="tablist">
          {(["summaries", "todos", "messages"] as Tab[]).map((t) => (
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

        {/* Summaries */}
        <div role="tabpanel" style={{ display: tab === "summaries" ? undefined : "none" }}>
          {!summaries ? (
            <>
              <div role="status" className="skeleton line" style={{ marginBottom: "0.5rem" }} />
              <div role="status" className="skeleton line" style={{ width: "70%" }} />
            </>
          ) : summaries.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <p className="empty-state-title">No summaries yet</p>
              <p className="empty-state-body">
                Hit "Summarize now" to run the AI pipeline on indexed messages,
                or wait for the quiet period to trigger it automatically.
              </p>
            </div>
          ) : (
            summaries.map((s) => (
              <SummaryBlock
                key={s.id}
                summary={s}
                todoCount={allTodos ? (todosPerSummary.get(s.id) ?? 0) : null}
              />
            ))
          )}
        </div>

        {/* Todos */}
        <div role="tabpanel" style={{ display: tab === "todos" ? undefined : "none" }}>
          {/* Filter chips */}
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            {(["pending", "all", "done"] as TodoFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setTodoFilter(f)}
                className={todoFilter === f ? "small" : "small outline"}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {!filteredTodos ? (
            <div role="status" className="skeleton line" />
          ) : filteredTodos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>
              <p className="empty-state-title">
                {todoFilter === "pending" ? "No pending tasks" :
                 todoFilter === "done"    ? "No completed tasks" :
                                           "No tasks yet"}
              </p>
              <p className="empty-state-body">
                {todoFilter === "pending"
                  ? "All tasks from this conversation are done."
                  : todoFilter === "done"
                  ? "No tasks have been marked done yet."
                  : "Tasks are extracted automatically when a summary is generated."}
              </p>
            </div>
          ) : (
            filteredTodos.map((t) => (
              <TodoItem
                key={t.id}
                todo={t}
                onToggle={handleToggleTodo}
                summaryPeriod={summaryPeriodLabel.get(t.summary_id)}
              />
            ))
          )}
        </div>

        {/* Messages */}
        <div role="tabpanel" style={{ display: tab === "messages" ? undefined : "none" }}>
          {!messages ? (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ marginBottom: "0.5rem" }}>
                  <div
                    role="status"
                    className="skeleton line"
                    style={{ width: "40%", marginBottom: "0.25rem" }}
                  />
                  <div role="status" className="skeleton line" />
                </div>
              ))}
            </>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="empty-state-title">No pending messages</p>
              <p className="empty-state-body">
                All messages have been summarized and removed. New messages will appear here until the next summary is generated.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {[...messages].reverse().map((m) => (
                <div key={m.id} className="message-bubble">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "0.5rem",
                      marginBottom: "0.25rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <strong style={{ fontSize: "0.8rem" }}>{m.sender_name}</strong>
                    <small style={{ color: "var(--faint-foreground)" }}>
                      {new Date(m.timestamp * 1000).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>{m.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </ot-tabs>
    </div>
  );
}
