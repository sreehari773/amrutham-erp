import {
  getCustomerDirectory,
  getCustomersWithSubs,
  getSubscriptionCatalog,
} from "@/app/actions/sprint1";
import CustomersPageClient from "@/components/CustomersPageClient";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const [subsResult, directoryResult, catalogResult] = await Promise.all([
    getCustomersWithSubs(),
    getCustomerDirectory("", 60),
    getSubscriptionCatalog(),
  ]);

  return (
    <CustomersPageClient
      initialSubs={(subsResult.data ?? []) as any[]}
      initialDirectory={(directoryResult.data ?? []) as any[]}
      initialCatalog={catalogResult.data}
      initialError={subsResult.error ?? directoryResult.error ?? catalogResult.error ?? null}
    />
  );
}
