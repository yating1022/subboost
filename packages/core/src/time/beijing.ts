const BEIJING_TIME_ZONE = "Asia/Shanghai";
const DEFAULT_LOCALE = "zh-CN";
const DATE_KEY_LOCALE = "en-CA";
const DAY_MS = 24 * 60 * 60 * 1000;

export type DateInput = Date | string | number | null | undefined;

function toValidDate(value: DateInput): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

export function getBeijingTimeZone(): string {
  return BEIJING_TIME_ZONE;
}

export function formatInBeijing(
  value: DateInput,
  options: Intl.DateTimeFormatOptions,
  fallback = "-"
): string {
  const date = toValidDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: BEIJING_TIME_ZONE,
    ...options,
  }).format(date);
}

export function formatDateTimeInBeijing(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {},
  fallback = "-"
): string {
  return formatInBeijing(
    value,
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      ...options,
    },
    fallback
  );
}

export function formatDateInBeijing(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {},
  fallback = "-"
): string {
  return formatInBeijing(
    value,
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...options,
    },
    fallback
  );
}

export function formatTimeInBeijing(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {},
  fallback = "-"
): string {
  return formatInBeijing(
    value,
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...options,
    },
    fallback
  );
}

export function getDateKeyInBeijing(date: Date = new Date(), timeZone: string = BEIJING_TIME_ZONE): string {
  return new Intl.DateTimeFormat(DATE_KEY_LOCALE, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getCompactDateStampInBeijing(date: Date = new Date()): string {
  return getDateKeyInBeijing(date).replace(/-/g, "");
}

export function parseDateKey(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function getTimeZoneOffsetMs(date: Date, timeZone: string = BEIJING_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type === "literal") continue;
    values[part.type] = part.value;
  }

  const localAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return localAsUtc - date.getTime();
}

export function getUtcMsForZonedDayStart(dateKey: string, timeZone: string = BEIJING_TIME_ZONE): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const localAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offset1 = getTimeZoneOffsetMs(new Date(localAsUtc), timeZone);
  let utc = localAsUtc - offset1;

  const offset2 = getTimeZoneOffsetMs(new Date(utc), timeZone);
  if (offset2 !== offset1) {
    utc = localAsUtc - offset2;
  }

  return utc;
}

export function addDaysToDateKey(dateKey: string, days: number, timeZone: string = BEIJING_TIME_ZONE): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const noonUtc = Date.UTC(year, month - 1, day, 12, 0, 0);

  return getDateKeyInBeijing(new Date(noonUtc + days * DAY_MS), timeZone);
}

export function getDayRangeInBeijing(dateKey: string): { start: Date; endExclusive: Date } {
  const start = new Date(getUtcMsForZonedDayStart(dateKey, BEIJING_TIME_ZONE));
  const nextDateKey = addDaysToDateKey(dateKey, 1, BEIJING_TIME_ZONE);
  const endExclusive = new Date(getUtcMsForZonedDayStart(nextDateKey, BEIJING_TIME_ZONE));

  return { start, endExclusive };
}

export function buildDateRangeFilterInBeijing(params: {
  startDate?: string | null;
  endDate?: string | null;
}): {
  gte?: Date;
  lt?: Date;
} {
  const startKey = parseDateKey(params.startDate);
  const endKey = parseDateKey(params.endDate);
  const filter: { gte?: Date; lt?: Date } = {};

  if (startKey) {
    filter.gte = getDayRangeInBeijing(startKey).start;
  }

  if (endKey) {
    filter.lt = getDayRangeInBeijing(endKey).endExclusive;
  }

  return filter;
}

export function getTodayRangeInBeijing(now: Date = new Date()): {
  dateKey: string;
  start: Date;
  endExclusive: Date;
} {
  const dateKey = getDateKeyInBeijing(now);
  const { start, endExclusive } = getDayRangeInBeijing(dateKey);
  return { dateKey, start, endExclusive };
}
