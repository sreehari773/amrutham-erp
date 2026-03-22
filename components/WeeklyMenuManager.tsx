"use client";

import { useState } from "react";
import { type WeeklyMenu, updateWeeklyMenu } from "@/app/actions/menus";

export default function WeeklyMenuManager({ initialMenus }: { initialMenus: WeeklyMenu[] }) {
  const [menus, setMenus] = useState<WeeklyMenu[]>(initialMenus);
  const [savingFor, setSavingFor] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSave(dayOfWeek: string, vegDescription: string, nonVegDescription: string) {
    setSavingFor(dayOfWeek);
    setMessage(null);

    const formData = new FormData();
    formData.set("dayOfWeek", dayOfWeek);
    formData.set("vegDescription", vegDescription);
    formData.set("nonVegDescription", nonVegDescription);

    const response = await updateWeeklyMenu(formData);
    setSavingFor(null);

    if (response.error) {
      setMessage({ type: "error", text: response.error });
    } else {
      setMessage({ type: "success", text: `${dayOfWeek}'s menu successfully updated!` });
    }
  }

  function handleDescChange(dayOfWeek: string, field: "veg_description" | "non_veg_description", value: string) {
    setMenus(current =>
      current.map(m =>
        m.day_of_week === dayOfWeek
          ? { ...m, [field]: value }
          : m
      )
    );
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div className="page-hero-copy">
          <p className="page-eyebrow">Menu planner</p>
          <h1 className="page-title">Weekly Menus</h1>
          <p className="page-copy">
            Set the fixed repeating menu for the week. The Dashboard and Kitchen view will automatically read from these settings based on the current day.
          </p>
        </div>
      </section>

      {message && (
        <div className={`alert ${message.type === "error" ? "alert-error" : "alert-success"} mb-6`}>
          {message.text}
        </div>
      )}

      {menus.map((menu) => (
        <section key={menu.day_of_week} className="panel mb-6">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{menu.day_of_week}</h2>
              <p className="panel-copy">Define the Veg and Non-Veg items served on this day.</p>
            </div>
            <div className="panel-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleSave(menu.day_of_week, menu.veg_description, menu.non_veg_description)}
                disabled={savingFor === menu.day_of_week}
              >
                {savingFor === menu.day_of_week ? "Saving..." : "Save details"}
              </button>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="field-label">Veg Menu</label>
              <textarea
                className="text-area"
                value={menu.veg_description}
                onChange={(e) => handleDescChange(menu.day_of_week, "veg_description", e.target.value)}
                placeholder="List the veg items..."
                rows={3}
              />
            </div>
            <div className="field">
              <label className="field-label">Non-Veg Menu</label>
              <textarea
                className="text-area"
                value={menu.non_veg_description}
                onChange={(e) => handleDescChange(menu.day_of_week, "non_veg_description", e.target.value)}
                placeholder="List the non-veg items..."
                rows={3}
              />
            </div>
          </div>
        </section>
      ))}

      {menus.length === 0 && (
        <div className="panel p-10 text-center text-gray-500">
          No weekly menus found. Make sure the database is seeded.
        </div>
      )}
    </div>
  );
}
