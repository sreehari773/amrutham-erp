"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { markTodayDelivered } from "@/app/actions/deductions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { todayIST } from "@/lib/utils";

function withTimeout<T>(promise: Promise<T>, timeoutMs = 20000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("The delivery action is taking too long. Please check the database RPC and try again."));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export default function DashboardActions() {
  const router = useRouter();
  const [date, setDate] = useState(todayIST());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleBulkDeduct() {
    if (!window.confirm(`Mark deliveries for ${date}? Eligible active subscriptions will be deducted once.`)) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await withTimeout(markTodayDelivered(date));

      if (response.error) {
        setMessage({ type: "error", text: response.error });
        return;
      }

      router.refresh();
      setMessage({
        type: "success",
        text: `${response.count ?? 0} deliveries were recorded for ${date}.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to process the dispatch action.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkHoliday() {
    if (!window.confirm(`Mark ${date} as a Holiday? This will pause all active subscriptions for just this day.`)) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // Small server action to bulk pause subscriptions for a day
      const res = await fetch("/api/admin/holiday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to mark holiday");
      }

      router.refresh();
      setMessage({
        type: "success",
        text: `Successfully marked ${date} as a holiday for ${data.count} subscriptions.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to process the holiday action.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Daily dispatch</h2>
          <p className="panel-copy">
            Once the kitchen finishes packing, use this to mark the entire day as delivered in one safe pass.
          </p>
        </div>
      </div>

      <div className="field-stack">
        <div className="field">
          <label className="field-label" htmlFor="dispatch-date">
            Delivery date
          </label>
          <input
            id="dispatch-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="text-input"
          />
          <p className="field-copy">
            The app will surface errors instead of hanging if the RPC is slow or fails.
          </p>
        </div>

        <div className="btn-row">
          <button type="button" className="btn-primary" onClick={handleBulkDeduct} disabled={loading}>
            {loading ? "Processing dispatch..." : "Mark Delivered"}
          </button>
          <button type="button" className="btn-danger" onClick={handleMarkHoliday} disabled={loading}>
            {loading ? "Processing..." : "Mark as Holiday"}
          </button>
        </div>

        {message ? (
          <div className={`alert ${message.type === "error" ? "alert-error" : "alert-success"}`}>
            {message.text}
          </div>
        ) : null}
      </div>
    </section>
  );
}
