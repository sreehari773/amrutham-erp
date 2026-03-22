import React from "react";
import SubscriptionsClient from "@/components/SubscriptionsClient";
import { getSubscriptionPlans } from "@/app/actions/plans";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const result = await getSubscriptionPlans();

  return (
    <SubscriptionsClient 
      initialPlans={result.data ?? []} 
      initialError={result.error ?? null} 
    />
  );
}
