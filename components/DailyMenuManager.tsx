"use client";

import { useState } from "react";
import { getDailyMenuForDate, saveDailyMenu } from "@/app/actions/sprint1";

type DailyMenu = {
  date: string;
  breakfast: string;
  lunchVeg: string;
  lunchNonVeg: string;
  dinnerVeg: string;
  dinnerNonVeg: string;
};

type Props = {
  initialMenu: DailyMenu;
  initialError?: string | null;
};

export default function DailyMenuManager({ initialMenu, initialError = null }: Props) {
  const [menu, setMenu] = useState<DailyMenu>(initialMenu);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    initialError ? { type: "error", text: initialError } : null
  );

  async function loadMenu(nextDate: string) {
    setLoading(true);
    const response = await getDailyMenuForDate(nextDate);
    setLoading(false);

    if (response.error) {
      setMessage({ type: "error", text: response.error });
      setMenu((current) => ({ ...current, date: nextDate }));
      return;
    }

    setMessage(null);
    setMenu(response.data ?? { ...initialMenu, date: nextDate });
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    const response = await saveDailyMenu(menu);
    setSaving(false);

    if (response.error) {
      setMessage({ type: "error", text: response.error });
      return;
    }

    setMessage({ type: "success", text: `Menu saved for ${menu.date}.` });
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div className="page-hero-copy">
          <p className="page-eyebrow">Menu planner</p>
          <h1 className="page-title">Daily menus</h1>
          <p className="page-copy">
            Set the kitchen run once for the day so dashboard and ops teams see the same meals.
          </p>
        </div>
        <div className="hero-chip-row">
          <div className="chip">Date {menu.date}</div>
        </div>
      </section>

      {message ? (
        <div className={`alert ${message.type === "error" ? "alert-error" : "alert-success"}`}>
          {message.text}
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Service day menu</h2>
            <p className="panel-copy">
              Keep a single kitchen-approved menu for dispatch, phone confirmations, and driver updates.
            </p>
          </div>
          <div className="panel-actions">
            <input
              type="date"
              value={menu.date}
              className="text-input"
              style={{ maxWidth: 190 }}
              onChange={(event) => void loadMenu(event.target.value)}
            />
            <button type="button" className="btn-secondary" onClick={() => void loadMenu(menu.date)} disabled={loading}>
              {loading ? "Loading..." : "Reload"}
            </button>
            <button type="button" className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving..." : "Save menu"}
            </button>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="field-label" htmlFor="menu-breakfast">
              Breakfast
            </label>
            <textarea
              id="menu-breakfast"
              className="text-area"
              value={menu.breakfast}
              onChange={(event) => setMenu((current) => ({ ...current, breakfast: event.target.value }))}
              placeholder="Breakfast menu"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="menu-lunch-veg">
              Lunch (Veg)
            </label>
            <textarea
              id="menu-lunch-veg"
              className="text-area"
              value={menu.lunchVeg}
              onChange={(event) => setMenu((current) => ({ ...current, lunchVeg: event.target.value }))}
              placeholder="Vegetarian Lunch"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="menu-lunch-non-veg">
              Lunch (Non-Veg)
            </label>
            <textarea
              id="menu-lunch-non-veg"
              className="text-area"
              value={menu.lunchNonVeg}
              onChange={(event) => setMenu((current) => ({ ...current, lunchNonVeg: event.target.value }))}
              placeholder="Non-Vegetarian Lunch"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="menu-dinner-veg">
              Dinner (Veg)
            </label>
            <textarea
              id="menu-dinner-veg"
              className="text-area"
              value={menu.dinnerVeg}
              onChange={(event) => setMenu((current) => ({ ...current, dinnerVeg: event.target.value }))}
              placeholder="Vegetarian Dinner"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="menu-dinner-non-veg">
              Dinner (Non-Veg)
            </label>
            <textarea
              id="menu-dinner-non-veg"
              className="text-area"
              value={menu.dinnerNonVeg}
              onChange={(event) => setMenu((current) => ({ ...current, dinnerNonVeg: event.target.value }))}
              placeholder="Non-Vegetarian Dinner"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
