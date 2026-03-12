"use client";

import Link from "next/link";
import { useState } from "react";
import { cancelSubscription, pauseSubscription, resumeSubscription } from "@/app/actions/sprint1";
import type { SubscriptionCatalog } from "@/lib/subscription-catalog";
import { formatINR } from "@/lib/utils";
import CustomerActionModal from "./CustomerActionModal";
import SubscriptionModifyModal from "./SubscriptionModifyModal";

type Props = {
  sub: any;
  catalog: SubscriptionCatalog;
  onRefresh: () => Promise<void> | void;
};

export default function CustomerRowActions({ sub, catalog, onRefresh }: Props) {
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [showPauseFields, setShowPauseFields] = useState(false);
  const [pauseStart, setPauseStart] = useState("");
  const [pauseEnd, setPauseEnd] = useState("");
  const [loading, setLoading] = useState(false);

  const isActive = sub.status === "Active";
  const isPaused = isActive && Boolean(sub.pause_start);

  async function handleCancel() {
    if (!window.confirm(`Cancel subscription #${sub.subscription_id}? Refund liability will be recalculated.`)) {
      return;
    }

    setLoading(true);
    const response = await cancelSubscription(sub.subscription_id);
    setLoading(false);

    if (response.error) {
      window.alert(response.error);
      return;
    }

    const refundAmount = typeof response.data?.refund_amount === "number" ? response.data.refund_amount : 0;
    window.alert(`Subscription cancelled. Refund liability: ${formatINR(refundAmount)}`);
    await onRefresh();
  }

  async function handlePause() {
    if (!pauseStart) {
      window.alert("Select a pause start date.");
      return;
    }

    if (pauseEnd && pauseEnd < pauseStart) {
      window.alert("Pause end date cannot be earlier than the pause start.");
      return;
    }

    setLoading(true);
    const response = await pauseSubscription(sub.subscription_id, pauseStart, pauseEnd || null);
    setLoading(false);

    if (response.error) {
      window.alert(response.error);
      return;
    }

    setShowPauseFields(false);
    setPauseStart("");
    setPauseEnd("");
    await onRefresh();
  }

  async function handleResume() {
    setLoading(true);
    const response = await resumeSubscription(sub.subscription_id);
    setLoading(false);

    if (response.error) {
      window.alert(response.error);
      return;
    }

    await onRefresh();
  }

  if (!isActive) {
    return (
      <Link
        href={`/customers?mode=returning&customerId=${sub.customer_id}&q=${encodeURIComponent(sub.name)}`}
        className="btn-secondary"
      >
        Start again
      </Link>
    );
  }

  return (
    <>
      <div className="btn-row">
        <button type="button" className="btn-secondary" onClick={() => setShowDeliveryModal(true)}>
          Delivery
        </button>
        <button type="button" className="btn-soft" onClick={() => setShowModifyModal(true)}>
          Modify
        </button>
        {isPaused ? (
          <button type="button" className="btn-secondary" onClick={() => void handleResume()} disabled={loading}>
            Resume
          </button>
        ) : (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setShowPauseFields((current) => !current)}
          >
            Pause
          </button>
        )}
        <button type="button" className="btn-danger" onClick={() => void handleCancel()} disabled={loading}>
          Cancel
        </button>
      </div>

      {showPauseFields ? (
        <div className="btn-row" style={{ marginTop: 12 }}>
          <input
            type="date"
            value={pauseStart}
            onChange={(event) => setPauseStart(event.target.value)}
            className="text-input"
            style={{ maxWidth: 190 }}
          />
          <input
            type="date"
            value={pauseEnd}
            onChange={(event) => setPauseEnd(event.target.value)}
            className="text-input"
            style={{ maxWidth: 190 }}
          />
          <button type="button" className="btn-secondary" onClick={() => void handlePause()} disabled={loading}>
            Apply pause
          </button>
        </div>
      ) : null}

      {showDeliveryModal ? (
        <CustomerActionModal
          subId={sub.subscription_id}
          customerName={sub.name}
          onClose={() => setShowDeliveryModal(false)}
          onRefresh={onRefresh}
        />
      ) : null}

      {showModifyModal ? (
        <SubscriptionModifyModal
          sub={sub}
          catalog={catalog}
          onClose={() => setShowModifyModal(false)}
          onRefresh={onRefresh}
        />
      ) : null}
    </>
  );
}
