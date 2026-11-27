// Supabase Edge Function: read-only proxy to the VTiger "HelpDesk" (Tickets) webservice.
// Credentials live in Supabase secrets, never in the browser or the repo:
//   supabase secrets set VTIGER_URL=https://support.example.com VTIGER_USERNAME=... VTIGER_ACCESS_KEY=...
// Deploy: supabase functions deploy vtiger-tickets --no-verify-jwt
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const BASE = (Deno.env.get("VTIGER_URL") ?? "").replace(/\/+$/, "");
const USER = Deno.env.get("VTIGER_USERNAME") ?? "";
const KEY = Deno.env.get("VTIGER_ACCESS_KEY") ?? "";
const MAX_TICKETS = 5000;
const PAGE = 100;

async function md5(s: string) {
  return encodeHex(await crypto.subtle.digest("MD5", new TextEncoder().encode(s)));
}

async function call(params: Record<string, string>, method: "GET" | "POST" = "GET") {
  const url = `${BASE}/webservice.php`;
  const qs = new URLSearchParams(params);
  const res = method === "GET" ? await fetch(`${url}?${qs}`) : await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: qs });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message ?? "VTiger request failed");
  return data.result;
}

async function login() {
  const { token } = await call({ operation: "getchallenge", username: USER });
  const r = await call({ operation: "login", username: USER, accessKey: await md5(token + KEY) }, "POST");
  return r.sessionName as string;
}

const query = (sessionName: string, q: string) => call({ operation: "query", sessionName, query: q });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!BASE || !USER || !KEY) return json({ error: "VTIGER_URL, VTIGER_USERNAME and VTIGER_ACCESS_KEY secrets are not set" }, 500);
  try {
    const session = await login();

    // Assigned-to names (best effort: the API user may not be allowed to read Users).
    const names = new Map<string, string>();
    try {
      for (const u of await query(session, "select id, first_name, last_name, user_name from Users;")) {
        names.set(u.id, `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.user_name);
      }
    } catch { /* fall back to ids */ }
    try {
      for (const g of await query(session, "select id, groupname from Groups;")) names.set(g.id, g.groupname);
    } catch { /* ignore */ }

    const tickets: unknown[] = [];
    for (let offset = 0; offset < MAX_TICKETS; offset += PAGE) {
      const rows = await query(session, `select * from HelpDesk order by createdtime desc limit ${offset}, ${PAGE};`);
      for (const t of rows) {
        tickets.push({
          id: t.id,
          ticketNo: t.ticket_no,
          title: t.ticket_title,
          status: t.ticketstatus,
          priority: t.ticketpriorities,
          severity: t.ticketseverities,
          category: t.ticketcategories,
          assignee: names.get(t.assigned_user_id) ?? t.assigned_user_id ?? "",
          createdTime: t.createdtime,
          modifiedTime: t.modifiedtime,
          hoursToResolve: t.hours ? Number(t.hours) : null,
        });
      }
      if (rows.length < PAGE) break;
    }
    return json({ fetchedAt: new Date().toISOString(), baseUrl: BASE, tickets });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
