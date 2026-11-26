/** Demo data for the business ecosystem: products, clients, modules, integrations and POS systems, and how they connect. */
import type { Database, EcoEntity, EcoRelation, EcoStatus, EcoType, Employee } from "@/types";

const types: EcoType[] = [
  { id: "ETY-product", name: "Product", tone: "info" },
  { id: "ETY-client", name: "Client", tone: "teal" },
  { id: "ETY-module", name: "Module", tone: "warning" },
  { id: "ETY-integration", name: "Integration", tone: "success" },
  { id: "ETY-pos", name: "POS System", tone: "danger" },
];

type Row = [id: string, type: string, name: string, owner: number, contact: [name: string, email: string, phone: string] | null, description: string, status?: EcoStatus];

const rows: Row[] = [
  ["ECO-001", "product", "Workforce Suite", 0, ["Priya Nair", "priya.nair@altametrics.example", "+1 555 0101"], "Scheduling, time and labor management for restaurants."],
  ["ECO-002", "product", "Inventory Pro", 1, ["Daniel Reyes", "daniel.reyes@altametrics.example", "+1 555 0102"], "Stock counts, ordering and waste tracking."],

  ["ECO-003", "product", "Back Office", 2, null, "Back-office operations: labor, inventory and compliance in one place."],
  ["ECO-004", "product", "Growth", 3, null, "Guest engagement and sales growth tools."],
  ["ECO-005", "product", "Plum", 4, null, "Plum product line."],
  ["ECO-006", "product", "BI", 5, null, "Business intelligence and analytics."],

  ["ECO-010", "module", "Scheduling", 2, null, "Shift planning and publishing."],
  ["ECO-011", "module", "Time & Attendance", 3, null, "Clock in/out, breaks and exceptions."],
  ["ECO-012", "module", "Payroll Export", 4, null, "Hours and wages to the payroll provider."],
  ["ECO-013", "module", "Forecasting", 2, null, "Demand and labor forecasts."],
  ["ECO-014", "module", "Labor Reports", 5, null, "Labor cost and compliance reporting."],
  ["ECO-015", "module", "Tip Pooling", 3, null, "Tip allocation rules.", "planned"],

  ["ECO-020", "integration", "ADP Payroll", 4, ["Meera Shah", "meera.shah@adp.example", "+1 555 0120"], "Payroll file export to ADP."],
  ["ECO-021", "integration", "Gusto", 4, ["Tom Becker", "tom.becker@gusto.example", "+1 555 0121"], "Payroll and benefits sync."],
  ["ECO-022", "integration", "QuickBooks", 5, ["Ana Lopes", "ana.lopes@intuit.example", "+1 555 0122"], "Accounting journal export."],
  ["ECO-023", "integration", "Slack Alerts", 6, ["Kenji Ito", "kenji.ito@altametrics.example", "+1 555 0123"], "Shift and exception alerts in Slack."],
  ["ECO-024", "integration", "Okta SSO", 6, ["Sara Fox", "sara.fox@okta.example", "+1 555 0124"], "Single sign-on for enterprise clients.", "planned"],

  ["ECO-030", "pos", "Toast", 7, ["Liam Carter", "liam.carter@toast.example", "+1 555 0130"], "Toast POS sales and labor sync."],
  ["ECO-031", "pos", "Square", 7, ["Nora Wells", "nora.wells@square.example", "+1 555 0131"], "Square POS sales sync."],
  ["ECO-032", "pos", "Clover", 8, ["Omar Haddad", "omar.haddad@clover.example", "+1 555 0132"], "Clover POS sales sync."],
  ["ECO-033", "pos", "NCR Aloha", 8, null, "Aloha POS via file drop.", "inactive"],

  ["ECO-100", "client", "Harborview Hospitality", 0, ["Grace Mitchell", "grace@harborview.example", "+1 555 0200"], "Hotel and restaurant group, 14 sites."],
  ["ECO-101", "client", "Blue Ember Grill", 1, ["Marco Rossi", "marco@blueember.example", "+1 555 0201"], "Casual dining, 9 sites."],
  ["ECO-102", "client", "Cedar & Co. Cafés", 2, ["Hana Park", "hana@cedarcafes.example", "+1 555 0202"], "Café chain, 22 sites."],
  ["ECO-103", "client", "Northside Diner Group", 3, ["Frank Doyle", "frank@northside.example", "+1 555 0203"], "Diners, 6 sites."],
  ["ECO-104", "client", "Sunrise Bakeries", 4, ["Isabel Cruz", "isabel@sunrise.example", "+1 555 0204"], "Bakery and retail, 11 sites."],
  ["ECO-105", "client", "Metro Pizza Works", 5, ["Vikram Rao", "vikram@metropizza.example", "+1 555 0205"], "Pizza delivery, 31 sites."],
  ["ECO-106", "client", "Lakeside Resorts", 6, null, "Resort group onboarding.", "planned"],
  ["ECO-107", "client", "Urban Bowl", 7, ["Chloe Martin", "chloe@urbanbowl.example", "+1 555 0207"], "Fast casual, 5 sites."],
  ["ECO-110", "client", "CSC", 0, null, "Back Office client."],
  ["ECO-111", "client", "JITB", 1, null, "Back Office client."],
  ["ECO-112", "client", "LC", 2, null, "Back Office client."],
  ["ECO-113", "client", "Outback", 3, null, "Back Office client."],
  ["ECO-114", "client", "PeetsCoffee", 4, null, "Back Office client."],
  ["ECO-115", "client", "Noodles", 5, null, "Back Office client."],
  ["ECO-116", "client", "BWW", 6, null, "Back Office client."],
  ["ECO-117", "client", "Arbys", 7, null, "Back Office client."],
  ["ECO-118", "client", "Bobby Cox", 8, null, "Back Office client."],
  ["ECO-119", "client", "Rosas Cafe", 0, null, "Back Office client."],
  ["ECO-120", "client", "TACOBELL", 1, null, "Back Office client."],
  ["ECO-121", "client", "DENNYS", 2, null, "Back Office client."],
  ["ECO-122", "client", "CHIPOTLE", 3, null, "Back Office client."],
  ["ECO-123", "client", "SNS", 4, null, "Back Office client."],
  ["ECO-124", "client", "Mel.Mushroom", 5, null, "Back Office client."],
  ["ECO-125", "client", "GOLDEN_CHICK", 6, null, "Back Office client."],
  ["ECO-126", "client", "BOJANGLES", 7, null, "Back Office client."],
  ["ECO-127", "client", "McDonalds", 8, null, "Back Office client."],
];

const typeId = (k: string) => (k === "pos" ? "ETY-pos" : `ETY-${k}`);

/** [from, label, to…] — read "from <label> to". */
const links: [string, string, string[]][] = [
  ["ECO-010", "part of", ["ECO-001"]],
  ["ECO-011", "part of", ["ECO-001"]],
  ["ECO-012", "part of", ["ECO-001"]],
  ["ECO-013", "part of", ["ECO-001"]],
  ["ECO-014", "part of", ["ECO-001"]],
  ["ECO-015", "part of", ["ECO-001"]],
  ["ECO-020", "integrates with", ["ECO-012"]],
  ["ECO-021", "integrates with", ["ECO-012"]],
  ["ECO-022", "integrates with", ["ECO-014"]],
  ["ECO-030", "integrates with", ["ECO-013", "ECO-011"]],
  ["ECO-031", "integrates with", ["ECO-013"]],
  ["ECO-032", "integrates with", ["ECO-013"]],
  ["ECO-100", "licenses", ["ECO-001", "ECO-002"]],
  ["ECO-101", "licenses", ["ECO-001"]],
  ["ECO-102", "licenses", ["ECO-001"]],
  ["ECO-103", "licenses", ["ECO-001"]],
  ["ECO-104", "licenses", ["ECO-001", "ECO-002"]],
  ["ECO-105", "licenses", ["ECO-001"]],
  ["ECO-107", "licenses", ["ECO-001"]],
  ["ECO-100", "uses", ["ECO-010", "ECO-011", "ECO-012", "ECO-014", "ECO-020", "ECO-023"]],
  ["ECO-101", "uses", ["ECO-010", "ECO-011", "ECO-013", "ECO-021"]],
  ["ECO-102", "uses", ["ECO-010", "ECO-011", "ECO-012", "ECO-013", "ECO-014", "ECO-020", "ECO-022"]],
  ["ECO-103", "uses", ["ECO-010", "ECO-011", "ECO-012", "ECO-022"]],
  ["ECO-104", "uses", ["ECO-010", "ECO-011", "ECO-014", "ECO-021"]],
  ["ECO-105", "uses", ["ECO-010", "ECO-013", "ECO-012", "ECO-020", "ECO-023"]],
  ["ECO-107", "uses", ["ECO-010", "ECO-011", "ECO-013", "ECO-021"]],
  ["ECO-100", "runs on", ["ECO-030"]],
  ["ECO-101", "runs on", ["ECO-030"]],
  ["ECO-102", "runs on", ["ECO-031"]],
  ["ECO-103", "runs on", ["ECO-033"]],
  ["ECO-105", "runs on", ["ECO-030", "ECO-032"]],
  ["ECO-107", "runs on", ["ECO-031"]],
];

// The clients added for Back Office all license it.
for (let i = 0; i < 18; i++) links.push([`ECO-${110 + i}`, "licenses", ["ECO-003"]]);

export function buildEcosystemSeed(employees: Employee[], nowIso: string): Pick<Database, "ecoTypes" | "ecoEntities" | "ecoRelations"> {
  const owners = employees.filter((e) => e.status !== "inactive");
  const ecoEntities: EcoEntity[] = rows.map(([id, type, name, owner, contact, description, status]) => ({
    id,
    typeId: typeId(type),
    name,
    description,
    status: status ?? "active",
    ownerId: owners[owner % owners.length]?.id ?? null,
    contactName: contact?.[0] ?? "",
    contactEmail: contact?.[1] ?? "",
    contactPhone: contact?.[2] ?? "",
    notes: "",
    createdAt: nowIso,
    updatedAt: nowIso,
  }));
  let n = 0;
  const ecoRelations: EcoRelation[] = links.flatMap(([from, label, tos]) => tos.map((to) => ({ id: `REL-${String(++n).padStart(4, "0")}`, fromId: from, toId: to, label, note: "", createdAt: nowIso })));
  return { ecoTypes: types, ecoEntities, ecoRelations };
}
