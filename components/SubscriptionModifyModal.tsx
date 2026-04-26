"use client";

import { useMemo, useState } from "react";
import { updateSubscriptionAssignment } from "@/app/actions/sprint1";
import {
  inferSubscriptionSelection,
  resolveSubscriptionSelection,
  type SubscriptionCatalog,
} from "@/lib/subscription-catalog";
import { formatINR } from "@/lib/utils";

type Props = {
  sub: {
    subscription_id: number;
    total_tiffins: number;
    remaining_tiffins: number;
    price_per_tiffin: number;
  };
  catalog: SubscriptionCatalog;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
};

const prorationUiEnabled = process.env.NEXT_PUBLIC_PRORATION_UI_ENABLED === "true";

export default function SubscriptionModifyModal({ sub, catalog, onClose, onRefresh }: Props) {
  const inferred = inferSubscriptionSelection(catalog, sub.total_tiffins, sub.price_per_tiffin);
  const [templateId, setTemplateId] = useState(inferred.templateId);
  const [mealTypeId, setMealTypeId] = useState(inferred.mealTypeId);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const deliveredCount = Math.max(sub.total_tiffins - sub.remaining_tiffins, 0);
  const existingRemainingValue = sub.remaining_tiffins * sub.price_per_tiffin;
  const selection = useMemo(() => {
    try {
      return resolveSubscriptionSelection(catalog, templateId, mealTypeId);
    } catch {
      return null;
    }
  }, [catalog, mealTypeId, templateId]);
  const projectedRemaining = selection ? selection.totalTiffins - deliveredCount : 0;
  const projectedRemainingValue = selection ? projectedRemaining * selection.pricePerTiffin : 0;
  const projectedProrationDelta = selection
    ? Number((projectedRemainingValue - existingRemainingValue).toFixed(2))
    : 0;

  async function handleSave() {
    if (!selection) {
      return;
    }

    setLoading(true);
    setMessage(null);

    const response = await updateSubscriptionAssignment({
      subId: sub.subscription_id,
      templateId,
      mealTypeId,
    });

    setLoading(false);

    if (response.error) {
      setMessage({ type: "error", text: response.error });
      return;
    }

    setMessage({ type: "success", text: "Subscription values updated." });
    await onRefresh();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <h3 className="panel-title">Modify subscription</h3>
            <p className="panel-copy">
              Update the plan size or meal type while preserving already delivered tiffins.
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="summary-box">
            <div className="summary-grid">
              <div className="summary-item">
                <strong>Subscription</strong>
                <span>#{sub.subscription_id}</span>
              </div>
              <div className="summary-item">
                <strong>Delivered</strong>
                <span>{deliveredCount}</span>
              </div>
              <div className="summary-item">
                <strong>Remaining now</strong>
                <span>{sub.remaining_tiffins}</span>
              </div>
              <div className="summary-item">
                <strong>Current rate</strong>
                <span>{formatINR(sub.price_per_tiffin)}</span>
              </div>
            </div>
          </div>

          <div className="field-stack">
            <div>
              <p className="field-label">New subscription plan</p>
            </div>
            <div className="option-grid">
              {catalog.templates.map((template) => (
                <button
                  type="button"
                  key={template.id}
                  className={`option-card${template.id === templateId ? " active" : ""}`}
                  onClick={() => setTemplateId(template.id)}
                >
                  <p className="option-title">{template.label}</p>
                  <p className="option-copy">{template.description || "Configured from admin catalog"}</p>
                  <div className="option-metric">{template.tiffinCount} tiffins</div>
                </button>
              ))}
            </div>
          </div>

          <div className="field-stack">
            <div>
              <p className="field-label">Meal type</p>
            </div>
            <div className="option-grid">
              {catalog.mealTypes.map((mealType) => (
                <button
                  type="button"
                  key={mealType.id}
                  className={`option-card${mealType.id === mealTypeId ? " active" : ""}`}
                  onClick={() => setMealTypeId(mealType.id)}
                >
                  <p className="option-title">{mealType.label}</p>
                  <p className="option-copy">Pre-assigned rate per tiffin</p>
                  <div className="option-metric">{formatINR(mealType.pricePerTiffin)}</div>
                </button>
              ))}
            </div>
          </div>

          {selection ? (
            <div className="summary-box">
              <div className="summary-grid">
                <div className="summary-item">
                  <strong>New total</strong>
                  <span>{selection.totalTiffins}</span>
                </div>
                <div className="summary-item">
                  <strong>New remaining</strong>
                  <span>{selection.totalTiffins - deliveredCount}</span>
                </div>
                <div className="summary-item">
                  <strong>New rate</strong>
                  <span>{formatINR(selection.pricePerTiffin)}</span>
                </div>
                <div className="summary-item">
                  <strong>Invoice value</strong>
                  <span>{formatINR(selection.totalAmount)}</span>
                </div>
              </div>
              {prorationUiEnabled ? (
                <div className="mt-4 rounded-xl border border-dashed p-4 text-sm" style={{ borderColor: "var(--border)" }}>
                  <div className="font-semibold mb-1">Proration preview</div>
                  <div>Existing remaining value: {formatINR(existingRemainingValue)}</div>
                  <div>New remaining value: {formatINR(projectedRemainingValue)}</div>
                  <div>
                    Estimated delta: {formatINR(projectedProrationDelta)} {projectedProrationDelta < 0 ? "(credit)" : projectedProrationDelta > 0 ? "(additional bill)" : "(no change)"}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {message ? (
            <div className={`alert ${message.type === "error" ? "alert-error" : "alert-success"}`}>
              {message.text}
            </div>
          ) : null}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn-primary" onClick={() => void handleSave()} disabled={loading || !selection}>
            {loading ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
