/**
 * UI/session state for the demo: current persona, global date range,
 * sidebar state. Persisted per browser (convenience only).
 */
import type { DateRange } from "@/types";
import type { DatePreset } from "@/lib/utils/dates";

export interface UiState {
  /** Who is viewing (a Super Admin can "view as" another user). */
  currentUserId: string;
  /** Who is signed in; null = signed out. */
  signedInUserId: string | null;
  datePreset: DatePreset;
  customRange: DateRange | null;
  sidebarCollapsed: boolean;
}

const STORAGE_KEY = "org360:ui";
const isBrowser = typeof window !== "undefined";

export const DEFAULT_UI_STATE: UiState = {
  currentUserId: "USR-02",
  signedInUserId: null,
  datePreset: "last_30",
  customRange: null,
  sidebarCollapsed: false,
};

let state: UiState | null = null;
const listeners = new Set<() => void>();

function load(): UiState {
  if (!isBrowser) return DEFAULT_UI_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_UI_STATE, ...(JSON.parse(raw) as Partial<UiState>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_UI_STATE;
}

export function getUiState(): UiState {
  if (!state) state = load();
  return state;
}

export function getUiServerSnapshot(): UiState {
  return DEFAULT_UI_STATE;
}

export function subscribeUi(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setUiState(patch: Partial<UiState>): void {
  state = { ...getUiState(), ...patch };
  if (isBrowser) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }
  for (const l of listeners) l();
}
