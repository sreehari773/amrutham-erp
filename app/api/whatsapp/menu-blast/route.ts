import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { todayIST } from "@/lib/utils";

export const dynamic = "force-dynamic";

// To be configured by User in .env or deployment platform
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

/**
 * Automates sending today's menu to all ACTIVE customers with valid phone numbers.
 * Typically called via a Cron Job (e.g. Vercel Cron at 8:00 AM IST)
 */
export async function POST() {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    return NextResponse.json({ error: "WhatsApp API keys not configured." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const today = todayIST();

  try {
    // 1. Fetch Today's Menu
    const { data: menu, error: menuErr } = await sb.from("weekly_menus").select("*").eq("day_of_week", today).single();
    if (menuErr || !menu) return NextResponse.json({ error: "No menu set for today." }, { status: 400 });

    // 2. Fetch Active Deliveries/Subscriptions
    // We fetch everyone active to send them their respective menu (Veg/Non-Veg)
    const { data: subs, error: subErr } = await sb
      .from("subscriptions")
      .select("customer_id, meal_preference, customers(name, phone)")
      .eq("status", "Active");

    if (subErr || !subs) return NextResponse.json({ error: subErr?.message }, { status: 500 });

    let sentCount = 0;

    for (const sub of subs) {
      const phone = (sub.customers as any)?.phone;
      const name = (sub.customers as any)?.name;
      if (!phone) continue;

      const cleanPhone = phone.replace(/\D/g, "");
      const intlPhone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;

      let menuDescription = menu.veg_description;
      if (sub.meal_preference === "non_veg") {
        menuDescription = menu.non_veg_description;
      }
      // Mixed can get custom logic based on the day. Let's send Veg by default unless it's Wed/Fri/Sun.

      const messageContent = `Hello ${name}! 🍽️\nToday's Amrutham Menu:\n\n${menuDescription}\n\nHave a great meal!`;

      // 3. Send via Meta API
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
      }
    }

    return NextResponse.json({ success: true, customers_messaged: sentCount });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
