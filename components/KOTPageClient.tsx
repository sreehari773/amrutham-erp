"use client";

import { useState } from "react";
import { getKOTForDate } from "@/app/actions/operational";
import { formatDateIST } from "@/lib/utils";

type KOTEntry = {
  subscription_id: number;
  name: string;
  address: string;
  phone: string;
};

type Props = {
  initialDate: string;
  initialEntries: KOTEntry[];
  initialError?: string | null;
};

export default function KOTPageClient({ initialDate, initialEntries, initialError = null }: Props) {
  const [date, setDate] = useState(initialDate);
  const [entries, setEntries] = useState<KOTEntry[]>(initialEntries);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function loadEntries(nextDate: string) {
    setLoading(true);
    const res = await getKOTForDate(nextDate);
    setLoading(false);

    if (res.error) {
      setError(res.error);
      setEntries([]);
      return;
    }

    setError(null);
    setEntries(JSON.parse(JSON.stringify(res.data ?? [])) as KOTEntry[]);
  }

  async function handleDateChange(nextDate: string) {
    setDate(nextDate);
    await loadEntries(nextDate);
  }

  return (
    <div className="page-stack">
      <section className="page-hero no-print anim-in">
        <div>
          <p className="page-eyebrow">Dispatch sheet</p>
          <h1 className="page-title">Kitchen Order Ticket</h1>
          <p className="page-subtitle">
            <strong>{entries.length}</strong> order{entries.length !== 1 ? "s" : ""} queued for {formatDateIST(date)}.
          </p>
        </div>
        <div className="hero-meta" style={{ minWidth: "260px" }}>
          <input type="date" value={date} onChange={(event) => void handleDateChange(event.target.value)} className="input-field" />
          <div style={{ display: "flex", gap: "10px", width: "100%" }}>
            <button onClick={() => void loadEntries(date)} disabled={loading} className="btn-ghost" style={{ flex: 1 }}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button onClick={() => window.print()} className="btn-primary" style={{ flex: 1 }}>
              Print KOT
            </button>
          </div>
        </div>
      </section>

      <div className="hidden print:block" style={{ marginBottom: "18px" }}>
        <h1 style={{ margin: 0, fontSize: "1.2rem" }}>Amrutham Kitchen Order Ticket</h1>
        <p style={{ margin: "6px 0 0" }}>Date: {formatDateIST(date)} | Total: {entries.length} orders</p>
      </div>

      {error && <div className="status-banner status-banner-error">{error}</div>}

      {loading ? (
        <section className="panel">
          <div className="empty-state">
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: "var(--ink)" }}>Loading orders</p>
              <p style={{ margin: "8px 0 0" }}>Fetching the latest KOT from the ERP.</p>
            </div>
          </div>
        </section>
      ) : entries.length === 0 ? (
        <section className="panel">
          <div className="empty-state">
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: "var(--ink)" }}>No orders for this date</p>
              <p style={{ margin: "8px 0 0" }}>Try another delivery date or refresh the ticket.</p>
            </div>
          </div>
        </section>
      ) : (
        <section className="table-wrap anim-in">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Customer</th>
                <th>Address</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={entry.subscription_id}>
                  <td>
                    <span className="badge badge-active">{index + 1}</span>
                  </td>
                  <td style={{ fontWeight: 700, color: "var(--ink)" }}>{entry.name}</td>
                  <td style={{ color: "var(--ink-soft)" }}>{entry.address || "--"}</td>
                  <td style={{ color: "var(--ink-soft)" }}>{entry.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
