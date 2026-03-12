"use client";

import { useState } from "react";
import {
  getSystemLogs,
  getSubscriptionCatalog,
  saveSubscriptionCatalog,
  seedDemoData,
} from "@/app/actions/sprint1";
import type { SubscriptionCatalog } from "@/lib/subscription-catalog";
import { formatTimestampIST } from "@/lib/utils";

type SystemLog = {
  id: number;
  action_type: string;
  description: string | null;
  actor: string;
  created_at: string;
};

type Props = {
  initialCatalog: SubscriptionCatalog;
  initialLogs: SystemLog[];
  monthlyStats: {
    deliveredThisMonth: number;
    deliveredToday: number;
    outstandingTiffins: number;
    activeSubscriptions: number;
  };
  renewalCount: number;
};

export default function AdminConsoleClient({
  initialCatalog,
  initialLogs,
  monthlyStats,
  renewalCount,
}: Props) {
  const [catalog, setCatalog] = useState<SubscriptionCatalog>(initialCatalog);
  const [logs, setLogs] = useState<SystemLog[]>(initialLogs);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSaveCatalog() {
    setSaving(true);
    setMessage(null);

    const response = await saveSubscriptionCatalog(catalog);
    setSaving(false);

    if (response.error) {
      setMessage({ type: "error", text: response.error });
      return;
    }

    setCatalog(response.data ?? catalog);
    setMessage({ type: "success", text: "Subscription catalog updated." });
  }

  async function handleRefreshLogs() {
    const [logsResult, catalogResult] = await Promise.all([getSystemLogs(40), getSubscriptionCatalog()]);
    setLogs((logsResult.data ?? []) as SystemLog[]);
    setCatalog(catalogResult.data ?? catalog);
  }

  async function handleSeedDemoData() {
    if (!window.confirm("Create demo customers, subscriptions, and a sample menu in the connected database?")) {
      return;
    }

    setSeeding(true);
    setMessage(null);

    const response = await seedDemoData();
    setSeeding(false);

    if (response.error) {
      setMessage({ type: "error", text: response.error });
      return;
    }

    const created = response.data?.created ?? 0;
    const skipped = response.data?.skipped ?? 0;
    setMessage({ type: "success", text: `Demo data complete. Created ${created}, skipped ${skipped}.` });
    await handleRefreshLogs();
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div className="page-hero-copy">
          <p className="page-eyebrow">Admin controls</p>
          <h1 className="page-title">Catalog, logs, and test setup</h1>
          <p className="page-copy">
            Manage subscription values centrally, inspect recent operational events, and seed realistic demo data for testing.
          </p>
        </div>
        <div className="hero-chip-row">
          <div className="chip">Renewal queue {renewalCount}</div>
          <div className="chip">Delivered this month {monthlyStats.deliveredThisMonth}</div>
          <div className="chip">Outstanding tiffins {monthlyStats.outstandingTiffins}</div>
        </div>
      </section>

      {message ? (
        <div className={`alert ${message.type === "error" ? "alert-error" : "alert-success"}`}>
          {message.text}
        </div>
      ) : null}

      <section className="grid-columns-3">
        <div className="metric-card">
          <strong>Delivered this month</strong>
          <span>{monthlyStats.deliveredThisMonth}</span>
        </div>
        <div className="metric-card">
          <strong>Delivered today</strong>
          <span>{monthlyStats.deliveredToday}</span>
        </div>
        <div className="metric-card">
          <strong>Active subscriptions</strong>
          <span>{monthlyStats.activeSubscriptions}</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Subscription catalog</h2>
            <p className="panel-copy">
              These values drive customer onboarding and subscription modification. Kitchen staff no longer enter price per tiffin manually.
            </p>
          </div>
          <div className="panel-actions">
            <button type="button" className="btn-secondary" onClick={() => void handleRefreshLogs()}>
              Reload config
            </button>
            <button type="button" className="btn-primary" onClick={() => void handleSaveCatalog()} disabled={saving}>
              {saving ? "Saving..." : "Save catalog"}
            </button>
          </div>
        </div>

        <div className="grid-columns-2">
          <div className="field-stack">
            <div>
              <p className="field-label">Subscription plans</p>
              <p className="field-copy">Edit the labels and tiffin counts that staff can assign.</p>
            </div>
            {catalog.templates.map((template, index) => (
              <div className="form-grid" key={template.id}>
                <div className="field">
                  <label className="field-label">Plan label</label>
                  <input
                    className="text-input"
                    value={template.label}
                    onChange={(event) =>
                      setCatalog((current) => ({
                        ...current,
                        templates: current.templates.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, label: event.target.value } : item
                        ),
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label className="field-label">Tiffin count</label>
                  <input
                    className="text-input"
                    type="number"
                    min="1"
                    value={template.tiffinCount}
                    onChange={(event) =>
                      setCatalog((current) => ({
                        ...current,
                        templates: current.templates.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, tiffinCount: Number(event.target.value || item.tiffinCount) }
                            : item
                        ),
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="field-stack">
            <div>
              <p className="field-label">Meal type prices</p>
              <p className="field-copy">Veg, mixed, and non-veg values are the only pricing staff should see.</p>
            </div>
            {catalog.mealTypes.map((mealType, index) => (
              <div className="form-grid" key={mealType.id}>
                <div className="field">
                  <label className="field-label">Meal type</label>
                  <input
                    className="text-input"
                    value={mealType.label}
                    onChange={(event) =>
                      setCatalog((current) => ({
                        ...current,
                        mealTypes: current.mealTypes.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, label: event.target.value } : item
                        ),
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label className="field-label">Price per tiffin</label>
                  <input
                    className="text-input"
                    type="number"
                    min="0"
                    value={mealType.pricePerTiffin}
                    onChange={(event) =>
                      setCatalog((current) => ({
                        ...current,
                        mealTypes: current.mealTypes.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, pricePerTiffin: Number(event.target.value || item.pricePerTiffin) }
                            : item
                        ),
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid-columns-2">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Demo data</h2>
              <p className="panel-copy">
                Create a reusable set of active, paused, completed, cancelled, and renewal-due subscriptions for testing.
              </p>
            </div>
          </div>
          <div className="field-stack">
            <div className="summary-box">
              <div className="summary-grid">
                <div className="summary-item">
                  <strong>Includes</strong>
                  <span>Customers</span>
                </div>
                <div className="summary-item">
                  <strong>Also seeds</strong>
                  <span>Menus</span>
                </div>
                <div className="summary-item">
                  <strong>Safe rerun</strong>
                  <span>Skips duplicates</span>
                </div>
                <div className="summary-item">
                  <strong>Use case</strong>
                  <span>Thorough QA</span>
                </div>
              </div>
            </div>
            <div className="btn-row">
              <button type="button" className="btn-primary" onClick={() => void handleSeedDemoData()} disabled={seeding}>
                {seeding ? "Creating demo data..." : "Populate demo data"}
              </button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Recent system logs</h2>
              <p className="panel-copy">
                Useful for checking whether renewals, menu saves, and customer operations are writing to the audit trail.
              </p>
            </div>
          </div>
          <div className="list-stack">
            {logs.slice(0, 8).map((log) => (
              <div className="list-item" key={log.id}>
                <div className="list-item-copy">
                  <strong>{log.action_type}</strong>
                  <span>
                    {log.description || "No description"} | {log.actor} | {formatTimestampIST(log.created_at)}
                  </span>
                </div>
              </div>
            ))}
            {logs.length === 0 ? (
              <div className="empty-state">
                <strong>No system logs</strong>
                <span>The audit trail is empty right now.</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
