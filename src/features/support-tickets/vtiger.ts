/**
 * VTiger support tickets, fetched through the `vtiger-tickets` Supabase Edge Function (see supabase/functions).
 * The VTiger URL / username / access key stay in Supabase secrets; nothing here touches the app's saved data store.
 */
export interface Ticket {
  id: string;
  ticketNo: string;
  title: string;
  status: string;
  priority: string;
  severity: string;
  category: string;
  assignee: string;
  createdTime: string;
  modifiedTime: string;
  hoursToResolve: number | null;
}

export interface TicketFeed {
  fetchedAt: string;
  baseUrl?: string;
  tickets: Ticket[];
  demo?: boolean;
}

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const CLOSED_STATUSES = ["closed", "resolved", "cancelled", "rejected"];
export const isClosed = (t: Pick<Ticket, "status">) => CLOSED_STATUSES.includes(t.status.toLowerCase());

export async function fetchTickets(): Promise<TicketFeed> {
  if (!BASE || !KEY) throw new Error("Supabase is not configured for this deployment.");
  let res: Response;
  try {
    res = await fetch(`${BASE}/functions/v1/vtiger-tickets`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: "no-store", signal: AbortSignal.timeout(60000) });
  } catch {
    throw new Error("The VTiger function did not respond in time. Check its Logs in Supabase and the VTIGER_URL secret.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `VTiger proxy failed (${res.status})`);
  return body as TicketFeed;
}

/** Deterministic sample data so the dashboard can be previewed before the VTiger proxy is deployed. */
export function sampleTickets(): TicketFeed {
  const statuses = ["Open", "In Progress", "Wait For Response", "Closed", "Closed", "Closed"];
  const priorities = ["Low", "Normal", "High", "Urgent"];
  const cats = ["Big Problem", "Small Problem", "Other Problem"];
  const people = ["Asha Rao", "Vikram Shah", "Neha Gupta", "Rohan Das"];
  const now = Date.now();
  const tickets: Ticket[] = Array.from({ length: 140 }, (_, i) => {
    const age = (i * 37) % 90;
    const created = new Date(now - age * 864e5 - i * 36e5);
    return {
      id: `17x${i + 1}`,
      ticketNo: `TT${i + 1}`,
      title: `Sample ticket ${i + 1}`,
      status: statuses[(i * 7) % statuses.length],
      priority: priorities[(i * 5) % priorities.length],
      severity: "Minor",
      category: cats[i % cats.length],
      assignee: people[(i * 3) % people.length],
      createdTime: created.toISOString(),
      modifiedTime: new Date(created.getTime() + 864e5).toISOString(),
      hoursToResolve: null,
    };
  });
  return { fetchedAt: new Date().toISOString(), tickets, demo: true };
}
