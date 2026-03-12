"use client";

import { useState } from "react";
import { runDailyReconciliation, type ReconciliationResult } from "@/app/actions/reconciliation";
import { generateForecast, type ForecastData } from "@/app/actions/forecast";
import { getManifest, type ManifestEntry } from "@/app/actions/manifest";
import { markMessageSent, type MessagingEvent } from "@/app/actions/messaging";

type Props = {
  initialForecast: ForecastData;
  initialManifest: ManifestEntry[];
  initialReconciliation: ReconciliationResult | null;
  initialMessages: MessagingEvent[];
  today: string;
  tomorrow: string;
};

export default function OperationsClient({
  initialForecast,
  initialManifest,
  initialReconciliation,
  initialMessages,
  today,
  tomorrow,
}: Props) {
  const [forecast, setForecast] = useState(initialForecast);
  const [manifest, setManifest] = useState(initialManifest);
  const [recon, setRecon] = useState(initialReconciliation);
  const [messages, setMessages] = useState(initialMessages);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleRunReconciliation() {
    setLoading(true);
    setMessage(null);
    const result = await runDailyReconciliation(today);
    setLoading(false);

    if (result.error) {
      setMessage({ type: "error", text: result.error });
      return;
    }

    setRecon(result.data ?? null);
    setMessage({
      type: "success",
      text: `Reconciliation complete: ${result.data?.delivered ?? 0} delivered, ${result.data?.resumed ?? 0} resumed, ${result.data?.graced ?? 0} grace triggered.`,
    });

    // Refresh manifest and forecast
    const [f, m] = await Promise.all([generateForecast(tomorrow), getManifest(today)]);
    if (f.data) setForecast(f.data);
    setManifest(m.data ?? []);
  }

  async function handleRefreshForecast() {
    const result = await generateForecast(tomorrow);
    if (result.data) setForecast(result.data);
  }

  async function handleMarkSent(eventId: number) {
    await markMessageSent(eventId);
    setMessages((prev) =>
      prev.map((m) => (m.id === eventId ? { ...m, status: "sent", sent_at: new Date().toISOString() } : m)),
    );
  }

  return (
    <div className="page-stack">
      {/* Reconciliation Section */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Daily reconciliation</h2>
            <p className="panel-copy">
              Resume paused subs, mark deliveries, trigger grace meals, generate forecast and manifests.
            </p>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={handleRunReconciliation}
              disabled={loading}
            >
              {loading ? "Running..." : "Run Reconciliation"}
            </button>
          </div>
        </div>

        {message ? (
          <div className={`alert ${message.type === "error" ? "alert-error" : "alert-success"}`}>
            {message.text}
          </div>
        ) : null}

        {recon ? (
          <div className="metric-grid">
            <div className="metric-card">
              <strong>Run Date</strong>
              <span>{recon.run_date}</span>
            </div>
            <div className="metric-card">
              <strong>Delivered</strong>
              <span>{recon.delivered}</span>
            </div>
            <div className="metric-card">
              <strong>Resumed</strong>
              <span>{recon.resumed}</span>
            </div>
            <div className="metric-card">
              <strong>Expired</strong>
              <span>{recon.expired}</span>
            </div>
            <div className="metric-card">
              <strong>Grace Triggered</strong>
              <span>{recon.graced}</span>
            </div>
            <div className="metric-card">
              <strong>Forecast</strong>
              <span>{recon.forecast_generated ? "Generated" : "Pending"}</span>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <strong>No reconciliation run today</strong>
            <span>Click &quot;Run Reconciliation&quot; to start.</span>
          </div>
        )}

        {recon?.errors && recon.errors.length > 0 ? (
          <div className="alert alert-error" style={{ marginTop: 12 }}>
            <strong>Errors:</strong>
            <ul style={{ margin: "8px 0 0 16px" }}>
              {recon.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="grid-columns-2">
        {/* Kitchen Forecast */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Kitchen forecast</h2>
              <p className="panel-copy">Meal counts for tomorrow ({tomorrow})</p>
            </div>
            <div className="panel-actions">
              <button type="button" className="btn-secondary" onClick={handleRefreshForecast}>
                Refresh
              </button>
            </div>
          </div>
          <div className="metric-grid">
            <div className="metric-card">
              <strong>Veg</strong>
              <span style={{ fontSize: 28, fontWeight: 700, color: "#16a34a" }}>{forecast.veg_count}</span>
            </div>
            <div className="metric-card">
              <strong>Non-Veg</strong>
              <span style={{ fontSize: 28, fontWeight: 700, color: "#dc2626" }}>{forecast.non_veg_count}</span>
            </div>
            <div className="metric-card">
              <strong>Mixed</strong>
              <span style={{ fontSize: 28, fontWeight: 700, color: "#d97706" }}>{forecast.mixed_count}</span>
            </div>
            <div className="metric-card">
              <strong>Total</strong>
              <span style={{ fontSize: 28, fontWeight: 700, color: "#2563eb" }}>{forecast.total_count}</span>
            </div>
          </div>
        </div>

        {/* Messaging Events */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Recent messages</h2>
              <p className="panel-copy">WhatsApp messaging queue and history</p>
            </div>
          </div>
          {messages.length === 0 ? (
            <div className="empty-state">
              <strong>No messages yet</strong>
              <span>Messages are queued during reconciliation.</span>
            </div>
          ) : (
            <div className="list-stack">
              {messages.slice(0, 10).map((evt) => (
                <div className="list-item" key={evt.id}>
                  <div className="list-item-copy">
                    <strong>
                      {evt.event_type.replace(/_/g, " ")}
                      {evt.subscription_id ? ` — Sub #${evt.subscription_id}` : ""}
                    </strong>
                    <span style={{ fontSize: 12 }}>
                      {evt.message_text?.slice(0, 80)}
                      {(evt.message_text?.length ?? 0) > 80 ? "..." : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div className={`badge badge-${evt.status === "sent" ? "completed" : evt.status === "failed" ? "cancelled" : "active"}`}>
                      {evt.status}
                    </div>
                    {evt.status === "pending" ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ fontSize: 12, padding: "2px 8px" }}
                        onClick={() => handleMarkSent(evt.id)}
                      >
                        Mark sent
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Delivery Manifest */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Delivery manifest</h2>
            <p className="panel-copy">
              Today&apos;s delivery list ({today}) — {manifest.length} deliveries sorted by route
            </p>
          </div>
          <div className="panel-actions">
            <div className="chip">{manifest.length} deliveries</div>
          </div>
        </div>

        {manifest.length === 0 ? (
          <div className="empty-state">
            <strong>No deliveries for today</strong>
            <span>Run reconciliation or check the date.</span>
          </div>
        ) : (
          <div className="table-shell">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th>Meal</th>
                    <th>Route</th>
                    <th>Driver</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {manifest.map((entry) => (
                    <tr key={entry.subscription_id}>
                      <td><strong>{entry.name}</strong></td>
                      <td>{entry.phone}</td>
                      <td style={{ maxWidth: 200, whiteSpace: "normal" }}>{entry.address || "—"}</td>
                      <td>
                        <div className={`badge badge-${entry.meal_preference === "veg" ? "active" : entry.meal_preference === "non_veg" ? "cancelled" : "completed"}`}>
                          {entry.meal_preference?.replace("_", "-") ?? "veg"}
                        </div>
                      </td>
                      <td>{entry.route_name || "Unassigned"}</td>
                      <td>{entry.driver_name || "—"}</td>
                      <td>
                        <div className={`badge badge-${entry.status?.toLowerCase()}`}>
                          {entry.status}
                        </div>
                      </td>
                      <td style={{ maxWidth: 150, whiteSpace: "normal", fontSize: 12 }}>
                        {entry.delivery_notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
