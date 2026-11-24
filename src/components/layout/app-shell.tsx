"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getDb } from "@/lib/store/mock-db";
import { switchPersona } from "@/hooks/use-data";
import { useRouter } from "next/navigation";
import { usePath } from "@/hooks/use-path";
import { ChangePasswordDialog } from "@/features/auth/change-password-dialog";
import { usesDefaultPassword } from "@/lib/auth/accounts";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { PageSkeleton, RestrictedState } from "@/components/common/states";
import { useCurrentUser, useHydrated, useSignedInUser } from "@/hooks/use-data";
import { canAccessPath } from "@/lib/navigation";
import { ROLE_LABELS } from "@/lib/auth/permissions";

export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const pathname = usePath();
  const router = useRouter();
  const signedIn = useSignedInUser();
  const onLogin = pathname === "/login";

  // Everything except the sign-in page needs a signed-in user.
  useEffect(() => {
    if (hydrated && !signedIn && !onLogin) router.replace("/login");
  }, [hydrated, signedIn, onLogin, router]);

  if (onLogin) return <>{children}</>;
  if (!hydrated || !signedIn) {
    return (
      <div className="min-h-screen bg-background p-8">
        <PageSkeleton />
      </div>
    );
  }
  return <Shell signedInId={signedIn.id} defaultPassword={usesDefaultPassword(signedIn)}>{children}</Shell>;
}

function Shell({ children, signedInId, defaultPassword }: { children: ReactNode; signedInId: string; defaultPassword: boolean }) {
  const { role } = useCurrentUser();
  const pathname = usePath();
  const allowed = canAccessPath(role, pathname);
  const [dismissed, setDismissed] = useState(false);

  // Demo links: "?persona=USR-06" opens the app as that user — Super Admin only.
  const signedIn = useSignedInUser();
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("persona");
    if (id && signedIn?.role === "super_admin" && getDb().users.some((u) => u.id === id)) switchPersona(id);
  }, [signedIn?.role]);

  return (
    <div className="min-h-screen bg-background lg:h-screen lg:overflow-hidden">
      <Sidebar />
      <div className={"flex min-h-screen flex-col lg:h-screen lg:pl-[72px]"}>
        <Topbar />
        <div className="min-h-0 flex-1 px-3 py-3 lg:overflow-y-auto lg:px-4">
          <main className="h-full w-full">{allowed ? children : <RestrictedState role={ROLE_LABELS[role]} />}</main>
        </div>
        <footer className="shrink-0 border-t px-4 py-1.5 text-center text-[11px] text-muted-foreground lg:px-8">
          Organization 360 · Altametrics Pvt Ltd. · Process. Performance. Accountability. · Demo build with mock data
        </footer>
      </div>
      <ChangePasswordDialog userId={signedInId} open={defaultPassword && !dismissed} onOpenChange={(o) => !o && setDismissed(true)} forced />
    </div>
  );
}
