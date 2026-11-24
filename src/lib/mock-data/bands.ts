import type { Band } from "@/types";

export const bandsSeed: Band[] = [
  { id: "BAND-1", code: "B1", name: "Associate", level: 1, description: "Early-career individual contributors.", status: "active" },
  { id: "BAND-2", code: "B2", name: "Professional", level: 2, description: "Experienced individual contributors.", status: "active" },
  { id: "BAND-3", code: "B3", name: "Lead", level: 3, description: "Team leads and senior specialists.", status: "active" },
  { id: "BAND-4", code: "B4", name: "Manager", level: 4, description: "Project and people managers.", status: "active" },
  { id: "BAND-5", code: "B5", name: "Leadership", level: 5, description: "Department heads and senior leadership.", status: "active" },
  // Level bands added from the business's band list (existing B1–B5 are kept; deactivate them in Master Data if not needed).
  ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n, i) => ({
    id: `BAND-${i + 6}`,
    code: `L${n}`,
    name: `L${n}`,
    level: n,
    description: `Level ${n}.`,
    status: "active" as const,
  })),
];
