import type { ReactNode } from "react";
import {
  getMonthlyDeliveryStats,
  getRenewalQueue,
  getRevenueSummary,
} from "@/app/actions/sprint1";
import { getMenuForDay } from "@/app/actions/menus";
import DashboardActions from "@/components/DashboardActions";
import RenewalQueue from "@/components/RenewalQueue";
import { currentMonthIST, formatINR, todayIST } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const month = currentMonthIST();
  const today = todayIST();

  const [revenueResult, renewalResult, deliveryStatsResult, menuResult] = await Promise.all([
    getRevenueSummary(month),
    getRenewalQueue(),
    getMonthlyDeliveryStats(month),
    getMenuForDay(today),
  ]);

  const revenue = revenueResult.data ?? {
    monthly_revenue: 0,
    prepaid_liability: 0,
    active_count: 0,
    completed_count: 0,
    expired_count: 0,
  };

  const deliveryStats = deliveryStatsResult.data ?? {
    deliveredThisMonth: 0,
    deliveredToday: 0,
    outstandingTiffins: 0,
    activeSubscriptions: 0,
  };

  const menu = menuResult.data ?? {
    day_of_week: "Today",
    veg_description: "Not set",
    non_veg_description: "Not set",
  };

  const greeting = (() => {
    const hour = Number.parseInt(
      new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        hour12: false,
      }),
      10
    );

    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  })();

  const topError =
    revenueResult.error ??
    renewalResult.error ??
    deliveryStatsResult.error ??
    menuResult.error ??
    null;

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div className="page-hero-copy">
          <p className="page-eyebrow">{greeting}, kitchen admin</p>
          <h1 className="page-title">Operational dashboard</h1>
          <p className="page-copy">
            Track dispatch progress, renewals, and the current subscription run without jumping across tools.
          </p>
        </div>
        <div className="hero-chip-row">
          <div className="chip">Month {month}</div>
          <div className="chip">Today {today}</div>
          <div className="chip">Renewals pending {(renewalResult.data ?? []).length}</div>
        </div>
      </section>

      {topError ? <div className="alert alert-error">{topError}</div> : null}

      <section className="stats-grid">
        <DashboardStatCard
          label="Monthly Revenue"
          value={formatINR(revenue.monthly_revenue)}
          copy="Invoices collected in the selected month"
          tint="rgba(18, 184, 134, 0.12)"
          icon={<CurrencyIcon color="#12b886" />}
        />
        <DashboardStatCard
          label="Prepaid Liability"
          value={formatINR(revenue.prepaid_liability)}
          copy="Outstanding prepaid meals on active subscriptions"
          tint="rgba(245, 158, 11, 0.14)"
          icon={<ClockIcon color="#d97706" />}
        />
        <DashboardStatCard
          label="Active Subscriptions"
          value={String(revenue.active_count)}
          copy="Currently running customer plans"
          tint="rgba(59, 130, 246, 0.14)"
          icon={<UsersIcon color="#2563eb" />}
        />
        <DashboardStatCard
          label="Completed This Month"
          value={String(revenue.completed_count)}
          copy="Plans that exhausted all tiffins this month"
          tint="rgba(139, 92, 246, 0.14)"
          icon={<PulseIcon color="#8b5cf6" />}
        />
        <DashboardStatCard
          label="Expired / Grace"
          value={String(revenue.expired_count ?? 0)}
          copy="Subscriptions awaiting renewal (credits exhausted)"
          tint="rgba(239, 68, 68, 0.12)"
          icon={<AlertIcon color="#ef4444" />}
        />
        <DashboardStatCard
          label="Delivered This Month"
          value={String(deliveryStats.deliveredThisMonth)}
          copy="Total tiffins deducted from delivery runs this month"
          tint="rgba(16, 185, 129, 0.12)"
          icon={<TruckIcon color="#0f9f74" />}
        />
        <DashboardStatCard
          label="Delivered Today"
          value={String(deliveryStats.deliveredToday)}
          copy="Tiffins marked delivered for the selected day"
          tint="rgba(14, 165, 233, 0.12)"
          icon={<CheckIcon color="#0284c7" />}
        />
      </section>

      <section className="grid-main">
        <DashboardActions />
        <RenewalQueue initialQueue={(renewalResult.data ?? []) as any[]} initialError={renewalResult.error ?? null} />
      </section>

      <section className="grid-columns-2">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Tiffin movement</h2>
              <p className="panel-copy">A quick read on how much work has been completed versus what is still live.</p>
            </div>
          </div>
          <div className="metric-grid">
            <div className="metric-card">
              <strong>Delivered This Month</strong>
              <span>{deliveryStats.deliveredThisMonth}</span>
            </div>
            <div className="metric-card">
              <strong>Delivered Today</strong>
              <span>{deliveryStats.deliveredToday}</span>
            </div>
            <div className="metric-card">
              <strong>Outstanding Tiffins</strong>
              <span>{deliveryStats.outstandingTiffins}</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Today&apos;s menu ({menu.day_of_week})</h2>
              <p className="panel-copy">Dispatch copy for today. Update the full menu from the Menus section.</p>
            </div>
          </div>
          <div className="list-stack">
            <MenuRow label="Veg Menu" value={menu.veg_description} />
            <MenuRow label="Non-Veg Menu" value={menu.non_veg_description} />
          </div>
        </div>
      </section>
    </div>
  );
}

function DashboardStatCard({
  label,
  value,
  copy,
  tint,
  icon,
}: {
  label: string;
  value: string;
  copy: string;
  tint: string;
  icon: ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-head">
        <div>
          <p className="stat-label">{label}</p>
          <p className="stat-value">{value}</p>
        </div>
        <div className="stat-icon" style={{ background: tint }}>
          {icon}
        </div>
      </div>
      <div className="stat-meta">{copy}</div>
    </div>
  );
}

function MenuRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="list-item">
      <div className="list-item-copy">
        <strong>{label}</strong>
        <span>{value || "Not set yet"}</span>
      </div>
    </div>
  );
}

function CurrencyIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <path d="M12 2v20" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function ClockIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function UsersIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function PulseIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function TruckIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <path d="M10 17h4V5H2v12h2" />
      <path d="M14 8h4l4 4v5h-2" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function AlertIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
