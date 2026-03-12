const IST_TZ = "Asia/Kolkata";
const DATE_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const DISPLAY_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function getIstDateParts(date: Date = new Date()) {
  const parts = DATE_PARTS_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Unable to format an IST date.");
  }

  return { year, month, day };
}

export function todayIST(): string {
  const { year, month, day } = getIstDateParts();
  return `${year}-${month}-${day}`;
}

export function currentMonthIST(): string {
  const { year, month } = getIstDateParts();
  return `${year}-${month}`;
}

export function formatDateIST(dateStr: string | null): string {
  if (!dateStr) {
    return "--";
  }

  return DISPLAY_DATE_FORMATTER.format(new Date(`${dateStr}T00:00:00+05:30`));
}

export function formatTimestampIST(ts: string | null): string {
  if (!ts) {
    return "--";
  }

  return DISPLAY_TIMESTAMP_FORMATTER.format(new Date(ts));
}

export function formatINR(amount: number | null): string {
  if (amount == null) {
    return INR_FORMATTER.format(0);
  }

  return INR_FORMATTER.format(amount);
}

/** Returns the current hour in IST (0-23). Useful for midday cutoff checks. */
export function currentISTHour(): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TZ,
    hour: "numeric",
    hour12: false,
  });
  return Number.parseInt(formatter.format(new Date()), 10);
}

/** Returns current IST minute (0-59). */
export function currentISTMinute(): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TZ,
    minute: "numeric",
  });
  return Number.parseInt(formatter.format(new Date()), 10);
}

/** Kitchen cutoff: 10:30 AM IST. Returns true if current time is past cutoff. */
export function isPastKitchenCutoff(): boolean {
  const hour = currentISTHour();
  const minute = currentISTMinute();
  return hour > 10 || (hour === 10 && minute >= 30);
}

/** Returns tomorrow's date in IST as YYYY-MM-DD. */
export function tomorrowIST(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const { year, month, day } = getIstDateParts(date);
  return `${year}-${month}-${day}`;
}

/** Returns day of week for an ISO date (0=Sunday, 6=Saturday). */
export function dayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00+05:30`).getDay();
}
