import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/states";
import { UserManagement } from "@/features/users/user-management";

export const metadata = { title: "User Management" };

export default function UsersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <UserManagement />
    </Suspense>
  );
}
