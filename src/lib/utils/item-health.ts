/**
 * Health and score of one tracked item (e.g. a design), from its ETA, its KPI values and its history.
 * Pure: the caller passes today's date.
 *
 *   Schedule      40  on time vs ETA (finished items: completed on / before ETA)
 *   KPIs          40  share of KPI targets met
 *   Track record  20  ETA push-outs and blocked spells in the history
 */
import type { ItemEvent, ProcessKpi, TrackedItem } from "@/types";
import { daysBetween } from "@/lib/utils/dates";

export type ItemHealth = "done" | "on_track" | "at_risk" | "off_track";

export interface ScoreFactor {
  key: "schedule" | "kpis" | "history";
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface ItemScore {
  score: number;
  health: ItemHealth;
  factors: ScoreFactor[];
  /** Days past ETA (open items) or days it finished late; 0 when on time. */
  lateDays: number;
}

/** Did `raw` reach the KPI target? null when there is no target or no value to judge. */
export function kpiMet(k: ProcessKpi, raw: string | undefined): boolean | null {
  if (!k.target || raw === undefined || raw === "") return null;
  if (k.type === "number" || k.type === "percent") return Number(raw) >= Number(k.target);
  if (k.type === "yes_no") return raw === k.target;
  return null;
}

/** 0..1 progress towards the target (partial credit for numbers). */
function kpiProgress(k: ProcessKpi, raw: string | undefined): number {
  const met = kpiMet(k, raw);
  if (met === null) return 0;
  if (met) return 1;
  if ((k.type === "number" || k.type === "percent") && Number(k.target) > 0) return Math.max(0, Math.min(1, Number(raw) / Number(k.target))) * 0.8;
  return 0;
}

export function completedOn(item: TrackedItem): string | null {
  if (item.status !== "done") return null;
  const ev = [...(item.history ?? [])].reverse().find((e) => e.kind === "status" && e.to === "done");
  return (ev?.at ?? item.updatedAt).slice(0, 10);
}

const countEvents = (h: ItemEvent[], f: (e: ItemEvent) => boolean) => h.filter(f).length;

export function scoreItem(item: TrackedItem, kpis: ProcessKpi[], today: string): ItemScore {
  const history = item.history ?? [];
  const done = item.status === "done";

  /* schedule */
  let schedule = 30;
  let scheduleDetail = "No ETA set";
  let lateDays = 0;
  if (item.eta) {
    if (done) {
      const finished = completedOn(item) ?? today;
      lateDays = Math.max(0, daysBetween(item.eta, finished));
      schedule = Math.max(0, 40 - lateDays * 5);
      scheduleDetail = lateDays ? `Finished ${lateDays} day${lateDays === 1 ? "" : "s"} after the ETA` : "Finished on or before the ETA";
    } else {
      const d = daysBetween(today, item.eta);
      if (d < 0) {
        lateDays = -d;
        schedule = Math.max(0, 20 + d * 4);
        scheduleDetail = `${lateDays} day${lateDays === 1 ? "" : "s"} past the ETA`;
      } else {
        schedule = d >= 3 ? 40 : 32;
        scheduleDetail = d === 0 ? "ETA is today" : `${d} day${d === 1 ? "" : "s"} to the ETA`;
      }
    }
  }

  /* KPIs: an unfilled target only counts against the item once work has started */
  const targeted = kpis.filter((k) => k.target);
  const judged = targeted.filter((k) => item.values[k.id] !== undefined || item.status !== "not_started");
  let kpiPoints = 30;
  let kpiDetail = targeted.length ? "Nothing to judge yet" : "No KPI targets defined";
  if (judged.length) {
    const sum = judged.reduce((s, k) => s + kpiProgress(k, item.values[k.id]), 0);
    kpiPoints = Math.round((40 * sum) / judged.length);
    const met = judged.filter((k) => kpiMet(k, item.values[k.id]) === true).length;
    const empty = judged.filter((k) => (item.values[k.id] ?? "") === "").length;
    kpiDetail = `${met} of ${judged.length} target${judged.length === 1 ? "" : "s"} met${empty ? `, ${empty} not filled` : ""}`;
  }

  /* track record */
  const pushes = countEvents(history, (e) => e.kind === "eta" && !!e.from && !!e.to && e.to > e.from);
  const blocks = countEvents(history, (e) => e.kind === "status" && e.to === "blocked");
  const blockedNow = item.status === "blocked" ? 5 : 0;
  const record = Math.max(0, 20 - pushes * 5 - blocks * 5 - blockedNow);
  const parts = [pushes ? `ETA moved out ${pushes}×` : "", blocks ? `blocked ${blocks}×` : "", blockedNow ? "blocked now" : ""].filter(Boolean);

  const factors: ScoreFactor[] = [
    { key: "schedule", label: "Schedule (ETA)", points: schedule, max: 40, detail: scheduleDetail },
    { key: "kpis", label: "KPIs", points: kpiPoints, max: 40, detail: kpiDetail },
    { key: "history", label: "Track record", points: record, max: 20, detail: parts.length ? parts.join(", ") : "Clean history" },
  ];
  const score = factors.reduce((s, f) => s + f.points, 0);
  const health: ItemHealth = done ? "done" : lateDays > 0 ? "off_track" : score >= 75 ? "on_track" : score >= 50 ? "at_risk" : "off_track";
  return { score, health, factors, lateDays };
}

export const HEALTH_LABEL: Record<ItemHealth, string> = { done: "Done", on_track: "On track", at_risk: "At risk", off_track: "Off track" };
export const HEALTH_TONE: Record<ItemHealth, "success" | "info" | "warning" | "danger"> = { done: "success", on_track: "info", at_risk: "warning", off_track: "danger" };
