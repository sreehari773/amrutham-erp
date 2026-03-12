"use client";

import { useState } from "react";
import { getDailyMenuForDate, saveDailyMenu } from "@/app/actions/sprint1";

type DailyMenu = {
  date: string;
  breakfast: string;
  veg: string;
  nonVeg: string;
  mixed: string;
  addons: string;
  notes: string;
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
            Set the kitchen run once for the day so dashboard and ops teams see the same veg, non-veg, mixed, and note stack.
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
              placeholder="Breakfast menu or prep note"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="menu-addons">
              Add-ons
            </label>
            <textarea
              id="menu-addons"
              className="text-area"
              value={menu.addons}
              onChange={(event) => setMenu((current) => ({ ...current, addons: event.target.value }))}
              placeholder="Salad, sweets, chaas, extras"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="menu-veg">
              Veg run
            </label>
            <textarea
              id="menu-veg"
              className="text-area"
              value={menu.veg}
              onChange={(event) => setMenu((current) => ({ ...current, veg: event.target.value }))}
              placeholder="Veg tiffin contents"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="menu-non-veg">
              Non-veg run
            </label>
            <textarea
              id="menu-non-veg"
              className="text-area"
              value={menu.nonVeg}
              onChange={(event) => setMenu((current) => ({ ...current, nonVeg: event.target.value }))}
              placeholder="Non-veg tiffin contents"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="menu-mixed">
              Mixed run
            </label>
            <textarea
              id="menu-mixed"
              className="text-area"
              value={menu.mixed}
              onChange={(event) => setMenu((current) => ({ ...current, mixed: event.target.value }))}
              placeholder="How mixed-route customers should be handled"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="menu-notes">
              Dispatch notes
            </label>
            <textarea
              id="menu-notes"
              className="text-area"
              value={menu.notes}
              onChange={(event) => setMenu((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Driver notes, substitutions, branch notes"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
