"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { buildMessageText, type MessageTemplate } from "@/lib/messaging";

export type MessagingEvent = {
  id: number;
  subscription_id: number | null;
  customer_id: number | null;
  event_type: string;
  channel: string;
  message_text: string | null;
  status: string;
  reference_key: string | null;
  metadata: Record<string, unknown>;
  sent_at: string | null;
  created_at: string;
};

export async function queueMessage(input: {
  subscriptionId?: number;
  customerId?: number;
  eventType: MessageTemplate;
  vars?: Record<string, string>;
  referenceKey?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ data?: MessagingEvent; error?: string }> {
  const sb = getSupabaseAdmin();
  const text = buildMessageText(input.eventType, input.vars ?? {});

  if (input.referenceKey) {
    const { data: existing, error: existingError } = await sb
      .from("messaging_events")
      .select("*")
      .eq("event_type", input.eventType)
      .eq("reference_key", input.referenceKey)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return { error: existingError.message };
    }

    if (existing) {
      return { data: existing as MessagingEvent };
    }
  }

  const { data, error } = await sb
    .from("messaging_events")
    .insert({
      subscription_id: input.subscriptionId ?? null,
      customer_id: input.customerId ?? null,
      event_type: input.eventType,
      message_text: text,
      reference_key: input.referenceKey ?? null,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  return { data: data as MessagingEvent };
}

export async function markMessageSent(
  eventId: number,
): Promise<{ error?: string }> {
  const sb = getSupabaseAdmin();

  const { error } = await sb
    .from("messaging_events")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", eventId);

  if (error) {
    return { error: error.message };
  }

  return {};
}

export async function getMessageHistory(
  subscriptionId: number,
): Promise<{ data: MessagingEvent[]; error?: string }> {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("messaging_events")
    .select("*")
    .eq("subscription_id", subscriptionId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as MessagingEvent[] };
}

export async function getRecentMessages(
  limit = 20,
): Promise<{ data: MessagingEvent[]; error?: string }> {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("messaging_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as MessagingEvent[] };
}
