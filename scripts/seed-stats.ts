/* Prints a summary of the generated demo dataset. Run: npx tsx scripts/seed-stats.ts */
import { buildSeedDatabase } from "@/lib/mock-data";
import { computeParticipation, computeStats, filterTasks, groupStats } from "@/lib/calculations/compliance";
import { resolvePreset, todayISO } from "@/lib/utils/dates";

const today = todayISO();
const db = buildSeedDatabase(today);
const range = resolvePreset("last_30", today);
const tasks = filterTasks(db, { range });
const s = computeStats(tasks, today);
console.log("today", today, "tasks total", db.tasks.length, "in last 90d", tasks.length);
console.log("JSON size KB", Math.round(JSON.stringify(db).length / 1024));
console.log("org", { compliance: s.compliance, due: s.due, overdue: s.overdue, pending: s.pending, awaiting: s.awaitingReview, rejected: s.rejected, onTime: s.onTimeRate });
console.log("participation", computeParticipation(tasks, today));
const emp = new Map(db.employees.map((e) => [e.id, e]));
for (const [d, st] of groupStats(tasks, (t) => emp.get(t.employeeId)!.departmentId, today)) console.log(d, st.compliance, "overdue", st.overdue);
for (const [p, st] of groupStats(tasks, (t) => t.processId, today)) console.log(p, st.totalAssigned, st.compliance);
console.log("notifications", db.notifications.length);
