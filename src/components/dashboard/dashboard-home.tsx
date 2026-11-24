"use client";

import { useCurrentUser } from "@/hooks/use-data";
import { ExecutiveDashboard } from "./executive-dashboard";
import { DepartmentDashboard } from "./department-dashboard";
import { TeamDashboard } from "./team-dashboard";
import { EmployeeDashboard } from "./employee-dashboard";

/** "/" renders the landing dashboard for the active demo role. */
export function DashboardHome() {
  const { home } = useCurrentUser();
  switch (home) {
    case "department":
      return <DepartmentDashboard />;
    case "team":
      return <TeamDashboard />;
    case "employee":
      return <EmployeeDashboard />;
    default:
      return <ExecutiveDashboard />;
  }
}
