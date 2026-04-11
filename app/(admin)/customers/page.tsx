import {
  getCustomerDirectory,
  getCustomersWithSubs,
} from "@/app/actions/sprint1";
import { getSubscriptionPlans } from "@/app/actions/plans";
import CustomersPageClient from "@/components/CustomersPageClient";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const [subsResult, directoryResult, plansResult] = await Promise.all([
    getCustomersWithSubs(),
    getCustomerDirectory("", 60),
    getSubscriptionPlans(),
  ]);

  return (
    <CustomersPageClient
      initialSubs={(subsResult.data ?? []) as any[]}
      initialDirectory={(directoryResult.data ?? []) as any[]}
      subscriptionPlans={(plansResult.data ?? []) as any[]}
      initialError={subsResult.error ?? directoryResult.error ?? plansResult.error ?? null}
    />
  );
}
