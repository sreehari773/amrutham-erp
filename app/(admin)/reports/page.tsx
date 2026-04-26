import { getRevenueSummary, getMonthlyDeliveryStats } from "@/app/actions/sprint1";
import ReportsClient from "@/components/ReportsClient";
import { currentMonthIST } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const month = currentMonthIST();
  const [revenueResult, deliveryResult] = await Promise.all([
    getRevenueSummary(month),
    getMonthlyDeliveryStats(month),
  ]);

  const revenue = revenueResult.data ?? {
    monthly_revenue: 0,
    prepaid_liability: 0,
    active_count: 0,
    completed_count: 0,
    expired_count: 0,
  };

  const delivery = deliveryResult.data ?? {
    deliveredThisMonth: 0,
    deliveredToday: 0,
    outstandingTiffins: 0,
    activeSubscriptions: 0,
  };

  return (
    <ReportsClient
      currentMonth={month}
      summary={{
        monthlyRevenue: revenue.monthly_revenue,
        prepaidLiability: revenue.prepaid_liability,
        activeCount: revenue.active_count,
        deliveredThisMonth: delivery.deliveredThisMonth,
        deliveredToday: delivery.deliveredToday,
        outstandingTiffins: delivery.outstandingTiffins,
      }}
    />
  );
}
