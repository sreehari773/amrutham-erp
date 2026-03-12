"use client";

import { useState } from "react";
import {
  getWeeklySchedule,
  saveWeeklySchedule,
  type MenuScheduleRow,
} from "@/app/actions/menu-schedule";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Props = {
  initialSchedule: MenuScheduleRow[];
};

export default function WeeklyScheduleEditor({ initialSchedule }: Props) {
  const [schedule, setSchedule] = useState<MenuScheduleRow[]>(initialSchedule);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function updateDay(dayIndex: number, field: keyof MenuScheduleRow, value: string) {
    setSchedule((prev) =>
      prev.map((row) =>
        row.day_of_week === dayIndex ? { ...row, [field]: value } : row,
      ),
    );
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await saveWeeklySchedule(schedule);
    setSaving(false);

    if (result.error) {
      setMessage({ type: "error", text: result.error });
    } else {
      setMessage({ type: "success", text: "Weekly schedule saved." });
    }
  }

  async function handleReload() {
    const result = await getWeeklySchedule();
    if (result.data) setSchedule(result.data);
    if (result.error) setMessage({ type: "error", text: result.error });
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Weekly menu schedule</h2>
          <p className="panel-copy">
            Set the 7-day rotating menu. This template auto-generates daily menus for kitchen planning.
          </p>
        </div>
        <div className="panel-actions">
          <button type="button" className="btn-secondary" onClick={handleReload}>
            Reload
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Schedule"}
          </button>
        </div>
      </div>

      {message ? (
        <div className={`alert ${message.type === "error" ? "alert-error" : "alert-success"}`}>
          {message.text}
        </div>
      ) : null}

      <div className="field-stack">
        {schedule.map((row) => (
          <div key={row.day_of_week} className="panel" style={{ padding: 16, background: "var(--surface-raised)" }}>
            <h3 style={{ marginBottom: 12, fontWeight: 600 }}>
              {DAY_LABELS[row.day_of_week]}
            </h3>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Veg items</label>
                <input
                  className="text-input"
                  value={row.veg_items}
                  onChange={(e) => updateDay(row.day_of_week, "veg_items", e.target.value)}
                  placeholder="e.g. Rice + Sambar + Thoran"
                />
              </div>
              <div className="field">
                <label className="field-label">Non-veg items</label>
                <input
                  className="text-input"
                  value={row.non_veg_items}
                  onChange={(e) => updateDay(row.day_of_week, "non_veg_items", e.target.value)}
                  placeholder="e.g. Rice + Fish Curry + Thoran"
                />
              </div>
            </div>
            <div className="form-grid" style={{ marginTop: 8 }}>
              <div className="field">
                <label className="field-label">Veg alternatives</label>
                <input
                  className="text-input"
                  value={row.veg_alternatives ?? ""}
                  onChange={(e) => updateDay(row.day_of_week, "veg_alternatives", e.target.value)}
                  placeholder="e.g. Fish Curry → Sambar"
                />
              </div>
              <div className="field">
                <label className="field-label">Notes</label>
                <input
                  className="text-input"
                  value={row.notes ?? ""}
                  onChange={(e) => updateDay(row.day_of_week, "notes", e.target.value)}
                  placeholder="Special instructions"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
