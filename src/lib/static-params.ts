import { PLACEHOLDER } from "@/lib/static-params-const";
import { buildSeedDatabase } from "@/lib/mock-data";
import { ENTITIES } from "@/features/master-data/entities";
import { REPORTS } from "@/features/reports/definitions";

/**
 * Route params known at build time, taken from the demo seed. Needed for the static (GitHub Pages) export;
 * on the normal build, records created later are still served on demand.
 */
const seed = () => buildSeedDatabase(new Date().toISOString().slice(0, 10));
/** Template page for records created after the build; scripts/spa-404.mjs fills in the real id on GitHub Pages. */

const ids = (rows: { id: string }[]) => [...rows.map((r) => ({ id: r.id })), { id: PLACEHOLDER }];

export const employeeParams = () => ids(seed().employees);
export const departmentParams = () => ids(seed().departments);
export const teamParams = () => ids(seed().teams);
export const processParams = () => ids(seed().processes);
export const ecoParams = () => ids(seed().ecoEntities);
export const taskParams = () => [...seed().tasks.map((t) => ({ taskId: t.id })), { taskId: PLACEHOLDER }];
export const entityParams = () => [...ENTITIES.map((e) => ({ entity: e.slug })), { entity: PLACEHOLDER }];
export const reportParams = () => [...REPORTS.map((r) => ({ reportId: r.id })), { reportId: PLACEHOLDER }];
