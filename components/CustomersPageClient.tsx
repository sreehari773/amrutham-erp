"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getCustomerDirectory,
  getCustomersWithSubs,
} from "@/app/actions/sprint1";
import CustomerOnboardingPanel from "@/components/CustomerOnboardingPanel";
import CustomerModificationModal from "@/components/CustomerModificationModal";
import type { SubscriptionPlan } from "@/app/actions/plans";
import { formatINR } from "@/lib/utils";

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
  subscriptionPlans: SubscriptionPlan[];
  initialError?: string | null;
};

export default function CustomersPageClient({
  initialSubs,
  initialDirectory,
  subscriptionPlans,
  initialError = null,
}: Props) {
  const searchParams = useSearchParams();
  const [subs, setSubs] = useState<SubscriptionRow[]>(initialSubs);
  const [directory, setDirectory] = useState<DirectoryEntry[]>(initialDirectory);
  const [plans, setPlans] = useState<SubscriptionPlan[]>(subscriptionPlans);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [activeTab, setActiveTab] = useState<"Active" | "Inactive">("Active");
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [selectedCustomer, setSelectedCustomer] = useState<SubscriptionRow | null>(null);

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  async function refreshCustomers() {
    setLoading(true);

    const [subsResult, directoryResult] = await Promise.all([
      getCustomersWithSubs(),
      getCustomerDirectory("", 60),
    ]);

    setLoading(false);
    setSubs((subsResult.data ?? []) as SubscriptionRow[]);
    setDirectory((directoryResult.data ?? []) as DirectoryEntry[]);
    setError(subsResult.error ?? directoryResult.error ?? null);
  }

  const selectedMode = searchParams.get("mode") === "returning" ? "returning" : "new";
  const selectedCustomerId = Number(searchParams.get("customerId") ?? "") || null;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return subs.filter((subscription) => {
      // Tab filtering
      const isActiveTab = activeTab === "Active";
      const isSubActive = subscription.status === "Active";
      
      if (isActiveTab !== isSubActive) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        subscription.name.toLowerCase().includes(query) ||
        subscription.phone.includes(query)
      );
    });
  }, [activeTab, search, subs]);

  const counts = {
    all: subs.length,
    Active: subs.filter((item) => item.status === "Active").length,
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
        plans={plans}
        directory={directory}
        initialMode={selectedMode}
        initialCustomerId={selectedCustomerId}
        onCreated={refreshCustomers}
      />

      <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="panel-header" style={{ padding: '24px 24px 0 24px', borderBottom: 'none' }}>
          <div className="flex w-full items-center justify-between gap-4">
            <input
              id="customer-search-inline"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="text-input w-full max-w-md"
              placeholder="Search by name or phone..."
            />
          </div>
        </div>

        <div className="px-6 flex border-b" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setActiveTab("Active")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "Active" ? "border-black text-black" : "border-transparent text-gray-500 hover:text-black"
            }`}
          >
            Active Customers
          </button>
          <button
            onClick={() => setActiveTab("Inactive")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "Inactive" ? "border-black text-black" : "border-transparent text-gray-500 hover:text-black"
            }`}
          >
            Inactive Customers
          </button>
        </div>

        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {filtered.map((subscription) => {
            return (
              <div 
                key={subscription.subscription_id} 
                className="p-4 hover:bg-black/5 cursor-pointer flex justify-between items-center transition-colors"
                onClick={() => setSelectedCustomer(subscription)}
              >
                <div>
                  <strong className="block text-base">{subscription.name}</strong>
                  <span className="text-sm text-gray-500">{subscription.phone}</span>
                </div>
                <div className="text-right flex items-center gap-3">
                  {subscription.pause_start ? <div className="badge badge-paused">Paused</div> : null}
                  <div className={`badge badge-${subscription.status.toLowerCase()}`}>
                    {subscription.status}
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </div>
              </div>
            );
          })}
          
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No {activeTab.toLowerCase()} customers found matching your search.
            </div>
          ) : null}
        </div>
      </section>

      {selectedCustomer && (
        <CustomerModificationModal 
          sub={selectedCustomer} 
          plans={plans}
          onClose={() => setSelectedCustomer(null)} 
          onRefresh={refreshCustomers}
        />
      )}
    </div>
  );
}
