import { getDailyMenuForDate } from "@/app/actions/sprint1";
import DailyMenuManager from "@/components/DailyMenuManager";
import { todayIST } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MenusPage() {
  const today = todayIST();
  const response = await getDailyMenuForDate(today);

  return <DailyMenuManager initialMenu={response.data} initialError={response.error ?? null} />;
}
