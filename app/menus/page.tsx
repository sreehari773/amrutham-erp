import { getDailyMenuForDate } from "@/app/actions/sprint1";
import { getWeeklySchedule } from "@/app/actions/menu-schedule";
import DailyMenuManager from "@/components/DailyMenuManager";
import WeeklyScheduleEditor from "@/components/WeeklyScheduleEditor";
import { todayIST } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MenusPage() {
  const today = todayIST();
  const [response, scheduleResult] = await Promise.all([
    getDailyMenuForDate(today),
    getWeeklySchedule(),
  ]);

  return (
    <div className="page-stack">
      <DailyMenuManager initialMenu={response.data} initialError={response.error ?? null} />
      <WeeklyScheduleEditor initialSchedule={scheduleResult.data} />
    </div>
  );
}
