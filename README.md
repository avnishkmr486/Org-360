# Organization 360

**Altametrics Pvt Ltd. — Enterprise Process Management & Compliance Platform**
*Process. Performance. Accountability.*

Organization 360 gives senior management visibility into which processes are defined, which departments, teams and employees follow them, where adherence is weak, and who is accountable.

> **Phase 1 scope:** a fully interactive **frontend only**. All data comes from a centralized mock data layer. There is no database, backend API, real authentication or external notification service. The data layer is built so it can be swapped for Supabase/PostgreSQL later without redesigning the UI.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start   # production build
npm test                     # compliance-engine + repository write-flow tests (24 checks)
npm run typecheck            # strict TypeScript
npm run seed:stats           # summary of the generated demo dataset
```

### Demo links per role

Append `?persona=<id>` to any URL to open the app as that demo user:

| Persona | Role | Lands on |
|---|---|---|
| `USR-01` | Super Admin | Executive dashboard (everything visible) |
| `USR-02` | Senior Management — Sanjay Mehta (default) | Executive dashboard |
| `USR-03` | Department Head — Vikram Malhotra (Engineering) | Department dashboard |
| `USR-04` | Project Manager — Anjali Desai (2 Implementation teams) | Team dashboard |
| `USR-05` | Team Supervisor — Karan Bhatia (Platform Engineering) | Team dashboard |
| `USR-06` | Employee — Amit Kumar | My Dashboard (tasks, checklists, submission) |
| `USR-07` | Administrator — Megha Rastogi | Executive dashboard + admin modules |

Example: `http://localhost:3000/compliance/approvals?persona=USR-05`

Requirements: Node 20+ (developed on Node 24).

### Demo tips

- **Role switcher** (teal button, top bar): switch between Super Admin, Senior Management, Department Head, Project Manager, Team Supervisor, Employee and Administrator. Navigation, landing dashboard, visible data and available actions all change. This is a **frontend simulation**, not a security boundary.
- **Date range** (top bar): drives every metric. Default is *Last 30 days*. Comparisons always use the equal-length previous period.
- **Global search**: `Ctrl/⌘ + K`.
- **Drill-down**: every KPI card and chart mark navigates to the detailed page with filters applied in the URL.
- **Reset demo data**: user menu → *Reset demo data*, or Settings → Danger zone.
- Demo changes persist in your browser's localStorage only.

---

## Tech stack

| Concern | Library |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4, shadcn/ui (Radix), Lucide icons |
| Charts | Recharts 2 |
| Forms | React Hook Form + Zod |
| Excel | ExcelJS (lazy-loaded) |
| PDF | jsPDF + jspdf-autotable (lazy-loaded) |
| Dates | date-fns |
| Theming | next-themes (light / dark / system) |

---

## Architecture

```
src/
  app/                    Routes (server components wrapping client feature components)
  components/
    layout/               App shell: sidebar, top bar, providers, brand
    common/               Page header, KPI card, badges, filters, states, export menu, dialogs
    charts/               Chart card, tooltip, legend, compliance chart set
    tables/               Generic DataTable (sort, paginate, bulk select)
    dashboard/            Executive / department / team / employee dashboards, analytics filters
    ui/                   shadcn/ui primitives
  features/<module>/      Module UIs (organization, employees, processes, assignments,
                          compliance, reports, notifications, …)
  lib/
    mock-data/            Seed data (organizations, departments, teams, employees, bands, roles,
                          processes, assignments, compliance, notifications, …) + assembler
    store/                mock-db.ts (in-memory DB + delta persistence), ui-store.ts
    repositories/         Async service functions — the ONLY write path (Supabase seam)
    calculations/         Compliance engine + dashboard metrics (pure functions, no React)
    services/             Assignment engine (eligibility + task generation)
    auth/                 Roles, permissions, data scope
    export/               Branded Excel / PDF exporters
    utils/                Dates, formatting, seeded RNG
  hooks/                  useDatabase, useCurrentUser, useGlobalDateRange, useUrlFilters, …
  types/                  Domain interfaces (1:1 with future tables)
```

### Data flow

```
UI component ──reads──▶ hooks/use-data (useSyncExternalStore) ──▶ lib/store/mock-db
     │                                                              ▲
     └──writes──▶ lib/repositories (async, validation, audit log) ──┘
                         │
                         └─ lib/calculations / lib/services  (pure business logic)
```

- **Reads** subscribe to the store snapshot. All metrics are computed from it, and nothing on screen is hardcoded.
- **Writes** go through async repository functions such as `createEmployee`, `updateProcess`, `createAssignment`, `submitTask` and `reviewTask`. Each validates its input, applies an immutable update, writes an audit-log entry and, where relevant, creates notifications.
- **Persistence** is optional and lives only in `lib/store/mock-db.ts`. The seed is deterministic, so the store saves the small tables in full and only the compliance tasks that differ from the seed. This keeps localStorage use small.

### Migrating to Supabase (future phase)

1. Create tables from `src/types/index.ts`. Every interface is a table and every `…Id` field is a foreign key.
2. Re-implement the functions in `src/lib/repositories/*` with the Supabase client. Their signatures are already async.
3. Switch the read hooks in `src/hooks/use-data.ts` to queries (for example TanStack Query plus realtime).
4. Port `lib/calculations` unchanged to the client, or into SQL views and edge functions.
5. Replace the demo role switcher with Supabase Auth. Map `lib/auth/permissions.ts` to row-level security (RLS) policies.

---

## Process Dashboard, detail page and imports

**Process Dashboard** (`/processes`) is a summary grid: Process Name, Start Date, Owner, Health, Status. Click a process to open its detail page.

**Process detail** (`/processes/[id]`):
- **Overview:** Process ID (auto-generated, sequential), all definition fields, accountability (owner, responsible, reviewer, escalation contact, stakeholders), SOP and reference links.
- **Applied For:** choose the level (Department / Team / Employee), add departments, then pick teams and employees pulled from the employee data. Saving keeps the process's assignments in sync for Active processes. It never double-assigns an employee who already has a manual assignment.
- **Meetings & Follow-up:** meeting date, agenda, attendees, notes, follow-up date / action / owner, next review and last reviewed dates.
- **Timeline & Audit:**
  - *Journey*: creation, every definition change with field-level before/after, assignments, meetings, follow-ups, approvals and rejections, monthly compliance vs target, and what is scheduled next.
  - *Audit log*: a filterable table with Excel/PDF export.

**Health** (`lib/calculations/process-health.ts`): compliance over the last 90 days against the process's own threshold. Meeting it is *Healthy*, within 10 pts below is *At risk*, and more than 10 pts below is *Critical*. An overdue follow-up or review downgrades Healthy to At risk. Draft, inactive or expired processes are *Not active*.

**Excel imports accept any layout** (`lib/import/sheet-parser.ts`, shared):
- Formats: .xlsx, .xlsm, .csv, .tsv, .txt. Legacy .xls gets a clear "re-save as .xlsx" message.
- Auto-detects the right sheet and the header row (title rows above are skipped, and you can override both).
- Columns are mapped by name, similar name, or content, with a confidence badge; every mapping is editable.
- Missing columns and blank cells can take defaults you set. Unknown values get "did you mean…?" suggestions.
- Employees (`/employees/import`): a single "Full Name" column is split, and IDs are auto-generated when blank. Employee ID stays the unique key, so existing employees are updated only on explicit opt-in, and nobody missing from the file is ever deleted.
- Processes (`/processes/import`): one row per process, with steps inline or on a separate "Steps" sheet. Process IDs are always auto-generated, and existing processes (matched by name) are updated only on opt-in.

---

## Compliance calculation engine (`src/lib/calculations/compliance.ts`)

- **Organization compliance** = completed required tasks ÷ total due required tasks × 100.
- **Employee participation** = employees who submitted at least one required task ÷ employees expected to submit × 100.
- Computed at organization, department, team, employee, role, band and process level (`groupStats`).

Rules:
- Only applicable tasks count. *Not Applicable* and *Approved Exception* tasks are excluded.
- Only tasks due in the selected period count.
- A task enters the denominator once its due date has passed, or earlier if it is already completed. Work that isn't late yet does not lower compliance.
- Unsubmitted tasks are **not** excluded.
- Rejected submissions do not count as completed.
- Tasks that require approval count only after approval. *Submitted* tasks do not count.
- Employees with no applicable tasks show **N/A**, never 0%.
- Division by zero returns `null`.
- *Overdue* is derived: a task that is *Not Started* or *In Progress* and past its due date.

Default thresholds, configurable in Settings: **Excellent ≥ 95%**, **Good 85–94.99%**, **Needs Improvement 70–84.99%**, **Critical < 70%**. The *Good* threshold is also the cut-off for a "compliant employee".

---

## Demo dataset

Generated deterministically by `src/lib/mock-data`:

- 1 organization (Altametrics Pvt Ltd.), 8 departments, 10 teams, **50 employees**
- 5 bands, 15 employee roles, 20 designations, 5 locations, 8 process categories, 7 frequencies
- **15 processes** with steps covering every frequency (daily, weekly, monthly, quarterly, annually, event-based, custom)
- 21 assignments covering every level (organization, department, team, role, band, individual)
- About 3,800 compliance tasks over the last 6 months plus the next 4 weeks. The history includes department-level differences, month-over-month improvement, pending approvals, rejections, overdue work and approved exceptions.
- Notifications, audit logs, 13 application users (7 demo personas)

> The brief listed illustrative executive KPIs (248 employees, 24 teams, 42 processes). This build follows the brief's demo-data spec (50 employees, 10 teams, 15 processes) and computes every KPI from that data. With the default *Last 30 days* range, overall compliance and participation land near the illustrative 86.5% and 92.3%.

## Branding

The logo comes from `public/brand/altametrics-icon.svg` (the Altametrics icon asset from the existing Altametrics workspace). It is referenced through `organization.logoUrl` and can be replaced in **Settings → Organization Logo** without code changes. Excel and PDF exports carry an *Altametrics Pvt Ltd.* header, the report title, the generation time and a confidentiality footer.

## Accessibility

- Light and dark themes are defined as separate token sets.
- Status colors always come with an icon and text label.
- Charts use a categorical palette validated for colorblind readers, with legends and tooltips.
- Keyboard focus is visible and dialogs use accessible names.
- Charts skip their entry animation when the user prefers reduced motion.
