/**
 * VTiger support tickets, fetched through the `vtiger-tickets` Supabase Edge Function (see supabase/functions).
 * The VTiger URL / username / access key stay in Supabase secrets; nothing here touches the app's saved data store.
 */
export interface TicketField {
  label: string;
  value: string;
}

export interface Ticket {
  id: string; // e.g. "17x123"
  num: string; // numeric record id, used for the VTiger link
  ticketNo: string;
  org: string;
  incidentNo: string;
  severity: string;
  internalSeverity: string;
  title: string;
  module: string;
  stage: string;
  internalStatus: string;
  modified: string;
  elapsedHours: number | null;
  assignedTo: string;
  internalCategory: string;
  created: string;
  description: string;
  /** Every VTiger field with its label, for the detail view. */
  all: TicketField[];
}

export interface TicketFeed {
  fetchedAt: string;
  baseUrl?: string;
  tickets: Ticket[];
  truncated?: boolean;
  demo?: boolean;
}

export interface TicketComment {
  id: string;
  text: string;
  author: string;
  createdTime: string;
}

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const CLOSED_STAGES = ["closed", "resolved", "cancelled", "rejected"];
export const isClosed = (t: Pick<Ticket, "stage">) => CLOSED_STAGES.includes(t.stage.toLowerCase());
export const isHigh = (t: Pick<Ticket, "severity">) => ["high", "urgent", "critical"].includes(t.severity.toLowerCase());

async function call<T>(search: URLSearchParams): Promise<T> {
  if (!BASE || !KEY) throw new Error("Supabase is not configured for this deployment.");
  let res: Response;
  try {
    res = await fetch(`${BASE}/functions/v1/vtiger-tickets?${search}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: "no-store", signal: AbortSignal.timeout(90000) });
  } catch {
    throw new Error("The VTiger function did not respond in time. Check its Logs in Supabase and the VTIGER_URL secret.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `VTiger proxy failed (${res.status})`);
  return body as T;
}

interface RawTicket {
  id: string;
  values: Record<string, string>;
}
interface RawFeed {
  fetchedAt: string;
  baseUrl?: string;
  fields: { name: string; label: string }[];
  tickets: RawTicket[];
  truncated?: boolean;
}

/** Normalise raw VTiger fields into the columns of the VTiger "Open Items" list, matching by field label first. */
function normalise(raw: RawFeed): TicketFeed {
  const byLabel = new Map(raw.fields.map((f) => [f.label.trim().toLowerCase(), f.name]));
  const resolve = (labels: string[], names: string[]) => labels.map((l) => byLabel.get(l)).find(Boolean) ?? names.find((n) => raw.fields.some((f) => f.name === n));
  const cols = {
    ticketNo: resolve(["ticket number"], ["ticket_no"]),
    org: resolve(["organization name"], ["parent_id"]),
    incidentNo: resolve(["incident number"], []),
    severity: resolve(["severity"], ["ticketseverities"]),
    internalSeverity: resolve(["internal severity"], []),
    title: resolve(["title", "ticket title"], ["ticket_title"]),
    module: resolve(["module"], []),
    stage: resolve(["stage", "status"], ["ticketstatus"]),
    internalStatus: resolve(["internal status"], []),
    modified: resolve(["modified time"], ["modifiedtime"]),
    elapsed: resolve(["elapsed hours"], ["hours"]),
    assignedTo: resolve(["internal assigned to", "assigned to"], ["assigned_user_id"]),
    internalCategory: resolve(["internal category", "category"], ["ticketcategories"]),
    created: resolve(["created time"], ["createdtime"]),
    description: resolve(["description"], ["description"]),
  };
  const labelOf = new Map(raw.fields.map((f) => [f.name, f.label]));
  const tickets = raw.tickets.map((r): Ticket => {
    const g = (n?: string) => (n ? (r.values[n] ?? "") : "");
    const hours = Number(g(cols.elapsed));
    return {
      id: r.id,
      num: r.id.split("x")[1] ?? r.id,
      ticketNo: g(cols.ticketNo),
      org: g(cols.org),
      incidentNo: g(cols.incidentNo),
      severity: g(cols.severity),
      internalSeverity: g(cols.internalSeverity),
      title: g(cols.title),
      module: g(cols.module),
      stage: g(cols.stage),
      internalStatus: g(cols.internalStatus),
      modified: g(cols.modified),
      elapsedHours: g(cols.elapsed) !== "" && Number.isFinite(hours) ? hours : null,
      assignedTo: g(cols.assignedTo),
      internalCategory: g(cols.internalCategory),
      created: g(cols.created),
      description: g(cols.description),
      all: Object.entries(r.values)
        .filter(([, v]) => v !== "" && v !== "0")
        .map(([name, value]) => ({ label: labelOf.get(name) ?? name, value })),
    };
  });
  return { fetchedAt: raw.fetchedAt, baseUrl: raw.baseUrl, tickets, truncated: raw.truncated };
}

/** Tickets created within the selected date range (inclusive). */
export async function fetchTickets(range: { from: string; to: string }): Promise<TicketFeed> {
  return normalise(await call<RawFeed>(new URLSearchParams({ from: range.from, to: range.to })));
}

export async function fetchComments(ticketId: string): Promise<TicketComment[]> {
  return (await call<{ comments: TicketComment[] }>(new URLSearchParams({ comments: ticketId }))).comments;
}

export const ticketUrl = (baseUrl: string | undefined, t: Ticket) => (baseUrl ? `${baseUrl}/index.php?module=HelpDesk&view=Detail&record=${t.num}` : null);

/** Deterministic sample data so the dashboard can be previewed before the VTiger proxy is deployed. */
export function sampleTickets(range: { from: string; to: string }): TicketFeed {
  const stages = ["Open", "In Progress", "Wait For Response", "Closed", "Closed"];
  const sev = ["Low", "Medium", "High"];
  const orgs = ["Mellow Mushroom Corporate", "McDonalds CORPORATE", "Chipotle Mexican Grill CORPORATE", "Denny's Inc CORPORATE"];
  const modules = ["Reporting", "Human Resource", "Cash & Sales", "Inventory"];
  const people = ["L1 - Rishabh / Arhant", "L2 - CB", "L2 - Rohit", "L1 - Arhant / Vishwas"];
  const from = new Date(range.from).getTime();
  const span = Math.max(1, new Date(range.to).getTime() - from);
  const tickets: Ticket[] = Array.from({ length: 60 }, (_, i) => {
    const created = new Date(from + ((i * 7919) % 1000) * (span / 1000));
    const modified = new Date(Math.min(Date.now(), created.getTime() + (i % 6) * 864e5));
    const stage = stages[(i * 7) % stages.length];
    const values: Record<string, string> = { "Ticket Number": `TT${17000 + i}`, Description: "Sample description. VTiger is not connected." };
    return {
      id: `17x${i + 1}`,
      num: String(i + 1),
      ticketNo: values["Ticket Number"],
      org: orgs[i % orgs.length],
      incidentNo: i % 3 === 0 ? `INC${100 + i}` : "",
      severity: sev[(i * 5) % sev.length],
      internalSeverity: i % 2 ? "Low" : "",
      title: `Sample ticket ${i + 1}`,
      module: modules[i % modules.length],
      stage,
      internalStatus: i % 3 ? "Closed" : "",
      modified: modified.toISOString(),
      elapsedHours: (i * 13) % 200,
      assignedTo: people[(i * 3) % people.length],
      internalCategory: i % 2 ? "Client Request" : "Configuration Issue",
      created: created.toISOString(),
      description: values.Description,
      all: Object.entries(values).map(([label, value]) => ({ label, value })),
    };
  });
  return { fetchedAt: new Date().toISOString(), tickets, demo: true };
}
