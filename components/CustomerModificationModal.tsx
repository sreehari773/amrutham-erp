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
import { manualAdjustDelivery } from "@/app/actions/deductions";
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

const deliveryCorrectionsEnabled = process.env.NEXT_PUBLIC_KITCHEN_FAULT_UI_ENABLED === "true";

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
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pauseStart, setPauseStart] = useState("");
  const [pauseEnd, setPauseEnd] = useState("");
  const [billStart, setBillStart] = useState("");
  const [billEnd, setBillEnd] = useState("");
  const [renewPlanId, setRenewPlanId] = useState<number | "">("");
  const [renewStartDate, setRenewStartDate] = useState(todayIST());
  const [skipWeekdays, setSkipWeekdays] = useState<number[]>([]);
  const [skipLoading, setSkipLoading] = useState(false);
  const [deliveryActionDate, setDeliveryActionDate] = useState(todayIST());
  const [deliveryActionType, setDeliveryActionType] = useState<
    "DEDUCT" | "RESTORE" | "CUSTOMER_SKIP" | "KITCHEN_FAULT" | "OUT_FOR_DELIVERY" | "CONFIRM"
  >("CONFIRM");
  const [deliveryActionReason, setDeliveryActionReason] = useState("");
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
    todayDeliveryStatus: string | null;
    todayDeliveryBillable: boolean | null;
    todayFaultType: string | null;
    holidayOptOut: boolean;
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
      setMessage({ type: "error", text: result.error });
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
    setMessage({ type: "success", text: "Weekday delivery rules updated." });
  }

  async function handlePause() {
    if (!pauseStart) {
      setMessage({ type: "error", text: "Select a pause start date." });
      return;
    }
    if (pauseEnd && pauseEnd < pauseStart) {
      setMessage({ type: "error", text: "Pause end date must be on or after the start date." });
      return;
    }
    setLoading(true);
    const result = await pauseSubscription(sub.subscription_id, pauseStart, pauseEnd || null);
    setLoading(false);
    if (result.error) {
      setMessage({ type: "error", text: result.error });
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
      setMessage({ type: "error", text: result.error });
    } else {
      await onRefresh();
      onClose();
    }
  }

  async function handleGenerateBill() {
    if (!billStart || !billEnd) {
      setMessage({ type: "error", text: "Select both a from and to date." });
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

      setMessage({ type: "success", text: `Bill generated — ${data.data.deliveries} tiffins × price = ${formatINR(data.data.amount)} (Invoice #${data.data.invoiceId})` });
      setBillStart("");
      setBillEnd("");
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Error generating bill" });
    } finally {
      setLoading(false);
    }
  }

  async function handleDeliveryAction() {
    if (!deliveryActionDate) {
      setMessage({ type: "error", text: "Select a delivery date first." });
      return;
    }

    setLoading(true);
    const result = await manualAdjustDelivery(
      sub.subscription_id,
      deliveryActionDate,
      deliveryActionType,
      deliveryActionReason.trim() || "Manual delivery adjustment"
    );
    setLoading(false);

    if (result.error) {
      setMessage({ type: "error", text: result.error });
      return;
    }

    const summaryResponse = await getSubscriptionDeliverySummary(sub.subscription_id);
    if (summaryResponse.data) {
      setDeliverySummary(summaryResponse.data);
      setDeliverySummaryError(null);
    } else if (summaryResponse.error) {
      setDeliverySummaryError(summaryResponse.error);
    }

    await onRefresh();
    setMessage({ type: "success", text: "Delivery record updated." });
  }

  async function handleRenew() {
    if (!renewPlanId) {
      setMessage({ type: "error", text: "Please select a plan to renew with." });
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
      setMessage({ type: "error", text: result.error });
    } else {
      // Download invoice for the renewed period: from start date to end of that month
      const [yr, mo] = renewStartDate.split("-").map(Number);
      const lastDayOfMonth = new Date(yr, mo, 0).getDate();
      const renewEndDate = `${yr}-${String(mo).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;
      await downloadBillingExcel(renewStartDate, renewEndDate);
      setMessage({ type: "success", text: "Subscription renewed successfully." });
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

        {message ? (
          <div
            className="px-6 py-3 text-sm font-medium"
            style={{
              background: message.type === "success" ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
              color: message.type === "success" ? "#0f9f74" : "#dc2626",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {message.text}
            <button
              onClick={() => setMessage(null)}
              className="ml-3 opacity-60 hover:opacity-100"
              style={{ fontSize: 12 }}
            >
              ✕
            </button>
          </div>
        ) : null}

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
              {sub.meal_preference ? (
                <div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.5)" }}>
                  <p className="text-xs text-gray-500">Meal preference</p>
                  <p className="font-bold text-lg capitalize">{sub.meal_preference}</p>
                </div>
              ) : null}
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
                <div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.5)" }}>
                  <p className="text-xs text-gray-500">Recorded today</p>
                  <p className="font-bold text-base">
                    {deliverySummary.todayDeliveryStatus ?? "No row"}
                  </p>
                </div>
                <div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.5)" }}>
                  <p className="text-xs text-gray-500">Holiday auto-skip</p>
                  <p className="font-bold text-base">
                    {deliverySummary.holidayOptOut ? "Opted out" : "Default enabled"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Loading delivery summary...</div>
            )}
          </section>

          {deliveryCorrectionsEnabled ? (
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>Delivery corrections</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="field">
                  <label className="field-label text-xs">Delivery Date</label>
                  <input
                    type="date"
                    className="text-input"
                    value={deliveryActionDate}
                    onChange={(e) => setDeliveryActionDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="field-label text-xs">Action</label>
                  <select
                    className="select-input"
                    value={deliveryActionType}
                    onChange={(e) =>
                      setDeliveryActionType(
                        e.target.value as "DEDUCT" | "RESTORE" | "CUSTOMER_SKIP" | "KITCHEN_FAULT" | "OUT_FOR_DELIVERY" | "CONFIRM"
                      )
                    }
                  >
                    <option value="OUT_FOR_DELIVERY">Pending to out for delivery</option>
                    <option value="DEDUCT">Mark delivered</option>
                    <option value="CONFIRM">Confirm delivered</option>
                    <option value="CUSTOMER_SKIP">Retroactive customer skip</option>
                    <option value="KITCHEN_FAULT">Kitchen fault / miss</option>
                    <option value="RESTORE">Restore credited meal</option>
                  </select>
                </div>
              </div>
              <div className="field mb-4">
                <label className="field-label text-xs">Reason</label>
                <input
                  type="text"
                  className="text-input"
                  value={deliveryActionReason}
                  onChange={(e) => setDeliveryActionReason(e.target.value)}
                  placeholder="Required for disputes, kitchen misses, and retroactive changes"
                />
              </div>
              <button className="btn-secondary w-full" onClick={handleDeliveryAction} disabled={loading}>
                Save delivery correction
              </button>
            </section>
          ) : null}

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
