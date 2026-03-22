"use client";

import { useState } from "react";
import { formatINR } from "@/lib/utils";
import { cancelSubscription, pauseSubscription, renewSubscription } from "@/app/actions/sprint1";
import type { SubscriptionPlan } from "@/app/actions/plans";
import InvoiceTracker from "./InvoiceTracker";

export default function CustomerModificationModal({
  sub,
  plans,
  onClose,
  onRefresh,
}: {
  sub: any;
  plans: SubscriptionPlan[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [pauseStart, setPauseStart] = useState("");
  const [pauseEnd, setPauseEnd] = useState("");
  const [billStart, setBillStart] = useState("");
  const [billEnd, setBillEnd] = useState("");
  const [renewPlanId, setRenewPlanId] = useState<number | "">("");

  async function handlePause() {
    if (!pauseStart) {
      window.alert("Select a pause start date.");
      return;
    }
    setLoading(true);
    const result = await pauseSubscription(sub.subscription_id, pauseStart, pauseEnd || null);
    setLoading(false);
    if (result.error) {
      window.alert(result.error);
    } else {
      await onRefresh();
      onClose();
    }
  }

  async function handleCancel() {
    if (!window.confirm("Cancel this subscription permanently?")) return;
    setLoading(true);
    const result = await cancelSubscription(sub.subscription_id);
    setLoading(false);
    if (result.error) {
      window.alert(result.error);
    } else {
      await onRefresh();
      onClose();
    }
  }

  async function handleGenerateBill() {
    if (!billStart || !billEnd) {
      window.alert("Select both a from and to date.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/generate-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId: sub.subscription_id,
          fromDate: billStart,
          toDate: billEnd,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate bill");
      }

      window.alert(`Successfully generated bill!\nInvoice ID: ${data.data.invoiceId}\nTotal Deliveries: ${data.data.deliveries}\nAmount: ${formatINR(data.data.amount)}`);
      setBillStart("");
      setBillEnd("");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Error generating bill");
    } finally {
      setLoading(false);
    }
  }

  async function handleRenew() {
    if (!renewPlanId) {
      window.alert("Please select a plan to renew with.");
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.set("oldSubId", String(sub.subscription_id));
    formData.set("planId", String(renewPlanId));

    const result = await renewSubscription(formData);
    setLoading(false);
    if (result.error) {
      window.alert(result.error);
    } else {
      window.alert("Successfully renewed subscription!");
      await onRefresh();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="bg-white rounded-[24px] w-full max-w-lg shadow-2xl overflow-hidden" style={{ background: "var(--surface)" }}>
        <div className="p-6 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">{sub.name}</h2>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{sub.phone}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-8" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {/* Details */}
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>Subscription info</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.5)" }}>
                <p className="text-xs text-gray-500">Remaining items / Total</p>
                <p className="font-bold text-lg">{sub.remaining_tiffins} / {sub.total_tiffins}</p>
              </div>
              <div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.5)" }}>
                <p className="text-xs text-gray-500">Status</p>
                <div className={`badge badge-${sub.status.toLowerCase()} inline-flex mt-1`}>{sub.status}</div>
              </div>
            </div>
          </section>

          {/* Payment Tracking */}
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>Payment Tracking</h3>
            <InvoiceTracker customerId={sub.customer_id} />
          </section>

          {/* Pause / Skip */}
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>Pause / Skip Days</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="field">
                <label className="field-label text-xs">Start Date</label>
                <input type="date" className="text-input" value={pauseStart} onChange={(e) => setPauseStart(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label text-xs">End Date (optional)</label>
                <input type="date" className="text-input" value={pauseEnd} onChange={(e) => setPauseEnd(e.target.value)} />
              </div>
            </div>
            <button className="btn-secondary w-full" onClick={handlePause} disabled={loading}>
              Save Pause Period
            </button>
          </section>

          {/* Custom Bill */}
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>Custom Bill Generation</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="field">
                <label className="field-label text-xs">From Date</label>
                <input type="date" className="text-input" value={billStart} onChange={(e) => setBillStart(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label text-xs">To Date</label>
                <input type="date" className="text-input" value={billEnd} onChange={(e) => setBillEnd(e.target.value)} />
              </div>
            </div>
            <button className="btn-ghost w-full" onClick={handleGenerateBill} disabled={loading}>
              Generate Bill
            </button>
          </section>

          {/* Renew Subscription */}
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>Renew Subscription</h3>
            <div className="flex gap-4 mb-4">
              <select
                className="select-input flex-1"
                value={renewPlanId}
                onChange={(e) => setRenewPlanId(Number(e.target.value) || "")}
              >
                <option value="">Select a new Plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — {plan.tiffin_count} Tiffins ({formatINR(plan.total_price)})
                  </option>
                ))}
              </select>
              <button className="btn-primary whitespace-nowrap" onClick={handleRenew} disabled={loading || !renewPlanId}>
                Renew Plan
              </button>
            </div>
          </section>
        </div>

        <div className="p-6 border-t" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.4)" }}>
          <button className="btn-danger w-full" onClick={handleCancel} disabled={loading}>
            Cancel Subscription Permanently
          </button>
        </div>
      </div>
    </div>
  );
}
