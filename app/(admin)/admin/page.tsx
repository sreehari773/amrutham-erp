import {
  getMonthlyDeliveryStats,
  getRenewalQueue,
  getSubscriptionCatalog,
  getSystemLogs,
} from "@/app/actions/sprint1";
import AdminConsoleClient from "@/components/AdminConsoleClient";
import { currentMonthIST } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const month = currentMonthIST();
  const [catalogResult, logsResult, statsResult, renewalResult] = await Promise.all([
    getSubscriptionCatalog(),
    getSystemLogs(40),
    getMonthlyDeliveryStats(month),
    getRenewalQueue(),
  ]);

  return (
    <AdminConsoleClient
      initialCatalog={catalogResult.data}
      initialLogs={(logsResult.data ?? []) as any[]}
      monthlyStats={
        statsResult.data ?? {
          deliveredThisMonth: 0,
          deliveredToday: 0,
          outstandingTiffins: 0,
          activeSubscriptions: 0,
        }
      }
      renewalCount={(renewalResult.data ?? []).length}
    />
  );
}
