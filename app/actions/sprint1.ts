"use server";

import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { logShadowMismatch } from "@/lib/rollout";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  DEFAULT_SUBSCRIPTION_CATALOG,
  inferSubscriptionSelection,
  resolveSubscriptionSelection,
  type MealTypeConfig,
  type SubscriptionCatalog,
  type SubscriptionTemplate,
} from "@/lib/subscription-catalog";
import { currentMonthIST, isPastKitchenCutoff, todayIST, tomorrowIST } from "@/lib/utils";
import { queueMessage } from "@/app/actions/messaging";

const SUBSCRIPTION_CATALOG_ACTION = "SUBSCRIPTION_CATALOG";
const SYSTEM_LOG_ACTOR = "admin-ui";
const DEMO_PREFIX = "AMRUTHAM_DEMO";

type DailyMenuDraft = {
  date: string;
  breakfast: string;
  lunchVeg: string;
  lunchNonVeg: string;
  dinnerVeg: string;
  dinnerNonVeg: string;
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

const WEEKDAY_SET = new Set([0, 1, 2, 3, 4, 5, 6]);
const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function shouldQueueAutomatedMessages() {
  return env.rollout.whatsappAutomationWriteEnabled;
}

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

function parseSkipWeekdays(value: string | null): number[] {
  if (!value) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Weekday skip settings are invalid.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Weekday skip settings must be a list.");
  }

  const normalized = Array.from(
    new Set(
      parsed.map((item) => Number.parseInt(String(item), 10)).filter((item) => WEEKDAY_SET.has(item))
    )
  ).sort((left, right) => left - right);

  if (normalized.length !== parsed.length) {
    throw new Error("Weekday skip settings contain an invalid day.");
  }

  return normalized;
}

function normalizeSkipWeekdays(skipWeekdays: number[]): number[] {
  const normalized = Array.from(
    new Set(
      skipWeekdays
        .map((item) => Number.parseInt(String(item), 10))
        .filter((item) => WEEKDAY_SET.has(item))
    )
  ).sort((left, right) => left - right);

  if (normalized.length !== skipWeekdays.length) {
    throw new Error("Weekday skip settings contain an invalid day.");
  }

  return normalized;
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

function enumerateDeliveryDates(startDate: string, deliveredTillDate: number, skipWeekdays: number[] = []) {
  if (deliveredTillDate <= 0) {
    return [];
  }

  const today = todayIST();
  const dates: string[] = [];
  const blockedDays = new Set(skipWeekdays);
  let cursor = 0;

  while (dates.length < deliveredTillDate) {
    const targetDate = shiftDate(startDate, cursor);
    cursor += 1;

    if (targetDate > today) {
      throw new Error("Delivered till date cannot exceed the actual number of eligible delivery days elapsed.");
    }

    if (blockedDays.has(new Date(`${targetDate}T00:00:00+05:30`).getDay())) {
      continue;
    }

    dates.push(targetDate);
  }

  return dates;
}

function sanitizeLikeQuery(query: string) {
  return query.replace(/[%_]/g, "").trim();
}

function matchesPauseWindow(targetDate: string, pauseStart: string | null, pauseEnd: string | null) {
  if (!pauseStart) {
    return false;
  }

  const effectiveEnd = pauseEnd ?? pauseStart;
  return targetDate >= pauseStart && targetDate <= effectiveEnd;
}

function getWeekdayForIsoDate(targetDate: string) {
  return new Date(`${targetDate}T00:00:00+05:30`).getDay();
}

function getDeliveryBlockedReason(subscription: {
  status: string | null;
  start_date: string | null;
  remaining_tiffins: number | null;
  pause_start: string | null;
  pause_end: string | null;
  skip_saturday?: boolean | null;
  skip_weekdays?: number[] | null;
}, targetDate: string) {
  if (!subscription.start_date || targetDate < subscription.start_date) {
    return "Subscription has not started yet.";
  }

  if (!["Active", "Grace"].includes(subscription.status ?? "")) {
    return `Subscription is ${subscription.status ?? "inactive"}.`;
  }

  if (Number(subscription.remaining_tiffins ?? 0) <= 0) {
    return "No remaining tiffins.";
  }

  if (matchesPauseWindow(targetDate, subscription.pause_start, subscription.pause_end)) {
    return "Paused on this date.";
  }

  const targetDay = getWeekdayForIsoDate(targetDate);
  const skipWeekdays = subscription.skip_weekdays ?? [];

  if ((subscription.skip_saturday && targetDay === 6) || skipWeekdays.includes(targetDay)) {
    return `${WEEKDAY_LABELS[targetDay]} is configured as a skipped day.`;
  }

  return null;
}

function getNextEligibleDeliveryDate(subscription: {
  status: string | null;
  start_date: string | null;
  remaining_tiffins: number | null;
  pause_start: string | null;
  pause_end: string | null;
  skip_saturday?: boolean | null;
  skip_weekdays?: number[] | null;
}, fromDate: string) {
  for (let offset = 0; offset < 45; offset += 1) {
    const targetDate = shiftDate(fromDate, offset);
    if (!getDeliveryBlockedReason(subscription, targetDate)) {
      return targetDate;
    }
  }

  return null;
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
    lunchVeg: "",
    lunchNonVeg: "",
    dinnerVeg: "",
    dinnerNonVeg: "",
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
    const planId = getRequiredString(formData, "planId", "Subscription plan");
    const customStartDate = getOptionalString(formData, "customStartDate");
    const customInvoiceDate = getOptionalString(formData, "customInvoiceDate") ?? customStartDate;
    const deliveredTillDate = getOptionalNonNegativeInteger(
      formData,
      "deliveredTillDate",
      "Delivered till date"
    );
    const mealPreference = getOptionalString(formData, "mealPreference") ?? "veg";
    const skipWeekdays = parseSkipWeekdays(getOptionalString(formData, "skipWeekdays"));
    const skipSaturday = skipWeekdays.includes(6) || formData.get("skipSaturday") === "true";
    const deliveryNotes = getOptionalString(formData, "deliveryNotes");

    const { data: planData, error: planError } = await sb
      .from("subscription_plans")
      .select("tiffin_count, total_price")
      .eq("id", Number(planId))
      .single();

    if (planError || !planData) {
      throw new Error(planError?.message || "Invalid Subscription Plan selected.");
    }

    if (deliveredTillDate > planData.tiffin_count) {
      throw new Error("Delivered till date cannot exceed the subscription tiffin count.");
    }

    const effectiveStartDate = customStartDate ?? todayIST();

    if (deliveredTillDate > 0 && effectiveStartDate > todayIST()) {
      throw new Error("Future subscriptions cannot already have delivered tiffins.");
    }

    const backfillDates = enumerateDeliveryDates(effectiveStartDate, deliveredTillDate, skipWeekdays);

    const { data, error } = await sb.rpc("create_customer_with_subscription", {
      p_name: name,
      p_phone: phone,
      p_address: address,
      p_plan_id: Number(planId),
      p_payment_mode: paymentMode,
      p_custom_start_date: customStartDate,
      p_custom_invoice_date: customInvoiceDate,
      p_meal_preference: mealPreference,
      p_skip_saturday: skipSaturday,
      p_skip_weekdays: skipWeekdays,
      p_delivery_notes: deliveryNotes,
    });

    if (error) {
      return { error: error.message };
    }

    const subscriptionId = Number(data?.subscription_id ?? 0);

    const deliveryResults = await Promise.all(
      backfillDates.map((targetDate) =>
        sb.rpc("manual_adjust_delivery", {
          p_sub_id: subscriptionId,
          p_target_date: targetDate,
          p_action: "DEDUCT",
          p_reason: "Backfill via customer onboarding",
        })
      )
    );

    for (let i = 0; i < deliveryResults.length; i++) {
      const { error: deliveryError } = deliveryResults[i];
      if (deliveryError) {
        return {
          error: `Subscription created, but delivery backfill failed on ${backfillDates[i]}: ${deliveryError.message}`,
        };
      }
    }

    await insertSystemLog(
      "SUBSCRIPTION_SELECTION",
      JSON.stringify({
        subscriptionId,
        customerName: name,
        phone,
        planId: Number(planId),
        totalTiffins: planData.tiffin_count,
        totalAmount: planData.total_price,
        deliveredTillDate,
        skipWeekdays,
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
    const planId = Number.parseInt(
      getRequiredString(formData, "planId", "Renwal Plan ID"),
      10
    );
    const startDate = getOptionalString(formData, "startDate") ?? todayIST();
    const paymentMode = getOptionalString(formData, "paymentMode") ?? "UPI";

    if (!Number.isFinite(oldSubId) || oldSubId <= 0) {
      throw new Error("Previous subscription ID must be valid.");
    }

    if (!Number.isFinite(planId) || planId <= 0) {
      throw new Error("Plan ID must be a positive whole number.");
    }

    const { data, error } = await sb.rpc("renew_subscription", {
      p_old_sub_id: oldSubId,
      p_plan_id: planId,
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
    const { skipAutomationShadowEnabled, skipAutomationWriteEnabled } = env.rollout;

    // Midday cutoff: if pausing for today and it's past 10:30 AM IST, start tomorrow
    const today = todayIST();
    let effectiveStart = pauseStart;

    if (pauseStart === today && isPastKitchenCutoff()) {
      effectiveStart = tomorrowIST();
    }

    const { data: currentSub, error: currentSubError } = await sb
      .from("subscriptions")
      .select("pause_start, pause_end")
      .eq("id", subId)
      .maybeSingle();

    if (currentSubError) {
      return { error: currentSubError.message };
    }

    const currentPauseEnd = currentSub?.pause_end ?? currentSub?.pause_start ?? null;
    const legacyPauseEnd = pauseEnd ?? effectiveStart;
    const legacyWindow =
      pauseMode === "cumulative" && currentSub?.pause_start
        ? {
            pause_start: currentSub.pause_start < effectiveStart ? currentSub.pause_start : effectiveStart,
            pause_end:
              currentPauseEnd && currentPauseEnd > legacyPauseEnd ? currentPauseEnd : legacyPauseEnd,
          }
        : {
            pause_start: effectiveStart,
            pause_end: legacyPauseEnd,
          };

    if (skipAutomationShadowEnabled) {
      await logShadowMismatch("SHADOW_SKIP_MISMATCH", {
        subscriptionId: subId,
        pauseMode,
        requestedStart: pauseStart,
        requestedEnd: pauseEnd,
        effectiveStart,
        legacyWindow,
        projectedWindow: legacyWindow,
        reason: reason ?? "Admin pause",
      });
    }

    if (skipAutomationWriteEnabled) {
      const { error } = await sb.rpc("register_pause_event_v2", {
        p_sub_id: subId,
        p_pause_start: effectiveStart,
        p_pause_end: pauseEnd,
        p_pause_mode: pauseMode,
        p_reason: reason ?? "Admin pause",
        p_actor: SYSTEM_LOG_ACTOR,
      });

      if (error) {
        return { error: error.message };
      }
    } else {
      const { error: subscriptionError } = await sb
        .from("subscriptions")
        .update({
          pause_start: legacyWindow.pause_start,
          pause_end: legacyWindow.pause_end,
        })
        .eq("id", subId);

      if (subscriptionError) {
        return { error: subscriptionError.message };
      }

      const { error: historyError } = await sb.from("pause_history").insert({
        subscription_id: subId,
        pause_start: effectiveStart,
        pause_end: pauseEnd ?? effectiveStart,
        reason: reason ?? "Admin pause",
      });

      if (historyError) {
        return { error: historyError.message };
      }

      await insertSystemLog(
        "SUBSCRIPTION_PAUSED",
        JSON.stringify({
          subscriptionId: subId,
          pauseStart: effectiveStart,
          pauseEnd: pauseEnd ?? effectiveStart,
          pauseMode,
          mode: "legacy",
        })
      );
    }

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
    const { prorationShadowEnabled, prorationWriteEnabled, whatsappAutomationShadowEnabled } = env.rollout;
    const { data: catalog } = await getSubscriptionCatalog();
    const selection = resolveSubscriptionSelection(catalog, input.templateId, input.mealTypeId);

    const { data: subRow, error: subError } = await sb
      .from("subscriptions")
      .select("id, status, total_tiffins, remaining_tiffins, price_per_tiffin, customer_id")
      .eq("id", input.subId)
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
    const existingRemainingValue = Number(subRow.remaining_tiffins ?? 0) * Number(subRow.price_per_tiffin ?? 0);
    const newRemainingValue = remainingTiffins * selection.pricePerTiffin;
    const proratedDelta = Number((newRemainingValue - existingRemainingValue).toFixed(2));

    if (prorationShadowEnabled) {
      await logShadowMismatch("SHADOW_PRORATION_MISMATCH", {
        subscriptionId: input.subId,
        deliveredCount,
        remainingTiffins,
        existingRemainingValue,
        newRemainingValue,
        proratedDelta,
        templateId: input.templateId,
        mealTypeId: input.mealTypeId,
      });
    }

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
      .select("id, invoice_number")
      .eq("subscription_id", input.subId)
      .neq("invoice_type", "adjustment")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let adjustmentInvoiceId: number | null = null;

    if (!prorationWriteEnabled && latestInvoice?.id) {
      const { error: invoiceMutationError } = await sb
        .from("invoices")
        .update({
          amount: selection.totalAmount,
          adjustment_meta: {
            legacyMutation: true,
            templateId: input.templateId,
            mealTypeId: input.mealTypeId,
          },
        })
        .eq("id", latestInvoice.id);

      if (invoiceMutationError) {
        return { error: invoiceMutationError.message };
      }
    }

    if (prorationWriteEnabled && latestInvoice?.id && proratedDelta !== 0) {
      let adjustmentInvoiceNumber = `ADJ-${Date.now()}`;
      const { data: generatedInvoiceNumber } = await sb.rpc("generate_invoice_number", {
        p_date: todayIST(),
      });

      if (typeof generatedInvoiceNumber === "string" && generatedInvoiceNumber.trim()) {
        adjustmentInvoiceNumber = generatedInvoiceNumber;
      }

      const adjustmentStatus = proratedDelta < 0 ? "Credit" : "Pending";
      const { data: adjustmentInvoice, error: invoiceError } = await sb
        .from("invoices")
        .insert({
          subscription_id: input.subId,
          customer_id: subRow.customer_id,
          invoice_number: adjustmentInvoiceNumber,
          amount: proratedDelta,
          recognized_revenue: proratedDelta,
          payment_status: adjustmentStatus,
          amount_paid: 0,
          billing_period_start: todayIST(),
          billing_period_end: todayIST(),
          invoice_date: todayIST(),
          invoice_type: "adjustment",
          related_invoice_id: latestInvoice.id,
          adjustment_reason: "Mid-cycle plan change proration",
          adjustment_meta: {
            previousInvoiceNumber: latestInvoice.invoice_number,
            templateId: input.templateId,
            mealTypeId: input.mealTypeId,
            deliveredCount,
            existingRemainingValue,
            newRemainingValue,
          },
        })
        .select("id")
        .single();

      if (invoiceError) {
        return { error: invoiceError.message };
      }

      adjustmentInvoiceId = adjustmentInvoice.id;

      if (shouldQueueAutomatedMessages()) {
        await queueMessage({
          subscriptionId: input.subId,
          customerId: subRow.customer_id,
          eventType: "bill_generated",
          vars: {
            amount: Math.abs(proratedDelta).toFixed(0),
            invoiceNumber: adjustmentInvoiceNumber,
            period: "plan adjustment",
          },
          referenceKey: `plan-adjustment:${input.subId}:${adjustmentInvoiceNumber}`,
          metadata: {
            invoiceId: adjustmentInvoiceId,
            type: "plan-adjustment",
            delta: proratedDelta,
          },
        });
      } else if (whatsappAutomationShadowEnabled) {
        await logShadowMismatch("SHADOW_MESSAGE_ENQUEUE", {
          feature: "plan-adjustment-bill",
          subscriptionId: input.subId,
          customerId: subRow.customer_id,
          invoiceId: adjustmentInvoiceId,
          invoiceNumber: adjustmentInvoiceNumber,
        });
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
        proratedDelta,
        adjustmentInvoiceId,
        mode: prorationWriteEnabled ? "proration-v2" : "legacy",
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

export async function updateSubscriptionWeekdaySkips(subId: number, skipWeekdays: number[]) {
  try {
    const sb = getSupabaseAdmin();
    const normalizedWeekdays = normalizeSkipWeekdays(skipWeekdays);

    const { data: subRow, error: subError } = await sb
      .from("subscriptions")
      .select("id, status")
      .eq("id", subId)
      .maybeSingle();

    if (subError || !subRow) {
      return { error: subError?.message ?? "Subscription not found." };
    }

    if (!["Active", "Grace"].includes(subRow.status ?? "")) {
      return { error: "Only active or grace subscriptions can have weekday rules updated." };
    }

    const { error: updateError } = await sb
      .from("subscriptions")
      .update({
        skip_weekdays: normalizedWeekdays,
        skip_saturday: normalizedWeekdays.includes(6),
      })
      .eq("id", subId);

    if (updateError) {
      return { error: updateError.message };
    }

    await insertSystemLog(
      "SUBSCRIPTION_SKIP_WEEKDAYS_UPDATED",
      JSON.stringify({
        subscriptionId: subId,
        skipWeekdays: normalizedWeekdays,
      })
    );

    revalidateOperationalViews();
    return { data: { skipWeekdays: normalizedWeekdays } };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function getSubscriptionDeliverySummary(subId: number) {
  try {
    const sb = getSupabaseAdmin();
    const today = todayIST();

    const { data: subscription, error: subscriptionError } = await sb
      .from("subscriptions")
      .select("id, customer_id, status, start_date, pause_start, pause_end, remaining_tiffins, total_tiffins, skip_saturday, skip_weekdays, holiday_opt_out")
      .eq("id", subId)
      .maybeSingle();

    if (subscriptionError || !subscription) {
      return { error: subscriptionError?.message ?? "Subscription not found." };
    }

    const [
      { count: deliveryCount, error: countError },
      { data: latestDelivery, error: latestError },
      { data: todayDelivery, error: todayError },
    ] =
      await Promise.all([
        sb
          .from("deliveries")
          .select("id", { count: "exact", head: true })
          .eq("subscription_id", subId),
        sb
          .from("deliveries")
          .select("delivery_date")
          .eq("subscription_id", subId)
          .in("status", ["delivered", "confirmed"])
          .eq("billable", true)
          .order("delivery_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        sb
          .from("deliveries")
          .select("status, billable, fault_type")
          .eq("subscription_id", subId)
          .eq("delivery_date", today)
          .limit(1)
          .maybeSingle(),
      ]);

    if (countError || latestError || todayError) {
      return {
        error: countError?.message ?? latestError?.message ?? todayError?.message ?? "Unable to load delivery history.",
      };
    }

    const blockedReason = getDeliveryBlockedReason(subscription, today);
    const nextEligibleDate = getNextEligibleDeliveryDate(subscription, today);

    return {
      data: {
        customerId: subscription.customer_id,
        subscriptionId: subscription.id,
        pauseStart: subscription.pause_start,
        pauseEnd: subscription.pause_end,
        isPausedToday: matchesPauseWindow(today, subscription.pause_start, subscription.pause_end),
        skipWeekdays: normalizeSkipWeekdays(subscription.skip_weekdays ?? (subscription.skip_saturday ? [6] : [])),
        deliveryCount: deliveryCount ?? 0,
        lastDeliveryDate: latestDelivery?.delivery_date ?? null,
        blockedReason,
        nextEligibleDate,
        isEligibleToday: blockedReason == null,
        todayDeliveryStatus: todayDelivery?.status ?? null,
        todayDeliveryBillable: todayDelivery?.billable ?? null,
        todayFaultType: todayDelivery?.fault_type ?? null,
        holidayOptOut: Boolean(subscription.holiday_opt_out),
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
        .in("status", ["delivered", "confirmed"])
        .eq("billable", true)
        .gte("delivery_date", start)
        .lt("delivery_date", endExclusive),
      sb
        .from("deliveries")
        .select("id", { count: "exact", head: true })
        .eq("delivery_date", today)
        .in("status", ["delivered", "confirmed"])
        .eq("billable", true),
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
      lunchVeg: input.lunchVeg.trim(),
      lunchNonVeg: input.lunchNonVeg.trim(),
      dinnerVeg: input.dinnerVeg.trim(),
      dinnerNonVeg: input.dinnerNonVeg.trim(),
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

      const deliveryDates = enumerateDeliveryDates(demo.startDate, demo.delivered);
      const deliveryResults = await Promise.all(
        deliveryDates.map((targetDate) =>
          sb.rpc("manual_adjust_delivery", {
            p_sub_id: subscriptionId,
            p_target_date: targetDate,
            p_action: "DEDUCT",
            p_reason: "Demo seed",
          })
        )
      );

      for (const { error: deliveryError } of deliveryResults) {
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
      lunchVeg: "Phulka, jeera rice, paneer bhurji, dal tadka",
      lunchNonVeg: "Phulka, jeera rice, egg curry, dal tadka",
      dinnerVeg: "Roti, mix veg, dal makhani",
      dinnerNonVeg: "Roti, chicken curry, dal makhani",
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

// ============================================================================
// Migrated from operational.ts
// ============================================================================

export async function getKOTForDate(targetDate: string) {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb.rpc("get_kot_for_date", {
    p_target_date: targetDate,
  });

  if (error) {
    return { error: error.message, data: [] };
  }

  return { data: data ?? [] };
}

export async function skipDeliveryDays(subscriptionId: number, daysToSkip: number) {
  const sb = getSupabaseAdmin();

  // "Tomorrow" in local or UTC? We'll use simple Date math
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pauseStart = tomorrow.toISOString().split("T")[0];

  const end = new Date(tomorrow);
  end.setDate(end.getDate() + daysToSkip);
  const pauseEnd = end.toISOString().split("T")[0];

  const { error: updateError } = await sb
    .from("subscriptions")
    .update({
      pause_start: pauseStart,
      pause_end: pauseEnd,
    })
    .eq("id", subscriptionId);

  if (updateError) {
    return { error: updateError.message };
  }

  // Log the action
  const { error: logError } = await sb.from("system_logs").insert([
    {
      action_type: "SUBSCRIPTION_PAUSED",
      description: "Subscription paused",
      actor: "system",
    },
  ]);

  if (logError) {
    console.error("Failed to log pause action:", logError.message);
  }

  return { success: true };
}

export async function processDailyDeliveries(targetDate: string) {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb.rpc("mark_today_delivered", {
    p_target_date: targetDate,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true, count: data };
}

export async function quickRenewSubscription(subId: number) {
  try {
    const sb = getSupabaseAdmin();

    const { data: sub, error: subError } = await sb
      .from("subscriptions")
      .select("plan_id")
      .eq("id", subId)
      .single();

    if (subError || !sub) {
      return { error: "Failed to find the original subscription details." };
    }

    const { data, error } = await sb.rpc("renew_subscription", {
      p_old_sub_id: subId,
      p_plan_id: sub.plan_id,
      p_start_date: todayIST(),
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

export async function hardDeleteSubscription(subId: number) {
  try {
    const sb = getSupabaseAdmin();

    const { error } = await sb.rpc("hard_delete_subscription", {
      p_sub_id: subId,
    });

    if (error) {
      return { error: error.message };
    }

    revalidateOperationalViews();
    return { success: true };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function getCustomerInvoices(customerId: number) {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("invoices")
      .select("id, invoice_number, amount, amount_paid, payment_status, invoice_date")
      .eq("customer_id", customerId)
      .order("invoice_date", { ascending: false });

    if (error) return { error: error.message };
    return { data };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function updateInvoicePayment(invoiceId: number, amountPaid: number) {
  try {
    const sb = getSupabaseAdmin();
    
    // Fetch the invoice first to determine status based on amountPaid vs total amount
    const { data: inv, error: fetchErr } = await sb.from("invoices").select("amount").eq("id", invoiceId).single();
    if (fetchErr || !inv) return { error: "Invoice not found." };
    
    let status = "Pending";
    if (amountPaid >= inv.amount) status = "Paid";
    else if (amountPaid > 0) status = "Partial";
    
    const { error } = await sb.from("invoices").update({
      amount_paid: amountPaid,
      payment_status: status
    }).eq("id", invoiceId);

    if (error) return { error: error.message };
    revalidateOperationalViews();
    return { success: true };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
