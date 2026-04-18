"use client";

import { useEffect, useState } from "react";
import { formatDateIST, formatINR, todayIST } from "@/lib/utils";
import {
  cancelSubscription,
  getSubscriptionDeliverySummary,
  pauseSubscription,
  renewSubscription,
  updateSubscriptionWeekdaySkips,
} from "@/app/actions/sprint1";
import type { SubscriptionPlan } from "@/app/actions/plans";
import InvoiceTracker from "./InvoiceTracker";

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

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
  const [renewStartDate, setRenewStartDate] = useState(todayIST());
  const [skipWeekdays, setSkipWeekdays] = useState<number[]>([]);
  const [skipLoading, setSkipLoading] = useState(false);
  const [deliverySummary, setDeliverySummary] = useState<{
    customerId: number;
    subscriptionId: number;
    pauseStart: string | null;
    pauseEnd: string | null;
    isPausedToday: boolean;
    skipWeekdays: number[];
    deliveryCount: number;
    lastDeliveryDate: string | null;
    blockedReason: string | null;
    nextEligibleDate: string | null;
    isEligibleToday: boolean;
  } | null>(null);
  const [deliverySummaryError, setDeliverySummaryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const response = await getSubscriptionDeliverySummary(sub.subscription_id);

      if (cancelled) {
        return;
      }

      if (response.error) {
        setDeliverySummaryError(response.error);
        return;
      }

      setDeliverySummary(response.data ?? null);
      setSkipWeekdays(response.data?.skipWeekdays ?? []);
      setDeliverySummaryError(null);
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [sub.subscription_id]);

  async function downloadBillingExcel(startDate: string, endDate: string) {
    const params = new URLSearchParams({
      customerId: String(sub.customer_id),
      startDate,
      endDate,
    });

    const response = await fetch(`/api/export/invoices_v2?${params.toString()}`);

    if (!response.ok) {
      let message = "Failed to download the billing Excel file.";

      try {
        const payload = await response.json();
        if (payload?.error) {
          message = payload.error;
        }
      } catch {}

      throw new Error(message);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `billing-${sub.customer_id}-${startDate}-to-${endDate}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  function toggleWeekday(day: number) {
    setSkipWeekdays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((left, right) => left - right)
    );
  }

  async function handleSaveWeekdaySkips() {
    setSkipLoading(true);
    const result = await updateSubscriptionWeekdaySkips(sub.subscription_id, skipWeekdays);
    setSkipLoading(false);

    if (result.error) {
      window.alert(result.error);
      return;
    }

    const summaryResponse = await getSubscriptionDeliverySummary(sub.subscription_id);
    if (summaryResponse.data) {
      setDeliverySummary(summaryResponse.data);
      setSkipWeekdays(summaryResponse.data.skipWeekdays ?? []);
      setDeliverySummaryError(null);
    } else if (summaryResponse.error) {
      setDeliverySummaryError(summaryResponse.error);
    }

    await onRefresh();
    window.alert("Weekday delivery rules updated.");
  }

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

      await downloadBillingExcel(billStart, billEnd);

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
    formData.set("startDate", renewStartDate);

    const result = await renewSubscription(formData);
    setLoading(false);
    if (result.error) {
      window.alert(result.error);
    } else {
      await downloadBillingExcel(renewStartDate, renewStartDate);
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
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Customer ID #{sub.customer_id} | Subscription #{sub.subscription_id}
              </p>
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
                <p className="text-xs text-gray-500">Purchased tiffins</p>
                <p className="font-bold text-lg">{sub.total_tiffins}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.5)" }}>
                <p className="text-xs text-gray-500">Customer ID</p>
                <p className="font-bold text-lg">#{sub.customer_id}</p>
              </div>
              <div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.5)" }}>
                <p className="text-xs text-gray-500">Status</p>
                <div className={`badge badge-${sub.status.toLowerCase()} inline-flex mt-1`}>{sub.status}</div>
              </div>
              <div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.5)" }}>
                <p className="text-xs text-gray-500">Invoice value</p>
                <p className="font-bold text-lg">{formatINR(sub.total_amount ?? sub.latest_invoice_amount ?? 0)}</p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>Delivery diagnostics</h3>
            {deliverySummaryError ? (
              <div className="text-sm text-red-500">{deliverySummaryError}</div>
            ) : deliverySummary ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.5)" }}>
                  <p className="text-xs text-gray-500">Last delivery</p>
                  <p className="font-bold text-base">{formatDateIST(deliverySummary.lastDeliveryDate)}</p>
                </div>
                <div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.5)" }}>
                  <p className="text-xs text-gray-500">Next eligible delivery</p>
                  <p className="font-bold text-base">{formatDateIST(deliverySummary.nextEligibleDate)}</p>
                </div>
                <div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.5)" }}>
                  <p className="text-xs text-gray-500">Recorded deliveries</p>
                  <p className="font-bold text-base">{deliverySummary.deliveryCount}</p>
                </div>
                <div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.5)" }}>
                  <p className="text-xs text-gray-500">Today&apos;s status</p>
                  <p className="font-bold text-base">
                    {deliverySummary.isEligibleToday ? "Eligible" : deliverySummary.blockedReason ?? "Blocked"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Loading delivery summary...</div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>Weekday delivery rules</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {WEEKDAY_OPTIONS.map((day) => (
                <label
                  key={day.value}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)" }}
                >
                  <input
                    type="checkbox"
                    checked={skipWeekdays.includes(day.value)}
                    onChange={() => toggleWeekday(day.value)}
                  />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Selected weekdays do not deduct tiffins. Current rule: {skipWeekdays.length > 0
                ? skipWeekdays.map((day) => WEEKDAY_OPTIONS.find((option) => option.value === day)?.label ?? day).join(", ")
                : "No skipped weekdays"}
            </p>
            <button className="btn-secondary w-full" onClick={handleSaveWeekdaySkips} disabled={skipLoading}>
              {skipLoading ? "Saving weekday rules..." : "Save weekday rules"}
            </button>
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
            <div className="grid grid-cols-[1fr,160px] gap-4 mb-4">
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
              <input
                type="date"
                className="text-input"
                value={renewStartDate}
                onChange={(event) => setRenewStartDate(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-gray-500">Renewal starts from this date and creates the next invoice immediately.</p>
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
