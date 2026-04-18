import { useEffect, useMemo, useState } from "react";
import {
  createCustomerWithSubscription,
  getReturningCustomerSuggestion,
} from "@/app/actions/sprint1";
import type { SubscriptionPlan } from "@/app/actions/plans";
import { formatINR, todayIST } from "@/lib/utils";

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

type DirectoryEntry = {
  customer_id: number;
  name: string;
  phone: string;
  address: string | null;
  status: "Active" | "Completed" | "Cancelled" | "Expired" | "Grace";
  total_tiffins: number;
  remaining_tiffins: number;
  price_per_tiffin: number;
  start_date: string | null;
};

type Props = {
  plans: SubscriptionPlan[];
  directory: DirectoryEntry[];
  initialMode?: "new" | "returning";
  initialCustomerId?: number | null;
  onCreated: () => Promise<void> | void;
};

export default function CustomerOnboardingPanel({
  plans,
  directory,
  initialMode = "new",
  initialCustomerId = null,
  onCreated,
}: Props) {
  const [mode, setMode] = useState<"new" | "returning">(initialMode);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(initialCustomerId);
  const [selectedSnapshot, setSelectedSnapshot] = useState<DirectoryEntry | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [planId, setPlanId] = useState<number | "">(plans[0]?.id ?? "");
  const [customStartDate, setCustomStartDate] = useState(todayIST());
  const [deliveredTillDate, setDeliveredTillDate] = useState("0");
  const [mealPreference, setMealPreference] = useState("veg");
  const [skipWeekdays, setSkipWeekdays] = useState<number[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!planId && plans.length > 0) {
      setPlanId(plans[0]?.id ?? "");
    }
  }, [plans, planId]);

  useEffect(() => {
    if (initialCustomerId) {
      setSelectedCustomerId(initialCustomerId);
      setMode(initialMode);
    }
  }, [initialCustomerId, initialMode]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setSelectedSnapshot(null);
      return;
    }

    const localMatch = directory.find((item) => item.customer_id === selectedCustomerId);

    if (localMatch) {
      setSelectedSnapshot(localMatch);
      return;
    }

    let cancelled = false;

    void getReturningCustomerSuggestion(selectedCustomerId).then((response) => {
      if (cancelled) {
        return;
      }

      if (response.data) {
        setSelectedSnapshot(response.data as DirectoryEntry);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [directory, selectedCustomerId]);

  const selectedCustomer = useMemo(() => {
    return directory.find((item) => item.customer_id === selectedCustomerId) ?? selectedSnapshot;
  }, [directory, selectedCustomerId, selectedSnapshot]);

  useEffect(() => {
    if (!selectedCustomer || mode !== "returning") {
      return;
    }

    setName(selectedCustomer.name ?? "");
    setPhone(selectedCustomer.phone ?? "");
    setAddress(selectedCustomer.address ?? "");
    
    // Auto-select plan based on their total tiffins if possible
    if (plans.length > 0) {
       const matchedPlan = plans.find(p => p.tiffin_count === selectedCustomer.total_tiffins);
       if (matchedPlan) setPlanId(matchedPlan.id);
    }
  }, [plans, mode, selectedCustomer]);

  const filteredDirectory = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();

    if (!query) {
      return directory;
    }

    return directory.filter((item) => {
      return (
        item.name.toLowerCase().includes(query) ||
        item.phone.includes(query) ||
        item.address?.toLowerCase().includes(query)
      );
    });
  }, [directory, pickerQuery]);

  const selection = useMemo(() => {
    return plans.find(p => p.id === planId) ?? null;
  }, [plans, planId]);

  async function downloadBillingExcel(customerId: number, startDate: string, endDate: string) {
    const params = new URLSearchParams({
      customerId: String(customerId),
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
    link.download = `billing-${customerId}-${startDate}-to-${endDate}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("phone", phone);
    formData.set("address", address);
    formData.set("paymentMode", paymentMode);
    formData.set("planId", String(planId));
    formData.set("customStartDate", customStartDate);
    formData.set("customInvoiceDate", customStartDate);
    formData.set("deliveredTillDate", deliveredTillDate || "0");
    formData.set("mealPreference", mealPreference);
    formData.set("skipWeekdays", JSON.stringify(skipWeekdays));
    formData.set("skipSaturday", skipWeekdays.includes(6) ? "true" : "false");
    if (deliveryNotes.trim()) formData.set("deliveryNotes", deliveryNotes.trim());

    const response = await createCustomerWithSubscription(formData);
    setLoading(false);

    if (response.error) {
      setMessage({
        type: "error",
        text:
          response.error.includes("unique_active_subscription") ||
          response.error.includes("duplicate key value")
            ? "This customer already has an active subscription. Pause, modify, or complete that plan before starting a new one."
            : response.error,
      });
      return;
    }

    setMessage({
      type: "success",
      text: `Subscription created. Invoice ${response.data?.invoice_number ?? "--"}`,
    });

    const exportDate = customStartDate || todayIST();
    const createdCustomerId = Number(response.data?.customer_id ?? 0);
    if (createdCustomerId > 0) {
      try {
        await downloadBillingExcel(createdCustomerId, exportDate, exportDate);
      } catch (downloadError) {
        setMessage({
          type: "success",
          text: `Subscription created. Invoice ${response.data?.invoice_number ?? "--"} | Excel download failed: ${
            downloadError instanceof Error ? downloadError.message : "Unknown error"
          }`,
        });
      }
    }

    if (mode === "new") {
      setName("");
      setPhone("");
      setAddress("");
    }

    setDeliveredTillDate("0");
    setCustomStartDate(todayIST());
    setSkipWeekdays([]);
    await onCreated();
  }

  function handleModeChange(nextMode: "new" | "returning") {
    setMode(nextMode);
    setMessage(null);

    if (nextMode === "new") {
      setSelectedCustomerId(null);
      setSelectedSnapshot(null);
      setPickerQuery("");
      setName("");
      setPhone("");
      setAddress("");
      setPlanId(plans[0]?.id ?? "");
      setSkipWeekdays([]);
    }
  }

  function toggleWeekday(day: number) {
    setSkipWeekdays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((left, right) => left - right)
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Customer onboarding</h2>
          <p className="panel-copy">
            Add a new customer or restart a returning customer with a catalog-based subscription and meal type.
          </p>
        </div>
      </div>

      <div className="field-stack">
        <div className="segment">
          <button
            type="button"
            className={`segment-button${mode === "new" ? " active" : ""}`}
            onClick={() => handleModeChange("new")}
          >
            New customer
          </button>
          <button
            type="button"
            className={`segment-button${mode === "returning" ? " active" : ""}`}
            onClick={() => handleModeChange("returning")}
          >
            Returning customer
          </button>
        </div>

        {mode === "returning" ? (
          <div className="field-stack">
            <div className="field">
              <label className="field-label" htmlFor="customer-picker-query">
                Find returning customer
              </label>
              <input
                id="customer-picker-query"
                value={pickerQuery}
                onChange={(event) => setPickerQuery(event.target.value)}
                placeholder="Search by name, phone, or address"
                className="text-input"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="customer-picker">
                Select customer
              </label>
              <select
                id="customer-picker"
                value={selectedCustomerId ?? ""}
                onChange={(event) => setSelectedCustomerId(Number(event.target.value) || null)}
                className="select-input"
              >
                <option value="">Choose a previous customer</option>
                {filteredDirectory.map((item) => (
                  <option key={item.customer_id} value={item.customer_id}>
                    {item.name} | {item.phone} | {item.status}
                  </option>
                ))}
              </select>
            </div>
            {selectedCustomer ? (
              <div className="summary-box">
                <div className="summary-grid">
                  <div className="summary-item">
                    <strong>Last status</strong>
                    <span>{selectedCustomer.status}</span>
                  </div>
                  <div className="summary-item">
                    <strong>Previous plan</strong>
                    <span>{selectedCustomer.total_tiffins}</span>
                  </div>
                  <div className="summary-item">
                    <strong>Remaining then</strong>
                    <span>{selectedCustomer.remaining_tiffins}</span>
                  </div>
                  <div className="summary-item">
                    <strong>Last start</strong>
                    <span>{selectedCustomer.start_date ?? "--"}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <form className="field-stack" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="customer-name">
                Customer name
              </label>
              <input
                id="customer-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="text-input"
                placeholder="Full name"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="customer-phone">
                Phone number
              </label>
              <input
                id="customer-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                className="text-input"
                placeholder="10-digit mobile"
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="customer-address">
              Address
            </label>
            <textarea
              id="customer-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="text-area"
              placeholder="Delivery address"
            />
          </div>

          <div className="field-stack">
            <div className="field">
              <label className="field-label" htmlFor="plan-picker">
                Subscription Plan
              </label>
              <select
                id="plan-picker"
                value={planId}
                onChange={(event) => setPlanId(Number(event.target.value) || "")}
                className="select-input text-lg py-3"
              >
                <option value="">Select a Plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — {plan.tiffin_count} Tiffins ({formatINR(plan.total_price)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selection ? (
            <div className="summary-box">
              <div className="summary-grid">
                <div className="summary-item">
                  <strong>Plan</strong>
                  <span>{selection.name}</span>
                </div>
              <div className="summary-item">
                <strong>Tiffins</strong>
                <span>{selection.tiffin_count}</span>
              </div>
              <div className="summary-item">
                <strong>Per tiffin</strong>
                <span>{formatINR((selection.total_price - selection.delivery_charge) / selection.tiffin_count)}</span>
              </div>
              <div className="summary-item">
                <strong>Invoice total</strong>
                <span>{formatINR(selection.total_price)}</span>
              </div>
              </div>
            </div>
          ) : null}

          <div className="form-grid-3">
            <div className="field">
              <label className="field-label" htmlFor="payment-mode">
                Payment mode
              </label>
              <select
                id="payment-mode"
                value={paymentMode}
                onChange={(event) => setPaymentMode(event.target.value)}
                className="select-input"
              >
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="subscription-start-date">
                Start date
              </label>
              <input
                id="subscription-start-date"
                type="date"
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
                className="text-input"
              />
              <p className="field-copy">Use this for future starts or backdated starts.</p>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="delivered-till-date">
                Tiffins already delivered
              </label>
              <input
                id="delivered-till-date"
                type="number"
                min="0"
                value={deliveredTillDate}
                onChange={(event) => setDeliveredTillDate(event.target.value)}
                className="text-input"
              />
              <p className="field-copy">For backdated subscriptions, the app will backfill previous delivery deductions.</p>
            </div>
          </div>

          <div className="form-grid-3">
            <div className="field">
              <label className="field-label" htmlFor="meal-preference">Meal preference</label>
              <select
                id="meal-preference"
                value={mealPreference}
                onChange={(event) => setMealPreference(event.target.value)}
                className="select-input"
              >
                <option value="veg">Veg</option>
                <option value="non_veg">Non-Veg</option>
                <option value="mixed">Mixed</option>
              </select>
              <p className="field-copy">Used for kitchen forecast and KOT generation.</p>
            </div>
            <div className="field">
              <label className="field-label">Skip weekdays</label>
              <div className="flex flex-wrap gap-2">
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
              <p className="field-copy">Selected weekdays won&apos;t deduct credits and the subscription extends automatically.</p>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="delivery-notes">Delivery notes</label>
              <input
                id="delivery-notes"
                value={deliveryNotes}
                onChange={(event) => setDeliveryNotes(event.target.value)}
                className="text-input"
                placeholder="Gate code, landmarks..."
              />
            </div>
          </div>

          {message ? (
            <div className={`alert ${message.type === "error" ? "alert-error" : "alert-success"}`}>
              {message.text}
            </div>
          ) : null}

          <div className="btn-row">
            <button type="submit" className="btn-primary" disabled={loading || !selection}>
              {loading ? "Saving subscription..." : mode === "new" ? "Create customer subscription" : "Restart customer subscription"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setMessage(null);
                setDeliveredTillDate("0");
                setCustomStartDate(todayIST());
              }}
            >
              Reset dates
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
