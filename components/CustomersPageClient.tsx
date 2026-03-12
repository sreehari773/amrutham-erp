"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getCustomerDirectory,
  getCustomersWithSubs,
  getSubscriptionCatalog,
} from "@/app/actions/sprint1";
import CustomerOnboardingPanel from "@/components/CustomerOnboardingPanel";
import CustomerRowActions from "@/components/CustomerRowActions";
import { inferSubscriptionSelection, type SubscriptionCatalog } from "@/lib/subscription-catalog";
import { formatDateIST, formatINR } from "@/lib/utils";

type SubscriptionRow = {
  subscription_id: number;
  customer_id: number;
  name: string;
  phone: string;
  address: string | null;
  status: "Active" | "Completed" | "Cancelled" | "Expired" | "Grace";
  remaining_tiffins: number;
  total_tiffins: number;
  price_per_tiffin: number;
  total_amount: number | null;
  start_date: string | null;
  latest_invoice_number: string | null;
  latest_invoice_amount: number | null;
  pause_start: string | null;
  meal_preference?: string;
};

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
  initialSubs: SubscriptionRow[];
  initialDirectory: DirectoryEntry[];
  initialCatalog: SubscriptionCatalog;
  initialError?: string | null;
};

export default function CustomersPageClient({
  initialSubs,
  initialDirectory,
  initialCatalog,
  initialError = null,
}: Props) {
  const searchParams = useSearchParams();
  const [subs, setSubs] = useState<SubscriptionRow[]>(initialSubs);
  const [directory, setDirectory] = useState<DirectoryEntry[]>(initialDirectory);
  const [catalog, setCatalog] = useState<SubscriptionCatalog>(initialCatalog);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [filter, setFilter] = useState<"all" | "Active" | "Completed" | "Cancelled" | "Expired" | "Grace">("all");
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  async function refreshCustomers() {
    setLoading(true);

    const [subsResult, directoryResult, catalogResult] = await Promise.all([
      getCustomersWithSubs(),
      getCustomerDirectory("", 60),
      getSubscriptionCatalog(),
    ]);

    setLoading(false);
    setSubs((subsResult.data ?? []) as SubscriptionRow[]);
    setDirectory((directoryResult.data ?? []) as DirectoryEntry[]);
    setCatalog(catalogResult.data ?? initialCatalog);
    setError(subsResult.error ?? directoryResult.error ?? catalogResult.error ?? null);
  }

  const selectedMode = searchParams.get("mode") === "returning" ? "returning" : "new";
  const selectedCustomerId = Number(searchParams.get("customerId") ?? "") || null;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return subs.filter((subscription) => {
      if (filter !== "all" && subscription.status !== filter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        subscription.name.toLowerCase().includes(query) ||
        subscription.phone.includes(query) ||
        subscription.subscription_id.toString().includes(query) ||
        subscription.address?.toLowerCase().includes(query)
      );
    });
  }, [filter, search, subs]);

  const counts = {
    all: subs.length,
    Active: subs.filter((item) => item.status === "Active").length,
    Completed: subs.filter((item) => item.status === "Completed").length,
    Cancelled: subs.filter((item) => item.status === "Cancelled").length,
    Expired: subs.filter((item) => item.status === "Expired").length,
    Grace: subs.filter((item) => item.status === "Grace").length,
  };

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div className="page-hero-copy">
          <p className="page-eyebrow">Customer operations</p>
          <h1 className="page-title">Customers and subscriptions</h1>
          <p className="page-copy">
            Start new plans, restart returning customers, backfill missed days, and manage active subscriptions from one place.
          </p>
        </div>
        <div className="hero-chip-row">
          <div className="chip">Total records {counts.all}</div>
          <div className="chip">Active {counts.Active}</div>
          <div className="chip">Returning customers {directory.length}</div>
        </div>
      </section>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <CustomerOnboardingPanel
        catalog={catalog}
        directory={directory}
        initialMode={selectedMode}
        initialCustomerId={selectedCustomerId}
        onCreated={refreshCustomers}
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Subscription ledger</h2>
            <p className="panel-copy">
              Search, filter, and act on current or previous subscriptions. Returning customers can be restarted directly from completed plans.
            </p>
          </div>
          <div className="panel-actions">
            <div className="segment">
              {(["all", "Active", "Expired", "Grace", "Completed", "Cancelled"] as const).map((item) => (
                <button
                  type="button"
                  key={item}
                  className={`segment-button${filter === item ? " active" : ""}`}
                  onClick={() => setFilter(item)}
                >
                  {item === "all" ? "All" : item} {counts[item]}
                </button>
              ))}
            </div>
            <button type="button" className="btn-secondary" onClick={() => void refreshCustomers()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="field-stack">
          <div className="field">
            <label className="field-label" htmlFor="customer-search-inline">
              Search ledger
            </label>
            <input
              id="customer-search-inline"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="text-input"
              placeholder="Search by customer, phone, address, or subscription id"
            />
          </div>

          <div className="table-shell">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Current plan</th>
                    <th>Status</th>
                    <th>Tiffins</th>
                    <th>Start</th>
                    <th>Invoice</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((subscription) => {
                    const inferred = inferSubscriptionSelection(
                      catalog,
                      subscription.total_tiffins,
                      subscription.price_per_tiffin
                    );
                    const template = catalog.templates.find((item) => item.id === inferred.templateId);
                    const mealType = catalog.mealTypes.find((item) => item.id === inferred.mealTypeId);

                    return (
                      <tr key={subscription.subscription_id}>
                        <td>
                          <div className="list-item-copy">
                            <strong>{subscription.name}</strong>
                            <span>
                              {subscription.phone}
                              {subscription.address ? ` | ${subscription.address}` : ""}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="list-item-copy">
                            <strong>{template?.label ?? `${subscription.total_tiffins} tiffins`}</strong>
                            <span>{mealType?.label ?? "Custom pricing"}</span>
                          </div>
                        </td>
                        <td>
                          <div className={`badge badge-${subscription.status.toLowerCase()}`}>
                            {subscription.status}
                          </div>
                          {subscription.pause_start ? <div className="badge badge-paused" style={{ marginTop: 8 }}>Paused</div> : null}
                        </td>
                        <td>
                          <div className="list-item-copy">
                            <strong>
                              {subscription.remaining_tiffins} / {subscription.total_tiffins}
                            </strong>
                            <span>{formatINR(subscription.price_per_tiffin)} per tiffin</span>
                          </div>
                        </td>
                        <td>{formatDateIST(subscription.start_date)}</td>
                        <td>
                          <div className="list-item-copy">
                            <strong>{subscription.latest_invoice_number ?? "--"}</strong>
                            <span>{formatINR(subscription.latest_invoice_amount ?? subscription.total_amount ?? 0)}</span>
                          </div>
                        </td>
                        <td>
                          <CustomerRowActions sub={subscription} catalog={catalog} onRefresh={refreshCustomers} />
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty-state">
                          <strong>No subscriptions matched</strong>
                          <span>Try a different filter or search query.</span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
