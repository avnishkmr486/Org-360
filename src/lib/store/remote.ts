/**
 * Shared storage in Supabase. The whole demo state is kept as one JSON row (table org360_state, id "main"), so every
 * browser and every deployment that points at the same project sees the same data. Uses the REST API directly — the
 * publishable (anon) key is safe to ship in the browser; access is governed by the table's row-level-security policies.
 * Without NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY the app simply stays browser-local.
 */
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ROW = "main";

export const remoteEnabled = Boolean(URL_BASE && KEY);

const headers = () => ({ apikey: KEY!, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

/** The saved state, null when nothing has been saved yet. Throws when Supabase can't be reached. */
export async function pullState<T>(): Promise<T | null> {
  const res = await fetch(`${URL_BASE}/rest/v1/org360_state?id=eq.${ROW}&select=data`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Supabase read failed (${res.status})`);
  const rows = (await res.json()) as { data: T }[];
  return rows[0]?.data ?? null;
}

export async function pushState(data: unknown): Promise<void> {
  const res = await fetch(`${URL_BASE}/rest/v1/org360_state?on_conflict=id`, {
    method: "POST",
    headers: { ...headers(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: ROW, data, updated_at: new Date().toISOString() }),
    keepalive: false,
  });
  if (!res.ok) throw new Error(`Supabase save failed (${res.status})`);
}
