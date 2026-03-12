import { todayIST, tomorrowIST, currentMonthIST } from "@/lib/utils";
import { getForecast } from "@/app/actions/forecast";
import { getManifest } from "@/app/actions/manifest";
import { getLatestReconciliation } from "@/app/actions/reconciliation";
import { getRecentMessages } from "@/app/actions/messaging";
import OperationsClient from "@/components/OperationsClient";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const today = todayIST();
  const tomorrow = tomorrowIST();

  const [forecastResult, manifestResult, reconResult, messagesResult] = await Promise.all([
    getForecast(tomorrow),
    getManifest(today),
    getLatestReconciliation(),
    getRecentMessages(15),
  ]);

  const topError =
    forecastResult.error ??
    manifestResult.error ??
    reconResult.error ??
    messagesResult.error ??
    null;

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div className="page-hero-copy">
          <p className="page-eyebrow">Kitchen operations centre</p>
          <h1 className="page-title">Operations</h1>
          <p className="page-copy">
            Daily reconciliation, kitchen forecast, delivery manifests, and messaging automation in one view.
          </p>
        </div>
        <div className="hero-chip-row">
          <div className="chip">Today {today}</div>
          <div className="chip">Forecast for {tomorrow}</div>
        </div>
      </section>

      {topError ? <div className="alert alert-error">{topError}</div> : null}

      <OperationsClient
        initialForecast={forecastResult.data ?? { forecast_date: tomorrow, veg_count: 0, non_veg_count: 0, mixed_count: 0, total_count: 0 }}
        initialManifest={manifestResult.data ?? []}
        initialReconciliation={reconResult.data ?? null}
        initialMessages={messagesResult.data ?? []}
        today={today}
        tomorrow={tomorrow}
      />
    </div>
  );
}
