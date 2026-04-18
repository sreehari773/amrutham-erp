"use client";

import { useState, useEffect } from "react";
import { getUpcomingDeliveries, pauseDeliveryForDate } from "@/app/actions/customerSchedule";

type PauseScheduleData = {
  subscription?: {
    meal_preference?: string | null;
  } | null;
  pauses?: Array<{
    pause_start: string;
    pause_end: string | null;
    reason?: string | null;
  }>;
};

export default function PauseSchedulePage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PauseScheduleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Date picker state
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    getUpcomingDeliveries().then(res => {
      if (res.error) setError(res.error);
      else setData(res.data && !Array.isArray(res.data) ? res.data : null);
      setLoading(false);
    });
  }, []);

  async function handleSkip() {
    if (!selectedDate) return;
    setLoading(true);
    setError(null);
    
    // Check if meal preference is dinner
    const prefIsDinner = data?.subscription?.meal_preference === 'dinner';
    
    const res = await pauseDeliveryForDate(selectedDate, prefIsDinner);
    if (res.error) {
      setError(res.error);
    } else {
      // Reload pauses
      const fresh = await getUpcomingDeliveries();
      setData(fresh.data && !Array.isArray(fresh.data) ? fresh.data : null);
      setSelectedDate("");
      alert("Delivery successfully skipped! Your remaining tiffins remains untouched.");
    }
    setLoading(false);
  }

  return (
    <div className="animate-in fade-in duration-500 pb-10">
      <h1 className="text-2xl font-black mb-2">Delivery Schedule</h1>
      <p className="text-slate-500 mb-6 text-sm">Need a break? Skip a day and save your tiffin.</p>

      {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-100">{error}</div>}

      {/* Skip Form */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-8">
        <h3 className="font-bold text-slate-800 mb-4">Skip a Delivery</h3>
        <input 
          type="date" 
          value={selectedDate}
          min={new Date().toISOString().split('T')[0]} // Cannot select past days
          onChange={e => setSelectedDate(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-slate-50 mb-4"
        />
        
        <div className="bg-orange-50 text-orange-800 text-xs p-3 rounded-lg mb-4 font-medium flex gap-2 items-start">
          <span>⏰</span>
          <p>Cutoff times: Lunch skips must be made before <b>8:00 AM</b>. Dinner skips before <b>1:00 PM</b>.</p>
        </div>

        <button 
          onClick={handleSkip}
          disabled={!selectedDate || loading}
          className="w-full py-3 bg-rose-500 text-white font-bold rounded-xl active:scale-95 transition-all text-sm shadow-md shadow-rose-500/20 disabled:opacity-50"
        >
          {loading ? "Processing..." : "Confirm Skip"}
        </button>
      </div>

      {/* List Recent Paused Days */}
      <h3 className="font-bold text-slate-800 mb-4">Upcoming Skipped Days</h3>
      {(data?.pauses?.length ?? 0) > 0 ? (
        <div className="space-y-3">
          {(data?.pauses ?? []).map((p, i: number) => {
            const dateStr = new Date(p.pause_start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            return (
              <div key={i} className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 opacity-70">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/></svg>
                  </div>
                  <span className="font-bold text-sm text-slate-600">{dateStr}</span>
                </div>
                <span className="text-xs text-rose-500 font-bold bg-rose-50 px-2 py-1 rounded">Skipped</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-400 italic">No days skipped.</p>
      )}
    </div>
  );
}
