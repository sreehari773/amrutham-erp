export type SubscriptionTemplate = {
  id: string;
  label: string;
  tiffinCount: number;
  description?: string;
};

export type MealTypeConfig = {
  id: "veg" | "mixed" | "non_veg" | string;
  label: string;
  pricePerTiffin: number;
  accent?: string;
};

export type SubscriptionCatalog = {
  templates: SubscriptionTemplate[];
  mealTypes: MealTypeConfig[];
};

export const DEFAULT_SUBSCRIPTION_CATALOG: SubscriptionCatalog = {
  templates: [
    { id: "starter_10", label: "Starter 10", tiffinCount: 10, description: "Light restart plan" },
    { id: "fortnight_15", label: "Fortnight 15", tiffinCount: 15, description: "Flexible mid-month plan" },
    { id: "regular_22", label: "Regular 22", tiffinCount: 22, description: "Most common working-month plan" },
    { id: "monthly_30", label: "Monthly 30", tiffinCount: 30, description: "Full month coverage" },
  ],
  mealTypes: [
    { id: "veg", label: "Veg", pricePerTiffin: 70, accent: "#059669" },
    { id: "mixed", label: "Mixed", pricePerTiffin: 85, accent: "#0f766e" },
    { id: "non_veg", label: "Non Veg", pricePerTiffin: 105, accent: "#b45309" },
  ],
};

export function findTemplate(catalog: SubscriptionCatalog, templateId: string) {
  return catalog.templates.find((template) => template.id === templateId) ?? null;
}

export function findMealType(catalog: SubscriptionCatalog, mealTypeId: string) {
  return catalog.mealTypes.find((mealType) => mealType.id === mealTypeId) ?? null;
}

export function resolveSubscriptionSelection(
  catalog: SubscriptionCatalog,
  templateId: string,
  mealTypeId: string
) {
  const template = findTemplate(catalog, templateId);
  const mealType = findMealType(catalog, mealTypeId);

  if (!template) {
    throw new Error("Selected subscription plan is no longer available.");
  }

  if (!mealType) {
    throw new Error("Selected meal type is no longer available.");
  }

  return {
    template,
    mealType,
    totalTiffins: template.tiffinCount,
    pricePerTiffin: mealType.pricePerTiffin,
    totalAmount: template.tiffinCount * mealType.pricePerTiffin,
  };
}

export function inferSubscriptionSelection(
  catalog: SubscriptionCatalog,
  totalTiffins: number | null | undefined,
  pricePerTiffin: number | null | undefined
) {
  const normalizedCount = Number(totalTiffins ?? 0);
  const normalizedPrice = Number(pricePerTiffin ?? 0);

  const template = catalog.templates.find((item) => item.tiffinCount === normalizedCount) ?? null;
  const mealType =
    catalog.mealTypes.find((item) => item.pricePerTiffin === normalizedPrice) ?? null;

  return {
    templateId: template?.id ?? catalog.templates[0]?.id ?? "",
    mealTypeId: mealType?.id ?? catalog.mealTypes[0]?.id ?? "",
  };
}
