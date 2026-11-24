/**
 * Repository facade — the single data-access surface for the UI.
 *
 * Today: backed by the in-memory mock store (lib/store/mock-db).
 * Later: re-implement these same functions with the Supabase client.
 * Reads used for live rendering go through hooks/use-data.ts, which
 * subscribe to the store; with Supabase those hooks switch to queries.
 */
import type { AnalyticsFilter, DataScope } from "@/types";
import { getDashboardMetrics as computeDashboardMetrics } from "@/lib/calculations/dashboard";
import { getDb, TODAY } from "@/lib/store/mock-db";
import { latency } from "./core";

export * from "./employees";
export * from "./organization";
export * from "./processes";
export * from "./assignments";
export * from "./compliance";
export * from "./admin";
export * from "./bulk-delete";
export * from "./bulk-create";
export { RepositoryError } from "./core";

export async function getDashboardMetrics(filter: AnalyticsFilter, scope: DataScope | null = null) {
  await latency(80);
  return computeDashboardMetrics(getDb(), filter, scope, TODAY);
}
export * from "./auth";
export * from "./process-tracking";
export * from "./ecosystem";
