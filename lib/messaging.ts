/** WhatsApp messaging templates and URL builder for Amrutham. */

export type MessageTemplate =
  | "delivery_confirm"
  | "low_balance"
  | "renewal_reminder"
  | "grace_meal"
  | "pause_engagement"
  | "renewal_success";

const TEMPLATES: Record<MessageTemplate, (vars: Record<string, string>) => string> = {
  delivery_confirm: () =>
    "Your Amrutham meal has been delivered today. Enjoy your meal!",
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
