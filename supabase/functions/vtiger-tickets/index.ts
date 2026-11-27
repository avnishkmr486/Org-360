// Supabase Edge Function: read-only proxy to the VTiger "HelpDesk" (Tickets) webservice.
// Credentials live in Supabase secrets, never in the browser or the repo:
//   VTIGER_URL, VTIGER_USERNAME, VTIGER_ACCESS_KEY
// Deploy with "Verify JWT" off (the app calls it with its publishable key).
//
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD   tickets created in that range (all fields, labelled)
//   GET ?comments=<ticket id>            comments of one ticket (newest first)
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
const MAX_TICKETS = 3000;
const PAGE = 100;

async function md5(s: string) {
  return encodeHex(await crypto.subtle.digest("MD5", new TextEncoder().encode(s)));
}

// deno-lint-ignore no-explicit-any
async function call(params: Record<string, string>, method: "GET" | "POST" = "GET"): Promise<any> {
  const url = `${BASE}/webservice.php`;
  const qs = new URLSearchParams(params);
  const signal = AbortSignal.timeout(15000);
  let res: Response;
  try {
    res = method === "GET" ? await fetch(`${url}?${qs}`, { signal }) : await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: qs, signal });
  } catch (e) {
    throw new Error(`Could not reach ${BASE}/webservice.php (${e instanceof Error ? e.message : e}). Check VTIGER_URL and that the portal is reachable from the internet.`);
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`VTiger returned a non-JSON response (HTTP ${res.status}). Check VTIGER_URL points at the VTiger root: ${text.slice(0, 80)}`);
  }
  if (!data.success) throw new Error(data.error?.message ?? "VTiger request failed");
  return data.result;
}

async function login() {
  const { token } = await call({ operation: "getchallenge", username: USER });
  const r = await call({ operation: "login", username: USER, accessKey: await md5(token + KEY) }, "POST");
  return r.sessionName as string;
}

const query = (sessionName: string, q: string) => call({ operation: "query", sessionName, query: q });
const stripHtml = (s: string) => String(s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();

/** id -> display name for users and groups (best effort: the API user may not be allowed to read them). */
async function ownerNames(session: string) {
  const names = new Map<string, string>();
  try {
    for (const u of await query(session, "select id, first_name, last_name, user_name from Users;")) {
      names.set(u.id, `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.user_name);
    }
  } catch { /* fall back to ids */ }
  try {
    for (const g of await query(session, "select id, groupname from Groups;")) names.set(g.id, g.groupname);
  } catch { /* ignore */ }
  return names;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!BASE || !USER || !KEY) return json({ error: "VTIGER_URL, VTIGER_USERNAME and VTIGER_ACCESS_KEY secrets are not set" }, 500);
  try {
    const params = new URL(req.url).searchParams;
    const session = await login();

    // ---- comments of one ticket -------------------------------------------------------------------------------
    const commentsFor = params.get("comments");
    if (commentsFor) {
      if (!/^\d+x\d+$/.test(commentsFor)) return json({ error: "Invalid ticket id" }, 400);
      const names = await ownerNames(session);
      const rows = await query(session, `select * from ModComments where related_to = '${commentsFor}' order by createdtime desc limit 0, 25;`);
      return json({
        comments: rows.map((c: Record<string, string>) => ({
          id: c.id,
          text: stripHtml(c.commentcontent),
          author: names.get(c.assigned_user_id) ?? c.assigned_user_id ?? "",
          createdTime: c.createdtime,
        })),
      });
    }

    // ---- tickets in the selected date range ---------------------------------------------------------------------
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return json({ error: "from and to (YYYY-MM-DD) are required" }, 400);

    const desc = await call({ operation: "describe", sessionName: session, elementType: "HelpDesk" });
    // deno-lint-ignore no-explicit-any
    const fields: { name: string; label: string; type: string }[] = desc.fields.map((f: any) => ({ name: f.name, label: f.label, type: f.type?.name ?? "string" }));
    const refFields = fields.filter((f) => f.type === "reference" || f.type === "owner").map((f) => f.name);

    const names = await ownerNames(session);
    const where = `where createdtime >= '${from} 00:00:00' and createdtime <= '${to} 23:59:59'`;
    const rows: Record<string, string>[] = [];
    for (let offset = 0; offset < MAX_TICKETS; offset += PAGE) {
      const page = await query(session, `select * from HelpDesk ${where} order by createdtime desc limit ${offset}, ${PAGE};`);
      rows.push(...page);
      if (page.length < PAGE) break;
    }

    // Resolve referenced records (organization / contact / ...) that are not users or groups.
    const need = new Set<string>();
    for (const r of rows) for (const f of refFields) if (r[f] && !names.has(r[f])) need.add(r[f]);
    const ids = [...need].slice(0, 400);
    for (let i = 0; i < ids.length; i += 8) {
      await Promise.all(
        ids.slice(i, i + 8).map(async (id) => {
          try {
            const rec = await call({ operation: "retrieve", sessionName: session, id });
            const name = rec.accountname ?? rec.label ?? `${rec.firstname ?? ""} ${rec.lastname ?? ""}`.trim() ?? id;
            names.set(id, name || id);
          } catch { /* keep the raw id */ }
        }),
      );
    }

    const tickets = rows.map((r) => {
      const values: Record<string, string> = {};
      for (const f of fields) {
        const v = r[f.name];
        values[f.name] = v === undefined || v === null ? "" : refFields.includes(f.name) ? (names.get(v) ?? v) : String(v);
      }
      return { id: r.id, values };
    });
    return json({ fetchedAt: new Date().toISOString(), baseUrl: BASE, range: { from, to }, fields: fields.map(({ name, label }) => ({ name, label })), tickets, truncated: rows.length >= MAX_TICKETS });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
