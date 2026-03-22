import { getWeeklyMenus } from "@/app/actions/menus";
import WeeklyMenuManager from "@/components/WeeklyMenuManager";

export const dynamic = "force-dynamic";

export default async function MenusPage() {
  const response = await getWeeklyMenus();

  if (response.error) {
    return (
      <div className="page-stack p-8">
        <div className="alert alert-error">Error loading weekly menus: {response.error}</div>
      </div>
    );
  }

  return <WeeklyMenuManager initialMenus={response.data} />;
}
