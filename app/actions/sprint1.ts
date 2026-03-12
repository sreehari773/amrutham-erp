"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  DEFAULT_SUBSCRIPTION_CATALOG,
  inferSubscriptionSelection,
  resolveSubscriptionSelection,
  type MealTypeConfig,
  type SubscriptionCatalog,
  type SubscriptionTemplate,
} from "@/lib/subscription-catalog";
import { currentMonthIST, todayIST } from "@/lib/utils";

const SUBSCRIPTION_CATALOG_ACTION = "SUBSCRIPTION_CATALOG";
const SYSTEM_LOG_ACTOR = "admin-ui";
const DEMO_PREFIX = "AMRUTHAM_DEMO";

type DailyMenuDraft = {
  date: string;
  breakfast: string;
  veg: string;
  nonVeg: string;
  mixed: string;
  addons: string;
  notes: string;
};

type DirectoryRow = {
  subscription_id: number;
  customer_id: number;
  name: string;
  phone: string;
  address: string | null;
  total_tiffins: number;
  remaining_tiffins: number;
  price_per_tiffin: number;
  status: "Active" | "Completed" | "Cancelled" | "Expired" | "Grace";
  start_date: string | null;
  created_at: string;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function getRequiredString(formData: FormData, key: string, label: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function getOptionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function getOptionalNonNegativeInteger(formData: FormData, key: string, label: string): number {
  const value = formData.get(key);

  if (value == null || value === "") {
    return 0;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }

  return parsed;
}

function revalidateOperationalViews() {
  revalidatePath("/");
  revalidatePath("/customers");
  revalidatePath("/menus");
  revalidatePath("/admin");
  revalidatePath("/kot");
  revalidatePath("/operations");
}

function getMonthBounds(targetMonth: string) {
  const [yearText, monthText] = targetMonth.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const month = Number.parseInt(monthText ?? "", 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error("Target month must be in YYYY-MM format.");
  }

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  return { start, endExclusive };
}

function dateFromIso(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function isoFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDate(value: string, offsetDays: number) {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return isoFromDate(date);
}

function enumerateDeliveryDates(startDate: string, deliveredTillDate: number) {
  if (deliveredTillDate <= 0) {
    return [];
  }

  const today = todayIST();
  const dates: string[] = [];

  for (let index = 0; index < deliveredTillDate; index += 1) {
    const targetDate = shiftDate(startDate, index);

    if (targetDate > today) {
      throw new Error("Delivered till date cannot exceed the actual number of calendar days elapsed.");
    }

    dates.push(targetDate);
  }

  return dates;
}

function sanitizeLikeQuery(query: string) {
  return query.replace(/[%_]/g, "").trim();
}

function normalizeTemplates(value: unknown): SubscriptionTemplate[] {
  if (!Array.isArray(value)) {
    return DEFAULT_SUBSCRIPTION_CATALOG.templates;
  }

  const cleaned = value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
      const id =
        typeof candidate.id === "string" && candidate.id.trim()
          ? candidate.id.trim()
          : label
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "") || `plan_${index + 1}`;
      const tiffinCount =
        typeof candidate.tiffinCount === "number"
          ? candidate.tiffinCount
          : Number.parseInt(String(candidate.tiffinCount ?? ""), 10);
      const description =
        typeof candidate.description === "string" ? candidate.description.trim() : undefined;

      if (!label || !Number.isFinite(tiffinCount) || tiffinCount <= 0) {
        return null;
      }

      return {
        id,
        label,
        tiffinCount,
        description,
      };
    })
    .filter(Boolean) as SubscriptionTemplate[];

  return cleaned.length > 0 ? cleaned : DEFAULT_SUBSCRIPTION_CATALOG.templates;
}

function normalizeMealTypes(value: unknown): MealTypeConfig[] {
  if (!Array.isArray(value)) {
    return DEFAULT_SUBSCRIPTION_CATALOG.mealTypes;
  }

  const cleaned = value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
      const id =
        typeof candidate.id === "string" && candidate.id.trim()
          ? candidate.id.trim()
          : label
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "") || `meal_${index + 1}`;
      const pricePerTiffin =
        typeof candidate.pricePerTiffin === "number"
          ? candidate.pricePerTiffin
          : Number.parseFloat(String(candidate.pricePerTiffin ?? ""));
      const accent = typeof candidate.accent === "string" ? candidate.accent.trim() : undefined;

      if (!label || !Number.isFinite(pricePerTiffin) || pricePerTiffin < 0) {
        return null;
      }

      return {
        id,
        label,
        pricePerTiffin,
        accent,
      };
    })
    .filter(Boolean) as MealTypeConfig[];

  return cleaned.length > 0 ? cleaned : DEFAULT_SUBSCRIPTION_CATALOG.mealTypes;
}

function normalizeCatalog(value: unknown): SubscriptionCatalog {
  if (!value || typeof value !== "object") {
    return DEFAULT_SUBSCRIPTION_CATALOG;
  }

  const candidate = value as Record<string, unknown>;

  return {
    templates: normalizeTemplates(candidate.templates),
    mealTypes: normalizeMealTypes(candidate.mealTypes),
  };
}

async function insertSystemLog(actionType: string, description: string, actor = SYSTEM_LOG_ACTOR) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("system_logs").insert({
    action_type: actionType,
    description,
    actor,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function readLatestJsonLog<T>(actionType: string, fallback: T): Promise<T> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("system_logs")
    .select("description")
    .eq("action_type", actionType)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data?.[0]?.description) {
    return fallback;
  }

  try {
    return JSON.parse(data[0].description) as T;
  } catch {
    return fallback;
  }
}

function inferPlanForRow(
  catalog: SubscriptionCatalog,
  row: Pick<DirectoryRow, "total_tiffins" | "price_per_tiffin">
) {
  return inferSubscriptionSelection(catalog, row.total_tiffins, row.price_per_tiffin);
}

function emptyDailyMenu(date: string): DailyMenuDraft {
  return {
    date,
    breakfast: "",
    veg: "",
    nonVeg: "",
    mixed: "",
    addons: "",
    notes: "",
  };
}

function menuLogType(targetDate: string) {
  return `DAILY_MENU_${targetDate}`;
}

export async function createCustomerWithSubscription(formData: FormData) {
  try {
    const sb = getSupabaseAdmin();
    const name = getRequiredString(formData, "name", "Customer name");
    const phone = getRequiredString(formData, "phone", "Phone");
    const address = getOptionalString(formData, "address") ?? "";
    const paymentMode = getOptionalString(formData, "paymentMode") ?? "UPI";
    const templateId = getRequiredString(formData, "templateId", "Subscription plan");
    const mealTypeId = getRequiredString(formData, "mealTypeId", "Meal type");
    const customStartDate = getOptionalString(formData, "customStartDate");
    const customInvoiceDate = getOptionalString(formData, "customInvoiceDate") ?? customStartDate;
    const deliveredTillDate = getOptionalNonNegativeInteger(
      formData,
      "deliveredTillDate",
      "Delivered till date"
    );
    const mealPreference = getOptionalString(formData, "mealPreference") ?? "veg";
    const skipSaturday = formData.get("skipSaturday") === "true";
    const deliveryNotes = getOptionalString(formData, "deliveryNotes");

    const { data: catalog } = await getSubscriptionCatalog();
    const selection = resolveSubscriptionSelection(catalog, templateId, mealTypeId);

    if (deliveredTillDate > selection.totalTiffins) {
      throw new Error("Delivered till date cannot exceed the subscription tiffin count.");
    }

    const effectiveStartDate = customStartDate ?? todayIST();

    if (deliveredTillDate > 0 && effectiveStartDate > todayIST()) {
      throw new Error("Future subscriptions cannot already have delivered tiffins.");
    }

    const backfillDates = enumerateDeliveryDates(effectiveStartDate, deliveredTillDate);

    const { data, error } = await sb.rpc("create_customer_with_subscription", {
      p_name: name,
      p_phone: phone,
      p_address: address,
      p_total_tiffins: selection.totalTiffins,
      p_price_per_tiffin: selection.pricePerTiffin,
      p_payment_mode: paymentMode,
      p_custom_start_date: customStartDate,
      p_custom_invoice_date: customInvoiceDate,
      p_meal_preference: mealPreference,
      p_skip_saturday: skipSaturday,
      p_delivery_notes: deliveryNotes,
    });

    if (error) {
      return { error: error.message };
    }

    const subscriptionId = Number(data?.subscription_id ?? 0);

    for (const targetDate of backfillDates) {
      const { error: deliveryError } = await sb.rpc("manual_adjust_delivery", {
        p_sub_id: subscriptionId,
        p_target_date: targetDate,
        p_action: "DEDUCT",
        p_reason: "Backfill via customer onboarding",
      });

      if (deliveryError) {
        return {
          error: `Subscription created, but delivery backfill failed on ${targetDate}: ${deliveryError.message}`,
        };
      }
    }

    await insertSystemLog(
      "SUBSCRIPTION_SELECTION",
      JSON.stringify({
        subscriptionId,
        customerName: name,
        phone,
        templateId,
        mealTypeId,
        totalTiffins: selection.totalTiffins,
        pricePerTiffin: selection.pricePerTiffin,
        deliveredTillDate,
      })
    );

    revalidateOperationalViews();
    return { data };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function renewSubscription(formData: FormData) {
  try {
    const sb = getSupabaseAdmin();
    const oldSubId = Number.parseInt(getRequiredString(formData, "oldSubId", "Previous subscription ID"), 10);
    const newTotalTiffins = Number.parseInt(
      getRequiredString(formData, "newTotalTiffins", "New total tiffins"),
      10
    );
    const startDate = getOptionalString(formData, "startDate");
    const paymentMode = getOptionalString(formData, "paymentMode") ?? "UPI";

    if (!Number.isFinite(oldSubId) || oldSubId <= 0) {
      throw new Error("Previous subscription ID must be valid.");
    }

    if (!Number.isFinite(newTotalTiffins) || newTotalTiffins <= 0) {
      throw new Error("New total tiffins must be a positive whole number.");
    }

    const { data, error } = await sb.rpc("renew_subscription", {
      p_old_sub_id: oldSubId,
      p_new_total_tiffins: newTotalTiffins,
      p_start_date: startDate,
      p_payment_mode: paymentMode,
    });

    if (error) {
      return { error: error.message };
    }

    revalidateOperationalViews();
    return { data };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function cancelSubscription(subId: number) {
  try {
    const sb = getSupabaseAdmin();

    const { data, error } = await sb.rpc("cancel_subscription", {
      p_sub_id: subId,
    });

    if (error) {
      return { error: error.message };
    }

    revalidateOperationalViews();
    return { data };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function getRevenueSummary(targetMonth: string) {
  try {
    const sb = getSupabaseAdmin();

    const { data, error } = await sb.rpc("get_revenue_summary", {
      p_target_month: targetMonth,
    });

    if (error) {
      return { error: error.message };
    }

    return { data };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function getRenewalQueue() {
  try {
    const sb = getSupabaseAdmin();

    const { data, error } = await sb.rpc("get_renewal_queue");

    if (error) {
      return { error: error.message };
    }

    return { data: data ?? [] };
  } catch (error) {
    return { error: toErrorMessage(error), data: [] };
  }
}

export async function markReminded(subId: number) {
  try {
    const sb = getSupabaseAdmin();

    const { error } = await sb
      .from("subscriptions")
      .update({ last_reminded_at: new Date().toISOString() })
      .eq("id", subId);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/");
    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function getCustomersWithSubs() {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("subscriptions_with_latest_invoice")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return { error: error.message, data: [] };
    }

    return { data: data ?? [] };
  } catch (error) {
    return { error: toErrorMessage(error), data: [] };
  }
}

export async function getCustomerDirectory(query = "", limit = 30) {
  try {
    const sb = getSupabaseAdmin();
    const normalizedQuery = sanitizeLikeQuery(query);
    let request = sb
      .from("subscriptions_with_latest_invoice")
      .select(
        "subscription_id, customer_id, name, phone, address, total_tiffins, remaining_tiffins, price_per_tiffin, status, start_date, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 4, 40));

    if (normalizedQuery.length >= 2) {
      request = request.or(`name.ilike.%${normalizedQuery}%,phone.ilike.%${normalizedQuery}%`);
    }

    const { data, error } = await request;

    if (error) {
      return { error: error.message, data: [] };
    }

    const deduped = new Map<number, DirectoryRow>();

    for (const row of (data ?? []) as DirectoryRow[]) {
      if (!deduped.has(row.customer_id)) {
        deduped.set(row.customer_id, row);
      }
    }

    return { data: Array.from(deduped.values()).slice(0, limit) };
  } catch (error) {
    return { error: toErrorMessage(error), data: [] };
  }
}

export async function pauseSubscription(
  subId: number,
  pauseStart: string,
  pauseEnd: string | null,
  pauseMode: "override" | "cumulative" = "override",
  reason?: string,
) {
  try {
    const sb = getSupabaseAdmin();

    // Midday cutoff: if pausing for today and it's past 10:30 AM IST, start tomorrow
    const { isPastKitchenCutoff, todayIST: getToday, tomorrowIST: getTomorrow } = await import("@/lib/utils");
    const today = getToday();
    let effectiveStart = pauseStart;

    if (pauseStart === today && isPastKitchenCutoff()) {
      effectiveStart = getTomorrow();
    }

    // Handle cumulative mode: extend existing pause
    if (pauseMode === "cumulative") {
      const { data: currentSub } = await sb
        .from("subscriptions")
        .select("pause_start, pause_end")
        .eq("id", subId)
        .single();

      if (currentSub?.pause_start && pauseEnd) {
        // Extend: keep original start, push end further
        effectiveStart = currentSub.pause_start;
      }
    }

    const { error } = await sb
      .from("subscriptions")
      .update({ pause_start: effectiveStart, pause_end: pauseEnd })
      .eq("id", subId)
      .eq("status", "Active");

    if (error) {
      return { error: error.message };
    }

    // Log to pause_history
    await sb.from("pause_history").insert({
      subscription_id: subId,
      pause_start: effectiveStart,
      pause_end: pauseEnd,
      pause_mode: pauseMode,
      reason: reason ?? null,
    });

    revalidateOperationalViews();
    return { success: true };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function resumeSubscription(subId: number) {
  try {
    const sb = getSupabaseAdmin();

    // Get current pause info before clearing
    const { data: currentSub } = await sb
      .from("subscriptions")
      .select("pause_start, pause_end")
      .eq("id", subId)
      .single();

    const { error } = await sb
      .from("subscriptions")
      .update({ pause_start: null, pause_end: null })
      .eq("id", subId);

    if (error) {
      return { error: error.message };
    }

    // Update pause_history with actual end date
    if (currentSub?.pause_start) {
      const today = todayIST();
      await sb
        .from("pause_history")
        .update({ pause_end: today })
        .eq("subscription_id", subId)
        .eq("pause_start", currentSub.pause_start)
        .is("pause_end", null);
    }

    revalidateOperationalViews();
    return { success: true };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function getSubscriptionCatalog() {
  try {
    const data = normalizeCatalog(
      await readLatestJsonLog<SubscriptionCatalog>(
        SUBSCRIPTION_CATALOG_ACTION,
        DEFAULT_SUBSCRIPTION_CATALOG
      )
    );

    return { data };
  } catch (error) {
    return {
      data: DEFAULT_SUBSCRIPTION_CATALOG,
      error: toErrorMessage(error),
    };
  }
}

export async function saveSubscriptionCatalog(input: SubscriptionCatalog) {
  try {
    const normalizedCatalog = normalizeCatalog(input);

    await insertSystemLog(SUBSCRIPTION_CATALOG_ACTION, JSON.stringify(normalizedCatalog));

    revalidateOperationalViews();
    return { data: normalizedCatalog };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function updateSubscriptionAssignment(input: {
  subId: number;
  templateId: string;
  mealTypeId: string;
}) {
  try {
    const sb = getSupabaseAdmin();
    const { data: catalog } = await getSubscriptionCatalog();
    const selection = resolveSubscriptionSelection(catalog, input.templateId, input.mealTypeId);

    const { data: subRow, error: subError } = await sb
      .from("subscriptions_with_latest_invoice")
      .select("subscription_id, status, total_tiffins, remaining_tiffins")
      .eq("subscription_id", input.subId)
      .limit(1)
      .maybeSingle();

    if (subError || !subRow) {
      return { error: subError?.message ?? "Subscription not found." };
    }

    if (subRow.status !== "Active") {
      return { error: "Only active subscriptions can be modified." };
    }

    const deliveredCount = Math.max(
      Number(subRow.total_tiffins ?? 0) - Number(subRow.remaining_tiffins ?? 0),
      0
    );

    if (selection.totalTiffins < deliveredCount) {
      return {
        error: `This subscription has already delivered ${deliveredCount} tiffins, so the new plan must be at least that large.`,
      };
    }

    const remainingTiffins = selection.totalTiffins - deliveredCount;

    const { error: updateError } = await sb
      .from("subscriptions")
      .update({
        total_tiffins: selection.totalTiffins,
        remaining_tiffins: remainingTiffins,
        price_per_tiffin: selection.pricePerTiffin,
        total_amount: selection.totalAmount,
      })
      .eq("id", input.subId);

    if (updateError) {
      return { error: updateError.message };
    }

    const { data: latestInvoice } = await sb
      .from("invoices")
      .select("id")
      .eq("subscription_id", input.subId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestInvoice?.id) {
      const { error: invoiceError } = await sb
        .from("invoices")
        .update({ amount: selection.totalAmount })
        .eq("id", latestInvoice.id);

      if (invoiceError) {
        return { error: invoiceError.message };
      }
    }

    await insertSystemLog(
      "SUBSCRIPTION_MODIFIED",
      JSON.stringify({
        subscriptionId: input.subId,
        templateId: input.templateId,
        mealTypeId: input.mealTypeId,
        totalTiffins: selection.totalTiffins,
        pricePerTiffin: selection.pricePerTiffin,
        remainingTiffins,
      })
    );

    revalidateOperationalViews();
    return {
      data: {
        totalTiffins: selection.totalTiffins,
        remainingTiffins,
        totalAmount: selection.totalAmount,
      },
    };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function getMonthlyDeliveryStats(targetMonth = currentMonthIST()) {
  try {
    const sb = getSupabaseAdmin();
    const { start, endExclusive } = getMonthBounds(targetMonth);
    const today = todayIST();

    const [monthResult, todayResult, activeResult] = await Promise.all([
      sb
        .from("deliveries")
        .select("id", { count: "exact", head: true })
        .gte("delivery_date", start)
        .lt("delivery_date", endExclusive),
      sb.from("deliveries").select("id", { count: "exact", head: true }).eq("delivery_date", today),
      sb.from("subscriptions").select("id, remaining_tiffins").eq("status", "Active"),
    ]);

    if (monthResult.error || todayResult.error || activeResult.error) {
      return {
        error:
          monthResult.error?.message ??
          todayResult.error?.message ??
          activeResult.error?.message ??
          "Unable to load delivery stats.",
      };
    }

    const outstandingTiffins = (activeResult.data ?? []).reduce((sum, row) => {
      return sum + Number(row.remaining_tiffins ?? 0);
    }, 0);

    return {
      data: {
        deliveredThisMonth: monthResult.count ?? 0,
        deliveredToday: todayResult.count ?? 0,
        outstandingTiffins,
        activeSubscriptions: (activeResult.data ?? []).length,
      },
    };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function getDailyMenuForDate(targetDate: string) {
  try {
    const data = await readLatestJsonLog<DailyMenuDraft>(menuLogType(targetDate), emptyDailyMenu(targetDate));
    return { data };
  } catch (error) {
    return {
      data: emptyDailyMenu(targetDate),
      error: toErrorMessage(error),
    };
  }
}

export async function saveDailyMenu(input: DailyMenuDraft) {
  try {
    const payload = {
      date: input.date,
      breakfast: input.breakfast.trim(),
      veg: input.veg.trim(),
      nonVeg: input.nonVeg.trim(),
      mixed: input.mixed.trim(),
      addons: input.addons.trim(),
      notes: input.notes.trim(),
      savedAt: new Date().toISOString(),
    };

    await insertSystemLog(menuLogType(input.date), JSON.stringify(payload));

    revalidatePath("/menus");
    revalidatePath("/");
    return { data: payload };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function getSystemLogs(limit = 40) {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("system_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return { error: error.message, data: [] };
    }

    return { data: data ?? [] };
  } catch (error) {
    return { error: toErrorMessage(error), data: [] };
  }
}

export async function seedDemoData() {
  try {
    const sb = getSupabaseAdmin();
    const { data: catalog } = await getSubscriptionCatalog();

    const demoCustomers = [
      {
        name: `${DEMO_PREFIX} Priya Shah`,
        phone: "9000010011",
        address: "Andheri East, Mumbai",
        templateId: "regular_22",
        mealTypeId: "veg",
        startDate: shiftDate(todayIST(), -21),
        delivered: 19,
      },
      {
        name: `${DEMO_PREFIX} Arjun Rao`,
        phone: "9000010012",
        address: "Bandra West, Mumbai",
        templateId: "monthly_30",
        mealTypeId: "mixed",
        startDate: shiftDate(todayIST(), -11),
        delivered: 10,
      },
      {
        name: `${DEMO_PREFIX} Sana Khan`,
        phone: "9000010013",
        address: "Powai, Mumbai",
        templateId: "fortnight_15",
        mealTypeId: "non_veg",
        startDate: shiftDate(todayIST(), -8),
        delivered: 5,
        pauseStart: todayIST(),
      },
      {
        name: `${DEMO_PREFIX} Karthik Menon`,
        phone: "9000010014",
        address: "Vile Parle East, Mumbai",
        templateId: "starter_10",
        mealTypeId: "veg",
        startDate: shiftDate(todayIST(), -12),
        delivered: 10,
      },
      {
        name: `${DEMO_PREFIX} Neha Iyer`,
        phone: "9000010015",
        address: "Goregaon West, Mumbai",
        templateId: "regular_22",
        mealTypeId: "mixed",
        startDate: shiftDate(todayIST(), -9),
        delivered: 4,
        cancelAfterCreate: true,
      },
    ] as const;

    let created = 0;
    let skipped = 0;
    const notes: string[] = [];

    for (const demo of demoCustomers) {
      const { data: existing } = await sb
        .from("subscriptions_with_latest_invoice")
        .select("subscription_id")
        .eq("phone", demo.phone)
        .limit(1);

      if ((existing ?? []).length > 0) {
        skipped += 1;
        notes.push(`${demo.phone} already exists`);
        continue;
      }

      const selection = resolveSubscriptionSelection(catalog, demo.templateId, demo.mealTypeId);

      const { data, error } = await sb.rpc("create_customer_with_subscription", {
        p_name: demo.name,
        p_phone: demo.phone,
        p_address: demo.address,
        p_total_tiffins: selection.totalTiffins,
        p_price_per_tiffin: selection.pricePerTiffin,
        p_payment_mode: "UPI",
        p_custom_start_date: demo.startDate,
        p_custom_invoice_date: demo.startDate,
      });

      if (error) {
        notes.push(`${demo.phone}: ${error.message}`);
        continue;
      }

      const subscriptionId = Number(data?.subscription_id ?? 0);

      for (const targetDate of enumerateDeliveryDates(demo.startDate, demo.delivered)) {
        const { error: deliveryError } = await sb.rpc("manual_adjust_delivery", {
          p_sub_id: subscriptionId,
          p_target_date: targetDate,
          p_action: "DEDUCT",
          p_reason: "Demo seed",
        });

        if (deliveryError) {
          notes.push(`Sub #${subscriptionId}: ${deliveryError.message}`);
          break;
        }
      }

      if ("pauseStart" in demo && demo.pauseStart) {
        await sb
          .from("subscriptions")
          .update({ pause_start: demo.pauseStart, pause_end: null })
          .eq("id", subscriptionId);
      }

      if ("cancelAfterCreate" in demo && demo.cancelAfterCreate) {
        await sb.rpc("cancel_subscription", {
          p_sub_id: subscriptionId,
        });
      }

      created += 1;
    }

    await saveDailyMenu({
      date: todayIST(),
      breakfast: "Moong chilla, chutney",
      veg: "Phulka, jeera rice, paneer bhurji, dal tadka",
      nonVeg: "Phulka, jeera rice, egg curry, dal tadka",
      mixed: "Paneer bhurji or egg curry based on route list",
      addons: "Salad cup, chaas",
      notes: "Demo menu seeded from admin utility",
    });

    await insertSystemLog(
      "DEMO_DATA_SEEDED",
      JSON.stringify({
        created,
        skipped,
        notes,
      })
    );

    revalidateOperationalViews();
    return { data: { created, skipped, notes } };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function getReturningCustomerSuggestion(customerId: number) {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("subscriptions_with_latest_invoice")
      .select(
        "subscription_id, customer_id, name, phone, address, total_tiffins, remaining_tiffins, price_per_tiffin, status, start_date, created_at"
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { error: error.message };
    }

    if (!data) {
      return { error: "Customer not found." };
    }

    const catalog = (await getSubscriptionCatalog()).data;
    return {
      data: {
        ...data,
        inferredSelection: inferPlanForRow(catalog, data as DirectoryRow),
      },
    };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
