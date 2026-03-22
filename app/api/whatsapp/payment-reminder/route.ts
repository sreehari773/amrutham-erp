import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

/**
 * Automates sending payment reminders to customers near expiry (<= 3 tiffins).
 * Typically called via a Cron Job
 */
export async function POST() {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    return NextResponse.json({ error: "WhatsApp API keys not configured." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  try {
    // 1. Fetch Subscriptions nearing Expiry
    const { data: subs, error: subErr } = await sb
      .from("subscriptions")
      .select("id, remaining_tiffins, customers(name, phone)")
      .eq("status", "Active")
      .lte("remaining_tiffins", 3);

    if (subErr || !subs) return NextResponse.json({ error: subErr?.message }, { status: 500 });

    let sentCount = 0;

    for (const sub of subs) {
      const phone = (sub.customers as any)?.phone;
      const name = (sub.customers as any)?.name;
      if (!phone) continue;

      const cleanPhone = phone.replace(/\D/g, "");
      const intlPhone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;

      const messageContent = `Hi ${name}, your Amrutham tiffin subscription has ${sub.remaining_tiffins} meal(s) left. Please renew soon to continue uninterrupted service! Provide this message to confirm. Fast-track renewal link: [YOUR_LINK_HERE]`;

      const metaUrl = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
      
      const res = await fetch(metaUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: intlPhone,
          type: "text",
          text: { body: messageContent },
        }),
      });

      if (res.ok) {
        sentCount++;
        // Optional: Update last_reminded_at
        await sb.from("subscriptions").update({ last_reminded_at: new Date().toISOString() }).eq("id", sub.id);
      }
    }

    return NextResponse.json({ success: true, reminders_sent: sentCount });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
