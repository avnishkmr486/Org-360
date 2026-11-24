/* Prints sample record IDs useful for manual testing. Run: npx tsx scripts/sample-ids.ts */
import { buildSeedDatabase } from "@/lib/mock-data";
import { getEffectiveStatus } from "@/lib/calculations/compliance";
import { todayISO } from "@/lib/utils/dates";
const today = todayISO();
const db = buildSeedDatabase(today);
const pick = (pred: (t: (typeof db.tasks)[number]) => boolean) => db.tasks.find(pred)?.id;
console.log(JSON.stringify({
  submitted: pick((t) => t.status === "submitted"),
  overdueAmit: pick((t) => t.employeeId === "EMP-1009" && getEffectiveStatus(t, today) === "overdue"),
  upcomingAmit: pick((t) => t.employeeId === "EMP-1009" && t.dueDate > today && t.processId === "PRC-002"),
  rejected: pick((t) => t.status === "rejected"),
}));
