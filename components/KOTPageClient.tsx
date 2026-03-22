"use client";

import { useState } from "react";
import { getKOTForDate } from "@/app/actions/sprint1";
import { getMenuForDay, type WeeklyMenu } from "@/app/actions/menus";
import { formatDateIST } from "@/lib/utils";

type KOTEntry = {
  subscription_id: number;
  name: string;
  address: string;
  phone: string;
  meal_preference: "veg" | "non_veg" | "mixed";
};

type Props = {
  initialDate: string;
  initialEntries: KOTEntry[];
  initialMenu?: WeeklyMenu | null;
  initialError?: string | null;
};

export default function KOTPageClient({ initialDate, initialEntries, initialMenu, initialError = null }: Props) {
  const [date, setDate] = useState(initialDate);
  const [entries, setEntries] = useState<KOTEntry[]>(initialEntries);
  const [menu, setMenu] = useState<WeeklyMenu | null>(initialMenu ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function loadEntries(nextDate: string) {
    setLoading(true);
    const [kotRes, menuRes] = await Promise.all([
      getKOTForDate(nextDate),
      getMenuForDay(nextDate),
    ]);
    setLoading(false);

    if (kotRes.error || menuRes.error) {
      setError(kotRes.error ?? menuRes.error ?? "Failed to load");
      setEntries([]);
      setMenu(null);
      return;
    }

    setError(null);
    setEntries(JSON.parse(JSON.stringify(kotRes.data ?? [])) as KOTEntry[]);
    setMenu(menuRes.data ?? null);
  }

  async function handleDateChange(nextDate: string) {
    setDate(nextDate);
    await loadEntries(nextDate);
  }

  const vegCount = entries.filter((e) => e.meal_preference === "veg").length;
  const nonVegCount = entries.filter((e) => e.meal_preference === "non_veg").length;
  const mixedCount = entries.filter((e) => e.meal_preference === "mixed").length;

  // Mixed Rule implementation: Non-Veg on Wed (3), Fri (5), Sun (0)
  const dateObj = new Date(date);
  const dayIndex = dateObj.getDay();
  const isMixedNonVegDay = [0, 3, 5].includes(dayIndex);
  
  const mixedSuggestion = isMixedNonVegDay ? "Non-Veg" : "Veg";

  return (
    <div className="page-stack">
      <section className="page-hero no-print anim-in">
        <div>
          <p className="page-eyebrow">Dispatch sheet</p>
          <h1 className="page-title">Kitchen Order Ticket</h1>
          <p className="page-subtitle">
            <strong>{entries.length}</strong> order{entries.length !== 1 ? "s" : ""} queued for {formatDateIST(date)}.
          </p>
          <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
             <span className="badge badge-success" style={{ fontSize: "1rem", padding: "4px 8px" }}>
              Total Veg Portions: {vegCount + (isMixedNonVegDay ? 0 : mixedCount)}
            </span>
             <span className="badge badge-danger" style={{ fontSize: "1rem", padding: "4px 8px" }}>
              Total Non-Veg Portions: {nonVegCount + (isMixedNonVegDay ? mixedCount : 0)}
            </span>
             <span className="badge badge-warning" style={{ fontSize: "1rem", padding: "4px 8px" }}>
              Total Mixed Portions: {mixedCount}
            </span>
          </div>
        </div>
        <div className="hero-meta" style={{ minWidth: "260px" }}>
          <input type="date" value={date} onChange={(event) => void handleDateChange(event.target.value)} className="input-field" />
          <div style={{ display: "flex", gap: "10px", width: "100%" }}>
            <button onClick={() => void loadEntries(date)} disabled={loading} className="btn-ghost" style={{ flex: 1 }}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button onClick={() => window.print()} className="btn-primary" style={{ flex: 1 }}>
              Print KOT
            </button>
          </div>
        </div>
      </section>

      <div className="hidden print:block" style={{ marginBottom: "18px" }}>
        <h1 style={{ margin: 0, fontSize: "1.2rem" }}>Amrutham Kitchen Order Ticket</h1>
        <p style={{ margin: "6px 0 0" }}>Date: {formatDateIST(date)} | Total: {entries.length} orders</p>
      </div>

      {error && <div className="status-banner status-banner-error">{error}</div>}

      {loading ? (
        <section className="panel">
          <div className="empty-state">
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: "var(--ink)" }}>Loading orders</p>
              <p style={{ margin: "8px 0 0" }}>Fetching the latest KOT from the ERP.</p>
            </div>
          </div>
        </section>
      ) : entries.length === 0 ? (
        <section className="panel">
          <div className="empty-state">
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: "var(--ink)" }}>No orders for this date</p>
              <p style={{ margin: "8px 0 0" }}>Try another delivery date or refresh the ticket.</p>
            </div>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 anim-in">
          {/* VEG PREP CARD */}
          <section className="panel" style={{ borderTop: "4px solid #10b981" }}>
            <div className="p-6">
              <h2 className="text-xl font-bold mb-2 text-[#10b981]">Vegetarian Prep</h2>
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 mb-6 min-h-[100px]">
                <p className="text-gray-700 whitespace-pre-wrap">{menu?.veg_description || "No menu set for today."}</p>
              </div>
              <div className="flex justify-between items-end border-t border-gray-100 pt-4">
                <div className="flex flex-col">
                  <span className="text-gray-500 font-medium">Portions to Cook</span>
                  {!isMixedNonVegDay && mixedCount > 0 && (
                     <span className="text-xs text-green-600 font-bold">(Includes {mixedCount} Mixed)</span>
                  )}
                </div>
                <span className="text-5xl font-black text-[#10b981] leading-none">
                  {vegCount + (isMixedNonVegDay ? 0 : mixedCount)}
                </span>
              </div>
            </div>
          </section>

          {/* NON-VEG PREP CARD */}
          <section className="panel" style={{ borderTop: "4px solid #ef4444" }}>
            <div className="p-6">
              <h2 className="text-xl font-bold mb-2 text-[#ef4444]">Non-Vegetarian Prep</h2>
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 mb-6 min-h-[100px]">
                <p className="text-gray-700 whitespace-pre-wrap">{menu?.non_veg_description || "No menu set for today."}</p>
              </div>
              <div className="flex justify-between items-end border-t border-gray-100 pt-4">
                <div className="flex flex-col">
                  <span className="text-gray-500 font-medium">Portions to Cook</span>
                  {isMixedNonVegDay && mixedCount > 0 && (
                     <span className="text-xs text-red-600 font-bold">(Includes {mixedCount} Mixed)</span>
                  )}
                </div>
                <span className="text-5xl font-black text-[#ef4444] leading-none">
                  {nonVegCount + (isMixedNonVegDay ? mixedCount : 0)}
                </span>
              </div>
            </div>
          </section>

          {/* MIXED PREP CARD */}
          <section className="panel md:col-span-2 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100">
            <div className="p-6 flex flex-col sm:flex-row justify-between items-center text-center sm:text-left gap-4">
              <div>
                <h2 className="text-xl font-bold text-amber-700">Mixed Preference Selection</h2>
                <p className="text-amber-800/70 text-sm mt-1 max-w-lg">
                  Wednesday, Friday, and Sunday are **Non-Veg** days for Mixed plans. Other days are **Veg**. 
                  Today is a **{mixedSuggestion}** day for them.
                </p>
              </div>
              <div className="flex flex-col items-center sm:items-end">
                <span className="text-amber-700/80 font-medium text-sm mb-1 uppercase tracking-wider">Total Mixed Portions</span>
                <span className="text-5xl font-black text-amber-600 leading-none">
                   {mixedCount}
                </span>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

