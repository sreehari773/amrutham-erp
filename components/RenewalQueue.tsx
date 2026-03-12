"use client";

import { useState } from "react";
import { markReminded } from "@/app/actions/sprint1";
import { formatTimestampIST } from "@/lib/utils";

type QueueItem = {
  subscription_id: number;
  customer_name: string;
  phone: string;
  remaining_tiffins: number;
  last_reminded_at: string | null;
};

type Props = {
  initialQueue?: QueueItem[];
  initialError?: string | null;
};

export default function RenewalQueue({ initialQueue = [], initialError = null }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(initialError);

  async function handleMarkSent(subId: number) {
    setPendingId(subId);
    const response = await markReminded(subId);
    setPendingId(null);

    if (response.error) {
      setError(response.error);
      return;
    }

    setError(null);
    setQueue((current) => current.filter((item) => item.subscription_id !== subId));
  }

  function whatsappLink(phone: string, name: string, remaining: number) {
    const clean = phone.replace(/\D/g, "");
    const intl = clean.startsWith("91") ? clean : `91${clean}`;
    const text = encodeURIComponent(
      `Hi ${name}, your Amrutham tiffin subscription has ${remaining} meal(s) left. Please renew to continue uninterrupted service.`
    );

    return `https://wa.me/${intl}?text=${text}`;
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Renewal queue</h2>
          <p className="panel-copy">
            This is considered due when the ERP queue reports 3 or fewer tiffins remaining and the reminder window is open.
          </p>
        </div>
        <div className="chip">{queue.length} pending</div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {queue.length === 0 ? (
        <div className="empty-state">
          <strong>All caught up</strong>
          <span>The current queue is empty, so renewals are not blocked right now.</span>
        </div>
      ) : (
        <div className="list-stack">
          {queue.map((item) => (
            <div className="list-item" key={item.subscription_id}>
              <div className="list-item-copy">
                <strong>{item.customer_name}</strong>
                <span>
                  {item.phone} | {item.remaining_tiffins} tiffins left
                  {item.last_reminded_at ? ` | Last reminded ${formatTimestampIST(item.last_reminded_at)}` : ""}
                </span>
              </div>
              <div className="btn-row">
                <a
                  href={whatsappLink(item.phone, item.customer_name, item.remaining_tiffins)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-soft"
                >
                  Send WhatsApp
                </a>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleMarkSent(item.subscription_id)}
                  disabled={pendingId === item.subscription_id}
                >
                  {pendingId === item.subscription_id ? "Saving..." : "Mark reminded"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
