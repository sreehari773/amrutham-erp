"use client";

import { useState } from "react";
import { formatINR } from "@/lib/utils";

type SummaryStats = {
  monthlyRevenue: number;
  prepaidLiability: number;
  activeCount: number;
  deliveredThisMonth: number;
  deliveredToday: number;
  outstandingTiffins: number;
};

type Props = {
  currentMonth: string;
  summary: SummaryStats;
};

export default function ReportsClient({ currentMonth, summary }: Props) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [month, setMonth] = useState("");
  const [downloading, setDownloading] = useState(false);

  function handleDownload() {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (customerId) params.append("customerId", customerId);
    if (month) params.append("month", month);
    setDownloading(true);
    window.location.href = "/api/export/invoices_v2?" + params.toString();
    // Reset after a short delay
    setTimeout(() => setDownloading(false), 3000);
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div className="page-hero-copy">
          <p className="page-eyebrow">Business intelligence</p>
          <h1 className="page-title">Reports & Exports</h1>
          <p className="page-copy">
            Live operational snapshot for {currentMonth}, plus customizable invoice ledger exports.
          </p>
        </div>
        <div className="hero-chip-row">
          <div className="chip">Month {currentMonth}</div>
          <div className="chip">{summary.activeCount} active subscriptions</div>
        </div>
      </section>

      {/* Summary cards */}
      <section className="stats-grid">
        <StatCard
          label="Monthly Revenue"
          value={formatINR(summary.monthlyRevenue)}
          sub="Invoice totals collected this month"
          tint="rgba(18, 184, 134, 0.12)"
          color="#12b886"
        />
        <StatCard
          label="Prepaid Liability"
          value={formatINR(summary.prepaidLiability)}
          sub="Outstanding prepaid tiffins on active plans"
          tint="rgba(245, 158, 11, 0.14)"
          color="#d97706"
        />
        <StatCard
          label="Delivered This Month"
          value={String(summary.deliveredThisMonth)}
          sub="Tiffins marked delivered in billing runs"
          tint="rgba(16, 185, 129, 0.12)"
          color="#0f9f74"
        />
        <StatCard
          label="Delivered Today"
          value={String(summary.deliveredToday)}
          sub="Tiffins deducted in today's dispatch"
          tint="rgba(14, 165, 233, 0.12)"
          color="#0284c7"
        />
        <StatCard
          label="Active Subscriptions"
          value={String(summary.activeCount)}
          sub="Currently running customer plans"
          tint="rgba(59, 130, 246, 0.14)"
          color="#2563eb"
        />
        <StatCard
          label="Outstanding Tiffins"
          value={String(summary.outstandingTiffins)}
          sub="Remaining credits across all active plans"
          tint="rgba(139, 92, 246, 0.14)"
          color="#8b5cf6"
        />
      </section>

      {/* Export section */}
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-1">Invoice Ledger Export</h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Filter invoices by date range, month, or customer ID. Downloads as an Excel workbook (.xlsx) ready for billing review and sharing.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <label className="field-label">
            From Date
            <input
              type="date"
              className="text-input mt-1"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="field-label">
            To Date
            <input
              type="date"
              className="text-input mt-1"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <label className="field-label">
            Filter by Month
            <input
              type="month"
              className="text-input mt-1"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <label className="field-label">
            Customer ID <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span>
            <input
              type="text"
              className="text-input mt-1"
              placeholder="e.g. 12"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            />
          </label>
        </div>

        <div className="pt-4 border-t flex items-center justify-between gap-4" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Leave all filters blank to export the full invoice history.
          </p>
          <button
            onClick={handleDownload}
            className="btn-primary"
            style={{ minWidth: 160 }}
            disabled={downloading}
          >
            {downloading ? "Preparing..." : "Download Excel"}
          </button>
        </div>
      </div>

      {/* Quick access */}
      <div className="card" style={{ maxWidth: 640 }}>
        <h2 className="text-lg font-semibold mb-4">Quick Exports</h2>
        <div className="grid grid-cols-2 gap-3">
          <QuickExportButton
            label="This month"
            description={`Full ledger for ${currentMonth}`}
            onClick={() => {
              const params = new URLSearchParams({ month: currentMonth });
              window.location.href = "/api/export/invoices_v2?" + params.toString();
            }}
          />
          <QuickExportButton
            label="All invoices"
            description="Complete unfiltered history"
            onClick={() => {
              window.location.href = "/api/export/invoices_v2";
            }}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tint,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  tint: string;
  color: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-head">
        <div>
          <p className="stat-label">{label}</p>
          <p className="stat-value">{value}</p>
        </div>
        <div className="stat-icon" style={{ background: tint }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
            <path d="M3 3v18h18" />
            <path d="m19 9-5 5-4-4-3 3" />
          </svg>
        </div>
      </div>
      <div className="stat-meta">{sub}</div>
    </div>
  );
}

function QuickExportButton({
  label,
  description,
  onClick,
}: {
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-xl border transition-colors hover:bg-black/5"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="font-semibold text-sm mb-1">{label}</div>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{description}</div>
    </button>
  );
}
