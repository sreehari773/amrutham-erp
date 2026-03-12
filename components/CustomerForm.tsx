"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomerWithSubscription } from "@/app/actions/sprint1";
import { formatINR, todayIST } from "@/lib/utils";

export default function CustomerForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showBackdate, setShowBackdate] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    if (!formData.get("customStartDate")) formData.delete("customStartDate");
    if (!formData.get("customInvoiceDate")) formData.delete("customInvoiceDate");

    const res = await createCustomerWithSubscription(formData);
    setLoading(false);

    if (res.error) {
      const msg = res.error.includes("unique_active_subscription")
        ? "This customer already has an active subscription."
        : res.error;
      setMessage({ type: "error", text: msg });
      return;
    }

    const invoiceNumber = res.data?.invoice_number ?? "--";
    const totalAmount = typeof res.data?.total_amount === "number" ? res.data.total_amount : 0;

    setMessage({
      type: "success",
      text: `Subscription created. Invoice: ${invoiceNumber} | Total: ${formatINR(totalAmount)}`,
    });
    form.reset();
    setShowBackdate(false);
    router.refresh();
    onSuccess?.();
  }

  return (
    <section className="panel anim-in">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Create customer subscription</h2>
          <p className="panel-copy">Register a customer, invoice them, and start their plan in one RPC-backed action.</p>
        </div>
        <span className="hero-pill">create_customer_with_subscription</span>
      </div>
      <form onSubmit={handleSubmit} className="panel-body" style={{ display: "grid", gap: "18px" }}>
        <div className="form-grid-two">
          <div>
            <label className="field-label">Customer name *</label>
            <input name="name" required className="input-field" placeholder="Full name" />
          </div>
          <div>
            <label className="field-label">Phone *</label>
            <input name="phone" required className="input-field" placeholder="10-digit mobile" />
          </div>
        </div>

        <div>
          <label className="field-label">Delivery address</label>
          <input name="address" className="input-field" placeholder="Full delivery address" />
        </div>

        <div className="form-grid-three">
          <div>
            <label className="field-label">Total tiffins *</label>
            <input name="totalTiffins" type="number" min={1} required className="input-field" placeholder="e.g. 30" />
          </div>
          <div>
            <label className="field-label">Price per tiffin (INR) *</label>
            <input name="pricePerTiffin" type="number" min={0} step={0.01} required className="input-field" placeholder="e.g. 80" />
          </div>
          <div>
            <label className="field-label">Payment mode</label>
            <select name="paymentMode" defaultValue="UPI" className="input-field">
              <option value="UPI">UPI</option>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
          </div>
        </div>

        <div className="status-banner status-banner-info">
          Optional backdating is useful when an existing offline customer is being entered after the fact.
        </div>

        <div>
          <button type="button" onClick={() => setShowBackdate(!showBackdate)} className="btn-ghost">
            {showBackdate ? "Hide backdating" : "Show backdating"}
          </button>
        </div>

        {showBackdate && (
          <div className="form-grid-two">
            <div>
              <label className="field-label">Backdate subscription start</label>
              <input name="customStartDate" type="date" max={todayIST()} className="input-field" />
              <p className="field-hint">Leave blank for today.</p>
            </div>
            <div>
              <label className="field-label">Backdate invoice date</label>
              <input name="customInvoiceDate" type="date" max={todayIST()} className="input-field" />
              <p className="field-hint">Leave blank for today.</p>
            </div>
          </div>
        )}

        <div className="action-row">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Creating..." : "Create Subscription"}
          </button>
          {message && (
            <div className={`status-banner ${message.type === "success" ? "status-banner-success" : "status-banner-error"}`}>
              {message.text}
            </div>
          )}
        </div>
      </form>
    </section>
  );
}
