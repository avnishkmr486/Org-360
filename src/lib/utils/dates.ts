import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfQuarter,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import type { DateRange, ISODate } from "@/types";

export const ISO_DATE = "yyyy-MM-dd";

export function toISODate(date: Date): ISODate {
  return format(date, ISO_DATE);
}

export function fromISODate(value: ISODate): Date {
  return parseISO(value);
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function addDaysISO(value: ISODate, days: number): ISODate {
  return toISODate(addDays(parseISO(value), days));
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

export function isWithin(value: ISODate, range: DateRange): boolean {
  return value >= range.from && value <= range.to;
}

export function formatDate(value: string | null | undefined, pattern = "dd MMM yyyy"): string {
  if (!value) return "—";
  const d = parseISO(value);
  return isValid(d) ? format(d, pattern) : "—";
}

export function formatDateTime(value: string | null | undefined): string {
  return formatDate(value, "dd MMM yyyy, hh:mm a");
}

export function formatRelative(value: string, now = new Date()): string {
  const d = parseISO(value);
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return format(d, "dd MMM yyyy");
}

export type DatePreset =
  | "last_7"
  | "last_30"
  | "this_month"
  | "last_month"
  | "last_90"
  | "this_quarter"
  | "last_6m"
  | "ytd"
  | "custom";

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  last_7: "Last 7 days",
  last_30: "Last 30 days",
  this_month: "Month to date",
  last_month: "Last month",
  last_90: "Last 90 days",
  this_quarter: "Quarter to date",
  last_6m: "Last 6 months",
  ytd: "Year to date",
  custom: "Custom range",
};

export function resolvePreset(preset: DatePreset, today: ISODate, custom?: DateRange | null): DateRange {
  const t = parseISO(today);
  switch (preset) {
    case "last_7":
      return { from: toISODate(subDays(t, 6)), to: today };
    case "last_30":
      return { from: toISODate(subDays(t, 29)), to: today };
    case "this_month":
      return { from: toISODate(startOfMonth(t)), to: today };
    case "last_month": {
      const lm = subMonths(t, 1);
      return { from: toISODate(startOfMonth(lm)), to: toISODate(endOfMonth(lm)) };
    }
    case "last_90":
      return { from: toISODate(subDays(t, 89)), to: today };
    case "this_quarter":
      return { from: toISODate(startOfQuarter(t)), to: today };
    case "last_6m":
      return { from: toISODate(subMonths(t, 6)), to: today };
    case "ytd":
      return { from: toISODate(startOfYear(t)), to: today };
    case "custom":
      return custom ?? { from: toISODate(subDays(t, 29)), to: today };
  }
}

/** The equal-length period immediately before `range` — for date comparisons. */
export function previousPeriod(range: DateRange): DateRange {
  const len = daysBetween(range.from, range.to) + 1;
  const to = addDaysISO(range.from, -1);
  return { from: addDaysISO(to, -(len - 1)), to };
}

export function formatRange(range: DateRange): string {
  return `${formatDate(range.from, "dd MMM")} – ${formatDate(range.to, "dd MMM yyyy")}`;
}

/** Month buckets (inclusive) ending at the month containing `end`. */
export function monthBuckets(end: ISODate, count: number): { key: string; label: string; range: DateRange }[] {
  const e = parseISO(end);
  const out: { key: string; label: string; range: DateRange }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = subMonths(e, i);
    out.push({
      key: format(m, "yyyy-MM"),
      label: format(m, "MMM yy"),
      range: { from: toISODate(startOfMonth(m)), to: toISODate(endOfMonth(m)) },
    });
  }
  return out;
}

export { endOfQuarter, startOfQuarter };
