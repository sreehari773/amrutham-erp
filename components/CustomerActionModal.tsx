"use client";

import { useEffect, useState } from "react";
import { getDeliveryHistory, manualAdjustDelivery } from "@/app/actions/deductions";
import { formatDateIST, todayIST } from "@/lib/utils";

type Props = {
  subId: number;
  customerName: string;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
};

export default function CustomerActionModal({ subId, customerName, onClose, onRefresh }: Props) {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [action, setAction] = useState<"DEDUCT" | "RESTORE">("DEDUCT");
  const [targetDate, setTargetDate] = useState(todayIST());
  const [reason, setReason] = useState("");

  async function loadDeliveries() {
    setLoading(true);
    const response = await getDeliveryHistory(subId);
    setLoading(false);

    if (response.error) {
      setHistoryError(response.error);
      setDeliveries([]);
      return;
    }

    setHistoryError(null);
    setDeliveries(response.data ?? []);
  }

  useEffect(() => {
    void loadDeliveries();
  }, [subId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reason.trim()) {
      setMessage({ type: "error", text: "Reason is required for the audit trail." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const response = await manualAdjustDelivery(subId, targetDate, action, reason.trim());
    setSubmitting(false);

    if (response.error) {
      setMessage({ type: "error", text: response.error });
      return;
    }

    setMessage({
      type: "success",
      text: `${action === "DEDUCT" ? "Deducted" : "Restored"} delivery for ${targetDate}.`,
    });
    setReason("");
    await loadDeliveries();
    await onRefresh();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <h3 className="panel-title">Delivery adjustment</h3>
            <p className="panel-copy">
              {customerName} | Subscription #{subId}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-grid-3">
            <div className="field">
              <label className="field-label" htmlFor="adjustment-action">
                Action
              </label>
              <select
                id="adjustment-action"
                value={action}
                onChange={(event) => setAction(event.target.value as "DEDUCT" | "RESTORE")}
                className="select-input"
              >
                <option value="DEDUCT">Deduct</option>
                <option value="RESTORE">Restore</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="adjustment-date">
                Target date
              </label>
              <input
                id="adjustment-date"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                className="text-input"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="adjustment-reason">
                Reason
              </label>
              <input
                id="adjustment-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="text-input"
                placeholder="Driver app, complaint, data correction"
              />
            </div>
          </div>

          {message ? (
            <div className={`alert ${message.type === "error" ? "alert-error" : "alert-success"}`}>
              {message.text}
            </div>
          ) : null}

          <div className="btn-row">
            <button type="submit" className={action === "DEDUCT" ? "btn-danger" : "btn-primary"} disabled={submitting}>
              {submitting ? "Saving adjustment..." : action === "DEDUCT" ? "Deduct delivery" : "Restore delivery"}
            </button>
          </div>

          <div className="field-stack">
            <div>
              <p className="field-label">Delivery history</p>
              <p className="field-copy">The latest recorded delivery entries for this subscription.</p>
            </div>
            {historyError ? <div className="alert alert-error">{historyError}</div> : null}
            {loading ? (
              <div className="empty-state">
                <strong>Loading history</strong>
                <span>Please wait while the ERP returns the delivery timeline.</span>
              </div>
            ) : deliveries.length === 0 ? (
              <div className="empty-state">
                <strong>No deliveries yet</strong>
                <span>This subscription does not have recorded delivery history.</span>
              </div>
            ) : (
              <div className="list-stack">
                {deliveries.map((delivery) => (
                  <div className="list-item" key={delivery.id}>
                    <div className="list-item-copy">
                      <strong>{formatDateIST(delivery.delivery_date)}</strong>
                      <span>{delivery.reason || "No reason provided"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
