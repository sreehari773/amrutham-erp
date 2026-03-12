"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createCustomerWithSubscription,
  getReturningCustomerSuggestion,
} from "@/app/actions/sprint1";
import {
  inferSubscriptionSelection,
  resolveSubscriptionSelection,
  type SubscriptionCatalog,
} from "@/lib/subscription-catalog";
import { formatINR, todayIST } from "@/lib/utils";

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
  catalog: SubscriptionCatalog;
  directory: DirectoryEntry[];
  initialMode?: "new" | "returning";
  initialCustomerId?: number | null;
  onCreated: () => Promise<void> | void;
};

export default function CustomerOnboardingPanel({
  catalog,
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
  const [templateId, setTemplateId] = useState(catalog.templates[0]?.id ?? "");
  const [mealTypeId, setMealTypeId] = useState(catalog.mealTypes[0]?.id ?? "");
  const [customStartDate, setCustomStartDate] = useState(todayIST());
  const [deliveredTillDate, setDeliveredTillDate] = useState("0");
  const [mealPreference, setMealPreference] = useState("veg");
  const [skipSaturday, setSkipSaturday] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!templateId) {
      setTemplateId(catalog.templates[0]?.id ?? "");
    }

    if (!mealTypeId) {
      setMealTypeId(catalog.mealTypes[0]?.id ?? "");
    }
  }, [catalog, mealTypeId, templateId]);

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

    const inferred = inferSubscriptionSelection(
      catalog,
      selectedCustomer.total_tiffins,
      selectedCustomer.price_per_tiffin
    );

    if (inferred.templateId) {
      setTemplateId(inferred.templateId);
    }

    if (inferred.mealTypeId) {
      setMealTypeId(inferred.mealTypeId);
    }
  }, [catalog, mode, selectedCustomer]);

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
    try {
      return resolveSubscriptionSelection(catalog, templateId, mealTypeId);
    } catch {
      return null;
    }
  }, [catalog, mealTypeId, templateId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("phone", phone);
    formData.set("address", address);
    formData.set("paymentMode", paymentMode);
    formData.set("templateId", templateId);
    formData.set("mealTypeId", mealTypeId);
    formData.set("customStartDate", customStartDate);
    formData.set("customInvoiceDate", customStartDate);
    formData.set("deliveredTillDate", deliveredTillDate || "0");
    formData.set("mealPreference", mealPreference);
    formData.set("skipSaturday", skipSaturday ? "true" : "false");
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

    if (mode === "new") {
      setName("");
      setPhone("");
      setAddress("");
    }

    setDeliveredTillDate("0");
    setCustomStartDate(todayIST());
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
      setTemplateId(catalog.templates[0]?.id ?? "");
      setMealTypeId(catalog.mealTypes[0]?.id ?? "");
    }
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
            <div>
              <p className="field-label">Subscription plan</p>
              <p className="field-copy">Choose a subscription count first. Pricing comes from the assigned meal type.</p>
            </div>
            <div className="option-grid">
              {catalog.templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
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
              <p className="field-copy">Veg, non-veg, and mixed prices are centrally managed in Admin.</p>
            </div>
            <div className="option-grid">
              {catalog.mealTypes.map((mealType) => (
                <button
                  key={mealType.id}
                  type="button"
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
                  <strong>Plan</strong>
                  <span>{selection.template.label}</span>
                </div>
                <div className="summary-item">
                  <strong>Meal type</strong>
                  <span>{selection.mealType.label}</span>
                </div>
                <div className="summary-item">
                  <strong>Rate</strong>
                  <span>{formatINR(selection.pricePerTiffin)}</span>
                </div>
                <div className="summary-item">
                  <strong>Invoice total</strong>
                  <span>{formatINR(selection.totalAmount)}</span>
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
              <label className="field-label" htmlFor="skip-saturday">
                <input
                  id="skip-saturday"
                  type="checkbox"
                  checked={skipSaturday}
                  onChange={(event) => setSkipSaturday(event.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Skip Saturdays
              </label>
              <p className="field-copy">Saturdays won&apos;t deduct credits and subscription extends.</p>
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
