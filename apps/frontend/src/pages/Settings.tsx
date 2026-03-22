import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api, fetcher, type Chat, type AppConfig } from "../api/client";
import PageHeader from "../components/PageHeader";

// Rotate-CW icon (refresh)
function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`badge ${type === "group" ? "secondary" : "outline"}`} style={{ flexShrink: 0 }}>
      {type === "group" ? "G" : "C"}
    </span>
  );
}

function WatchedChatRow({
  chat,
  onRemove,
  onRefresh,
}: {
  chat: Chat;
  onRemove: (jid: string) => void;
  onRefresh?: (jid: string) => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (!onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(chat.jid); } finally { setRefreshing(false); }
  }

  return (
    <tr>
      <td><TypeBadge type={chat.type} /></td>
      <td><strong style={{ fontSize: "0.9rem" }}>{chat.name || chat.jid}</strong></td>
      <td style={{ color: "var(--muted-foreground)", fontSize: "0.75rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {chat.jid}
      </td>
      <td>
        <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
          {onRefresh && (
            <button
              className="outline small"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-busy={refreshing || undefined}
              data-spinner={refreshing ? "small" : undefined}
              title="Re-fetch group name from WhatsApp"
              style={{ padding: "0.2rem 0.45rem" }}
            >
              <RefreshIcon />
            </button>
          )}
          <button
            data-variant="danger"
            className="outline small"
            onClick={() => onRemove(chat.jid)}
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddChatForm({ onAdded }: { onAdded: () => void }) {
  const [type, setType]   = useState<"group" | "contact">("contact");
  const [input, setInput] = useState("");
  const [name, setName]   = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!input.trim()) return;
    setLoading(true);
    try {
      const isPhone = /^\+?[\d\s\-()]+$/.test(input.trim());
      await api.addChat({
        ...(isPhone ? { phone: input.trim() } : { jid: input.trim() }),
        name: name.trim() || undefined,
        type,
      });
      setInput("");
      setName("");
      onAdded();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add chat");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "0.5rem" }}>
        <div data-field style={{ marginBottom: 0 }}>
          <label>
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "group" | "contact")}
              aria-label="Chat type"
            >
              <option value="contact">Contact</option>
              <option value="group">Group</option>
            </select>
          </label>
        </div>

        <div data-field style={{ flex: 2, minWidth: 180, marginBottom: 0 }}>
          <label>
            {type === "contact" ? "Phone or JID" : "Group JID"}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={type === "contact" ? "+971… or …@s.whatsapp.net" : "…@g.us"}
            />
          </label>
        </div>

        <div data-field style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
          <label>
            Display name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          aria-busy={loading || undefined}
          style={{ alignSelf: "flex-end", marginBottom: 0 }}
        >
          {loading ? "Adding…" : "Add"}
        </button>
      </div>

      {type === "contact" && (
        <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", margin: 0 }}>
          Enter a phone number like <code>+971501234567</code> or a full JID.
        </p>
      )}
      {error && (
        <div role="alert" data-variant="error" style={{ marginTop: "0.5rem" }}>{error}</div>
      )}
    </form>
  );
}

export default function Settings() {
  const { mutate } = useSWRConfig();
  const { data: chats, mutate: mutateChats } = useSWR<Chat[]>(api.chats(), fetcher);
  const { data: config, mutate: mutateConfig } = useSWR<AppConfig>(api.config(), fetcher);

  const [quietMinutes, setQuietMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  async function handleRemove(jid: string) {
    await api.removeChat(jid);
    mutateChats();
    mutate(api.chats());
  }

  async function handleRefreshName(jid: string) {
    await api.refreshName(jid);
    mutateChats();
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api.logout();
      // The backend will reconnect and emit a new QR — the QRCodePrompt
      // overlay will reappear automatically as soon as /api/status returns
      // a non-"open" state.
    } finally {
      setLoggingOut(false);
      setConfirmLogout(false);
    }
  }

  async function toggleAllContacts(checked: boolean) {
    await api.patchConfig({ allow_all_contacts: checked });
    mutateConfig();
  }

  async function toggleAllGroups(checked: boolean) {
    await api.patchConfig({ allow_all_groups: checked });
    mutateConfig();
  }

  async function saveQuietPeriod(e: React.FormEvent) {
    e.preventDefault();
    const mins = parseInt(quietMinutes, 10);
    if (isNaN(mins) || mins < 1) return;
    setSaving(true);
    await api.patchConfig({ quiet_period_minutes: mins });
    mutateConfig();
    setQuietMinutes("");
    setSaving(false);
  }

  const groups   = chats?.filter((c) => c.type === "group"   && c.active === 1) ?? [];
  const contacts = chats?.filter((c) => c.type === "contact" && c.active === 1) ?? [];
  const allContactsOn = config?.allow_all_contacts ?? false;
  const allGroupsOn   = config?.allow_all_groups   ?? false;

  return (
    <div className="page-content">
      <PageHeader backTo="/" hideSettings />
      <h1 style={{ marginBottom: "0.25rem" }}>Settings</h1>
      <p style={{ color: "var(--muted-foreground)", marginTop: 0, marginBottom: "2rem", fontSize: "0.875rem" }}>
        Configure monitoring and summarization behaviour.
      </p>

      {/* General */}
      <article className="card" style={{ marginBottom: "1.5rem" }}>
        <header><h3>General</h3></header>

        {/* All contacts toggle */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <strong>Monitor all individual chats</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
              Every 1-to-1 conversation is automatically indexed.
            </p>
          </div>
          <label>
            <input
              type="checkbox"
              role="switch"
              checked={allContactsOn}
              onChange={(e) => toggleAllContacts(e.target.checked)}
            />
            {allContactsOn && <span className="badge success" style={{ marginLeft: 8 }}>On</span>}
          </label>
        </div>

        {/* All groups toggle */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <strong>Monitor all groups</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
              Every group message is automatically indexed.
            </p>
          </div>
          <label>
            <input
              type="checkbox"
              role="switch"
              checked={allGroupsOn}
              onChange={(e) => toggleAllGroups(e.target.checked)}
            />
            {allGroupsOn && <span className="badge success" style={{ marginLeft: 8 }}>On</span>}
          </label>
        </div>

        {/* Quiet period */}
        <form onSubmit={saveQuietPeriod}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <strong>Quiet period before summarization</strong>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
                Currently <strong>{config?.quiet_period_minutes ?? "…"} minutes</strong> of silence triggers AI summarization.
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="number"
                min={1}
                placeholder={String(config?.quiet_period_minutes ?? 30)}
                value={quietMinutes}
                onChange={(e) => setQuietMinutes(e.target.value)}
                style={{ width: 80 }}
                aria-label="Quiet period in minutes"
              />
              <button type="submit" disabled={saving} className="outline" aria-busy={saving || undefined}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </article>

      {/* Add chat */}
      <article className="card" style={{ marginBottom: "1.5rem" }}>
        <header><h3>Add a chat</h3></header>
        <AddChatForm onAdded={() => mutateChats()} />
      </article>

      {/* Watched groups */}
      <article className="card" style={{ marginBottom: "1.5rem" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Watched Groups</h3>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <span className="badge secondary">{groups.length}</span>
            {allGroupsOn && <span className="badge success">All on</span>}
          </div>
        </header>
        {groups.length === 0 ? (
          <p style={{ color: "var(--muted-foreground)", fontStyle: "italic", fontSize: "0.875rem" }}>
            No groups being monitored.
          </p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Name</th>
                  <th>JID</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((c) => <WatchedChatRow key={c.jid} chat={c} onRemove={handleRemove} onRefresh={handleRefreshName} />)}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {/* Watched contacts */}
      <article className="card">
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Watched Contacts</h3>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <span className="badge secondary">{contacts.length}</span>
            {allContactsOn && <span className="badge success">All on</span>}
          </div>
        </header>
        {contacts.length === 0 ? (
          <p style={{ color: "var(--muted-foreground)", fontStyle: "italic", fontSize: "0.875rem" }}>
            No individual contacts added.
          </p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Name</th>
                  <th>JID</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => <WatchedChatRow key={c.jid} chat={c} onRemove={handleRemove} />)}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {/* Account */}
      <article className="card" style={{ marginTop: "1.5rem" }}>
        <header><h3>Account</h3></header>

        {/* Unlink WhatsApp device */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", paddingBottom: "1.25rem", borderBottom: "1px solid var(--border)" }}>
          <div>
            <strong>Unlink device</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
              Removes the WhatsApp session and returns to the QR code screen.
            </p>
          </div>
          {confirmLogout ? (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>Are you sure?</span>
              <button
                data-variant="danger"
                className="small"
                onClick={handleLogout}
                disabled={loggingOut}
                aria-busy={loggingOut || undefined}
                data-spinner={loggingOut ? "small" : undefined}
              >
                {loggingOut ? "Unlinking…" : "Yes, unlink"}
              </button>
              <button className="small outline" onClick={() => setConfirmLogout(false)} disabled={loggingOut}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              data-variant="danger"
              className="outline small"
              onClick={() => setConfirmLogout(true)}
            >
              Unlink
            </button>
          )}
        </div>

        {/* Log out of Viaduct */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", paddingTop: "1.25rem" }}>
          <div>
            <strong>Log out</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
              End your Viaduct session.
            </p>
          </div>
          <button
            className="outline small"
            onClick={() => {
              const logoutUrl = config?.logoutUrl ?? "";
              if (logoutUrl) window.location.href = logoutUrl;
            }}
          >
            Log out
          </button>
        </div>
      </article>
    </div>
  );
}
