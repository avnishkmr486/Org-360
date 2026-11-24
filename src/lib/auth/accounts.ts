/**
 * Login accounts. Every employee gets an account whose role decides what they can open.
 *
 * DEMO ONLY: this runs in the browser against mock data, so it demonstrates the flow
 * (login, roles, forced password change) but is not real security. Real authentication
 * belongs in the backend (EnterpriseOperationsHub + Supabase Auth).
 */
import type { AppRole, AppUser, Database, Employee } from "@/types";

/** Initial password of every new account until its owner sets their own. */
export const DEFAULT_PASSWORD = "Welcome@123";

/** Hash stored instead of the password; salted with the user id so equal passwords differ. */
export async function hashPassword(userId: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`${userId}:${password}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A user without a stored hash still has the default password. */
export async function passwordMatches(user: AppUser, password: string): Promise<boolean> {
  return user.passwordHash ? user.passwordHash === (await hashPassword(user.id, password)) : password === DEFAULT_PASSWORD;
}

export const usesDefaultPassword = (user: AppUser) => !user.passwordHash;

/** Starting role for a new account: what the person already leads, otherwise plain employee. Editable in User Management. */
export function defaultRoleFor(employeeId: string, db: Pick<Database, "departments" | "teams">): AppRole {
  if (db.departments.some((d) => d.headId === employeeId)) return "department_head";
  if (db.teams.some((t) => t.projectManagerId === employeeId)) return "project_manager";
  if (db.teams.some((t) => t.supervisorId === employeeId)) return "team_supervisor";
  return "employee";
}

const fullName = (e: Pick<Employee, "firstName" | "lastName">) => `${e.firstName} ${e.lastName}`.trim();

/** Make sure every employee has an account. Returns the same array when nothing was missing. */
export function ensureAccounts(db: Pick<Database, "employees" | "users" | "departments" | "teams">): AppUser[] {
  const linked = new Set(db.users.map((u) => u.employeeId).filter(Boolean));
  const missing = db.employees.filter((e) => !linked.has(e.id));
  if (!missing.length) return db.users;
  const emails = new Set(db.users.map((u) => u.email.toLowerCase()).filter(Boolean));
  let n = db.users.reduce((m, u) => Math.max(m, Number(u.id.replace(/\D/g, "")) || 0), 0);
  const created: AppUser[] = missing.map((e) => {
    const email = e.email.trim();
    const free = email && !emails.has(email.toLowerCase());
    if (free) emails.add(email.toLowerCase());
    return {
      id: `USR-${String(++n).padStart(2, "0")}`,
      name: fullName(e),
      email: free ? email : "",
      role: defaultRoleFor(e.id, db),
      employeeId: e.id,
      status: e.status === "inactive" ? "inactive" : "active",
      lastActiveAt: e.createdAt,
    };
  });
  return [...db.users, ...created];
}

/** Find the account for a sign-in name: an Employee ID or an email address. */
export function findLoginUser(db: Pick<Database, "users">, identifier: string): AppUser | undefined {
  const key = identifier.trim().toLowerCase();
  if (!key) return undefined;
  return db.users.find((u) => (u.employeeId && u.employeeId.toLowerCase() === key) || (u.email && u.email.toLowerCase() === key));
}
