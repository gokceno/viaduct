import useSWR from "swr";
import { QRCodeSVG } from "qrcode.react";
import { api, fetcher, type WAStatus } from "../api/client";

export default function QRCodePrompt() {
  const { data } = useSWR<WAStatus>(api.status(), fetcher, {
    refreshInterval: 3000,
  });

  if (!data || data.whatsapp === "open") return null;

  return (
    <div className="qr-overlay">
      <article className="card" style={{ maxWidth: 340, width: "100%", textAlign: "center" }}>
        <header>
          <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, margin: "0 0 0.25rem" }}>
            Connect WhatsApp
          </h2>
        </header>

        {data.whatsapp === "qr" && data.qrRaw ? (
          <>
            <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem", margin: "0 0 1.5rem" }}>
              Open WhatsApp → Linked Devices → Link a Device
            </p>
            <div style={{
              display: "inline-block",
              padding: 14,
              background: "#fff",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
            }}>
              <QRCodeSVG value={data.qrRaw} size={220} />
            </div>
            <p style={{ color: "var(--faint-foreground)", fontSize: "0.75rem", marginTop: "1rem", marginBottom: 0 }}>
              QR refreshes automatically every ~60 s
            </p>
          </>
        ) : (
          <div style={{ padding: "1.5rem 0" }}>
            <div aria-busy="true" data-spinner="large" style={{ margin: "0 auto 1rem" }} />
            <p style={{ color: "var(--muted-foreground)", margin: 0 }}>
              {data.whatsapp === "connecting"
                ? "Connecting to WhatsApp…"
                : "Connection closed. Reconnecting…"}
            </p>
          </div>
        )}
      </article>
    </div>
  );
}
