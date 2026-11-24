/** Sign-in, sign-out and password handling (demo auth — see lib/auth/accounts). */
import type { AppUser } from "@/types";
import { findLoginUser, hashPassword, passwordMatches } from "@/lib/auth/accounts";
import { getUiState, setUiState } from "@/lib/store/ui-store";
import { auditEntry, getDb, latency, nowIso, replaceById, RepositoryError, write } from "./core";

export type SignInResult = { ok: true; user: AppUser } | { ok: false; error: string };

export const MIN_PASSWORD_LENGTH = 8;

/** Sign in with an Employee ID or email. The same message is returned for an unknown ID and a wrong password. */
export async function signIn(identifier: string, password: string): Promise<SignInResult> {
  await latency(350);
  const db = getDb();
  const user = findLoginUser(db, identifier);
  if (!user || !(await passwordMatches(user, password))) return { ok: false, error: "Incorrect ID / email or password." };
  const employee = user.employeeId ? db.employees.find((e) => e.id === user.employeeId) : null;
  if (user.status !== "active" || employee?.status === "inactive") return { ok: false, error: "This account is disabled. Contact your administrator." };
  write((d) => ({
    patch: { users: replaceById(d.users, user.id, (u) => ({ ...u, lastActiveAt: nowIso() })) },
    audit: [auditEntry(d, "Users", "Signed In", user.id, user.name, "User signed in.")],
  }));
  setUiState({ signedInUserId: user.id, currentUserId: user.id });
  return { ok: true, user };
}

export function signOut(): void {
  setUiState({ signedInUserId: null });
}

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  await latency();
  const user = getDb().users.find((u) => u.id === userId);
  if (!user) throw new RepositoryError("Account not found.");
  if (!(await passwordMatches(user, current))) throw new RepositoryError("Current password is incorrect.");
  if (next.length < MIN_PASSWORD_LENGTH) throw new RepositoryError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (next === current) throw new RepositoryError("New password must be different from the current one.");
  const passwordHash = await hashPassword(userId, next);
  write((d) => ({
    patch: { users: replaceById(d.users, userId, (u) => ({ ...u, passwordHash })) },
    audit: [auditEntry(d, "Users", "Password Changed", userId, user.name, "Password changed by the user.")],
  }));
}

/** Administrator action: put the account back on the default password. */
export async function resetPassword(userId: string): Promise<void> {
  await latency();
  write((d) => {
    const user = d.users.find((u) => u.id === userId);
    if (!user) throw new RepositoryError("Account not found.");
    return {
      patch: { users: replaceById(d.users, userId, (u) => ({ ...u, passwordHash: undefined })) },
      audit: [auditEntry(d, "Users", "Password Reset", userId, user.name, "Password reset to the default.")],
    };
  });
}

export const signedInUserId = () => getUiState().signedInUserId;
