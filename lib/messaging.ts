/** WhatsApp messaging templates and URL builder for Amrutham. */

export type MessageTemplate =
  | "delivery_confirm"
  | "delivery_receipt"
  | "bill_generated"
  | "delivery_issue"
  | "holiday_skip_notice"
  | "low_balance"
  | "renewal_reminder"
  | "grace_meal"
  | "pause_engagement"
  | "renewal_success";

const TEMPLATES: Record<MessageTemplate, (vars: Record<string, string>) => string> = {
  delivery_confirm: () =>
    "Your Amrutham meal has been delivered today. Enjoy your meal!",
  delivery_receipt: (v) =>
    `Hi ${v.name ?? "there"}, your Amrutham delivery for ${v.date ?? "today"} has been recorded successfully.`,
  bill_generated: (v) =>
    `Hi ${v.name ?? "there"}, your Amrutham bill ${v.invoiceNumber ?? ""} for ${v.period ?? "the selected period"} is ready. Total due: ${v.amount ?? "0"}.`,
  delivery_issue: (v) =>
    `Hi ${v.name ?? "there"}, we recorded a service issue for ${v.date ?? "today"} and no meal credit was deducted. Reason: ${v.reason ?? "Kitchen-side miss"}.`,
  holiday_skip_notice: (v) =>
    `Hi ${v.name ?? "there"}, Amrutham service is paused on ${v.date ?? "the selected date"} due to ${v.reason ?? "a holiday"}. Your remaining meals stay intact.`,
  low_balance: (v) =>
    `Hi ${v.name ?? "there"}, you have only ${v.remaining ?? "2"} meals remaining on your Amrutham subscription. Renew now to continue enjoying your meals without interruption!`,
  renewal_reminder: (v) =>
    `Hi ${v.name ?? "there"}, you have just 1 meal left on your Amrutham subscription. Please renew today so there's no gap in your daily meals!`,
  grace_meal: (v) =>
    `Hi ${v.name ?? "there"}, today's meal is complimentary from Amrutham! Your subscription credits have ended. Renew now to continue your daily meals.`,
  pause_engagement: (v) =>
    `Hi ${v.name ?? "there"}, we noticed your Amrutham meals have been paused. We miss serving you! Resume anytime and your remaining meals will be waiting.`,
  renewal_success: (v) =>
    `Hi ${v.name ?? "there"}, your Amrutham subscription has been renewed successfully! ${v.tiffins ?? ""} meals are ready for you. Thank you for continuing with us!`,
};

export function buildMessageText(
  template: MessageTemplate,
  vars: Record<string, string> = {},
): string {
  return TEMPLATES[template](vars);
}

export function buildWhatsAppUrl(
  phone: string,
  template: MessageTemplate,
  vars: Record<string, string> = {},
): string {
  const cleanPhone = phone.replace(/\D/g, "");
  const intlPhone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;
  const text = encodeURIComponent(buildMessageText(template, vars));
  return `https://wa.me/${intlPhone}?text=${text}`;
}
