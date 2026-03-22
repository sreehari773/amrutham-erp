import { getKOTForDate } from "@/app/actions/sprint1";
import { getMenuForDay } from "@/app/actions/menus";
import KOTPageClient from "@/components/KOTPageClient";
import { todayIST } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function KOTPage() {
  const today = todayIST();
  const [kotRes, menuRes] = await Promise.all([
    getKOTForDate(today),
    getMenuForDay(today),
  ]);

  return (
    <KOTPageClient
      initialDate={today}
      initialEntries={kotRes.data ?? []}
      initialMenu={menuRes.data}
      initialError={kotRes.error ?? menuRes.error ?? null}
    />
  );
}
