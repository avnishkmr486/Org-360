import type { AppRole, AppUser } from "@/types";

const rows: [id: string, name: string, role: AppRole, employeeId: string | null, email: string][] = [
  ["USR-01", "Platform Super Admin", "super_admin", null, "superadmin@altametrics.example"],
  ["USR-02", "Sanjay Mehta", "senior_management", "EMP-1043", "sanjay.mehta@altametrics.example"],
  ["USR-03", "Vikram Malhotra", "department_head", "EMP-1006", "vikram.malhotra@altametrics.example"],
  ["USR-04", "Anjali Desai", "project_manager", "EMP-1025", "anjali.desai@altametrics.example"],
  ["USR-05", "Karan Bhatia", "team_supervisor", "EMP-1007", "karan.bhatia@altametrics.example"],
  ["USR-06", "Amit Kumar", "employee", "EMP-1009", "amit.kumar@altametrics.example"],
  ["USR-07", "Megha Rastogi", "administrator", "EMP-1049", "megha.rastogi@altametrics.example"],
  ["USR-08", "Priya Nair", "department_head", "EMP-1018", "priya.nair@altametrics.example"],
  ["USR-09", "Meera Iyer", "department_head", "EMP-1033", "meera.iyer@altametrics.example"],
  ["USR-10", "Rakesh Sinha", "team_supervisor", "EMP-1034", "rakesh.sinha@altametrics.example"],
  ["USR-11", "Harsh Vardhan", "project_manager", "EMP-1017", "harsh.vardhan@altametrics.example"],
  ["USR-12", "Neha Agarwal", "employee", "EMP-1008", "neha.agarwal@altametrics.example"],
  ["USR-13", "Imran Sheikh", "employee", "EMP-1036", "imran.sheikh@altametrics.example"],
];

export function buildUsersSeed(nowIso: string): AppUser[] {
  return rows.map(([id, name, role, employeeId, email], i) => ({
    id,
    name,
    email,
    role,
    employeeId,
    status: "active",
    lastActiveAt: new Date(new Date(nowIso).getTime() - i * 3_600_000 * 5).toISOString(),
  }));
}

/** The seven personas offered by the demo role switcher. */
export const DEMO_PERSONA_USER_IDS = ["USR-01", "USR-02", "USR-03", "USR-04", "USR-05", "USR-06", "USR-07"] as const;
