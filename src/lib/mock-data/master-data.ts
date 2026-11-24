import type { Designation, FrequencyDefinition, ProcessCategory } from "@/types";

export const processCategoriesSeed: ProcessCategory[] = [
  { id: "CAT-01", name: "Engineering Excellence", description: "Development practices and code quality.", status: "active" },
  { id: "CAT-02", name: "Quality Assurance", description: "Testing, certification and release quality.", status: "active" },
  { id: "CAT-03", name: "Customer Delivery", description: "Implementation and go-live processes.", status: "active" },
  { id: "CAT-04", name: "Information Security", description: "Security, backups and data protection.", status: "active" },
  { id: "CAT-05", name: "Service Operations", description: "Support, SLAs and production operations.", status: "active" },
  { id: "CAT-06", name: "People & HR", description: "Timesheets, onboarding and people practices.", status: "active" },
  { id: "CAT-07", name: "Product Lifecycle", description: "Planning, requirements and retrospectives.", status: "active" },
  { id: "CAT-08", name: "Finance & Governance", description: "Reconciliation, audits and controls.", status: "active" },
];

export const frequenciesSeed: FrequencyDefinition[] = [
  { id: "daily", name: "Daily", description: "Every working day (Mon–Fri).", status: "active" },
  { id: "weekly", name: "Weekly", description: "Once per week, due Friday.", status: "active" },
  { id: "monthly", name: "Monthly", description: "Once per calendar month.", status: "active" },
  { id: "quarterly", name: "Quarterly", description: "Once per calendar quarter.", status: "active" },
  { id: "annually", name: "Annually", description: "Once per year.", status: "active" },
  { id: "event_based", name: "Event Based", description: "Triggered by a business event (release, go-live, joiner).", status: "active" },
  { id: "custom", name: "Custom", description: "Repeats every N days.", status: "active" },
];

/** Names that were cut off in the list supplied by the business were completed by best guess — flagged so they can be confirmed. */
const DESIGNATIONS: [name: string, confirmed?: true][] = [
  ["Director", true], ["Senior Data Analyst"], ["Sr. Solution Architect"], ["Technical Manager"], ["Product Manager"], ["HR Intern", true],
  ["Automation Engineer"], ["HR Manager"], ["Data Center Engineer"], ["Principal Technical Architect"], ["Business Consultant"], ["Principal QA Engineer"],
  ["Network Specialist"], ["UI-UX Manager"], ["Lead Accountant"], ["UI-UX Specialist"], ["Database Specialist"], ["Principal Business Analyst"],
  ["Technical Lead"], ["Lead UI-UX Designer"], ["Technology Lead"], ["QA Specialist"], ["Ops Intern", true], ["Sr. Business Analyst"],
  ["Network Engineer"], ["Network Administrator"], ["Sr. QA Lead"], ["Business Analyst"], ["Principal Developer"], ["Sr. System Administrator"],
  ["Sr. Data Center Engineer"], ["Associate Software Engineer"], ["QA Lead", true], ["Lead Automation Engineer"], ["Sr. Product Manager"], ["Sr. Automation Engineer"],
  ["Automation Analyst"], ["Software Developer"], ["Sr. QA Analyst"], ["Sr. Server Administrator"], ["Associate QA Engineer"], ["Programmer Analyst"],
  ["Software Engineer"], ["QA Analyst"], ["Product Analyst"], ["Associate Business Analyst"], ["Associate Product Manager"], ["Lead UI-UX Developer"],
  ["Technical Writer"], ["QA Engineer"], ["Sr. IT System Administrator"], ["Associate Data Analyst"], ["Junior Technical Writer"], ["Automation Test Engineer"],
  ["Trainee Engineer"], ["Server Administrator"], ["Digital Marketing Executive"], ["Associate UI-UX Designer"], ["Sr. UI-UX Designer"], ["Associate Network Engineer"],
  ["Automation Architect"], ["Network Trainee"], ["Site Reliability Engineer"], ["Associate Technical Writer"], ["Development Manager"], ["Development Lead"],
  ["PS Trainee", true], ["Content Writer"], ["QA Intern", true], ["Client Support Executive"], ["Java Intern", true], ["PS Intern", true],
  ["DC Intern", true], ["DB Intern", true], ["Admin Executive"], ["Project Coordinator"],
];

type Profile = [test: RegExp, summary: string, duties: string[]];
/** Starter role profiles by keyword (first match wins) — editable under Master Data → Designations. */
const PROFILES: Profile[] = [
  [/intern|trainee/i, "Early-career role learning on the job under the guidance of a supervisor.", ["Complete the assigned learning plan and training modules", "Support the team on assigned tasks under guidance", "Follow team processes, timesheets and compliance checklists", "Share progress and blockers with the supervisor every day"]],
  [/director/i, "Leads the function: sets direction, owns outcomes and represents it to leadership and clients.", ["Set goals, priorities and the roadmap for the function", "Own budget, hiring and organization design", "Review delivery, quality and compliance across all teams", "Represent the function with leadership and key clients"]],
  [/ui-ux/i, "Designs clear, consistent and accessible user experiences for the product.", ["Research user needs and translate them into flows and wireframes", "Produce high-fidelity designs and maintain the design system", "Work with developers to ensure designs are built as intended", "Run usability reviews and iterate on feedback"]],
  [/qa|automation/i, "Assures release quality through planned manual and automated testing.", ["Write and maintain test plans, test cases and automation scripts", "Execute regression, functional and release testing", "Log, track and verify defects through to closure", "Report quality metrics and release readiness"]],
  [/network|server|system|data center|site reliability/i, "Keeps infrastructure, networks and production systems available, secure and performant.", ["Monitor systems, networks and alerts and respond to incidents", "Apply patches, backups and configuration changes safely", "Maintain capacity, security hardening and access controls", "Document runbooks and support disaster-recovery drills"]],
  [/database/i, "Owns the health, performance and safety of the organization's databases.", ["Monitor database performance and tune queries and indexes", "Manage backups, restores and data retention", "Control access and apply security patches", "Support developers with schema changes and migrations"]],
  [/data analyst/i, "Turns data into insight that guides product and business decisions.", ["Gather, clean and validate data from source systems", "Build reports and dashboards for stakeholders", "Analyse trends and explain what is driving them", "Maintain metric definitions and data quality checks"]],
  [/architect/i, "Defines the technical direction and architecture of solutions.", ["Design solution architecture and key technical standards", "Review designs and code for scalability, security and quality", "Evaluate technologies and guide build-vs-buy decisions", "Mentor engineers and unblock complex technical problems"]],
  [/product manager/i, "Owns the product's direction, priorities and outcomes.", ["Define the product roadmap and prioritise the backlog", "Gather customer and market input and write clear requirements", "Work with design and engineering to ship releases", "Measure adoption and outcomes after release"]],
  [/analyst|consultant/i, "Bridges business needs and delivery by analysing processes and defining requirements.", ["Elicit and document business requirements", "Map current processes and propose improvements", "Write user stories and acceptance criteria", "Support testing, sign-off and customer go-lives"]],
  [/\bhr\b/i, "Supports people operations from hiring through engagement and exit.", ["Manage recruitment, onboarding and exits", "Maintain employee records and HR policies", "Run performance, engagement and training programmes", "Handle employee queries and grievances confidentially"]],
  [/accountant/i, "Keeps the books accurate and the organization financially compliant.", ["Maintain ledgers, reconciliations and month-end close", "Process payables, receivables and payroll inputs", "Prepare statutory filings and audit schedules", "Report on budgets and spend against plan"]],
  [/writer|content/i, "Creates clear documentation and content for customers and teams.", ["Write user guides, release notes and help articles", "Work with product and engineering to understand features", "Keep documentation accurate and up to date", "Follow style guides and review content for quality"]],
  [/marketing/i, "Builds awareness and demand through digital channels.", ["Plan and run digital campaigns", "Manage website, social and email content", "Track campaign performance and optimise spend", "Support sales with collateral and leads"]],
  [/support/i, "Resolves customer issues quickly and keeps clients happy.", ["Respond to and resolve customer tickets within SLA", "Troubleshoot issues and escalate when needed", "Keep customers informed until resolution", "Feed recurring issues back to product and engineering"]],
  [/admin|coordinator/i, "Keeps day-to-day operations and projects organised and on schedule.", ["Coordinate schedules, meetings and logistics", "Track actions, documents and approvals", "Maintain records and support audits", "Be the first point of contact for internal requests"]],
  [/manager|technology lead|technical lead|development lead/i, "Leads an engineering team to deliver quality software on time.", ["Plan sprints and allocate work across the team", "Own delivery timelines, quality and technical decisions", "Review designs and code and remove blockers", "Coach team members and run their performance reviews"]],
  [/developer|engineer|programmer|software/i, "Builds and maintains the product's software.", ["Design, build and test features and fixes", "Write clean, reviewed and documented code", "Investigate and resolve production issues", "Take part in planning, estimation and code reviews"]],
];
const GENERIC: Profile = [/./, "Contributes to the team's goals in this role.", ["Deliver assigned work on time and to standard", "Follow team processes and compliance requirements", "Collaborate with colleagues and share knowledge"]];

function profileFor(name: string): { summary: string; responsibilities: string } {
  const [, summary, duties] = PROFILES.find(([re]) => re.test(name)) ?? GENERIC;
  const extra: string[] = [];
  if (/lead|principal|sr\.|senior|director/i.test(name)) extra.push("Mentor junior team members and review their work");
  if (/lead|principal/i.test(name) && !/technology lead|technical lead|development lead/i.test(name)) extra.push("Plan and track the team's work and report status");
  return { summary, responsibilities: [...duties, ...extra].join("\n") };
}

export const designationsSeed: Designation[] = DESIGNATIONS.map(([name, confirmed], i) => ({
  id: `DES-${String(i + 1).padStart(2, "0")}`,
  name,
  description: confirmed ? "" : "Full title completed from a truncated list — please confirm.",
  status: "active",
  ...profileFor(name),
}));

export const designationId = (name: string): string | null => designationsSeed.find((d) => d.name === name)?.id ?? null;
