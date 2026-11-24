import { redirect } from "next/navigation";

/** Assignments now live inside Process Management; old links and bookmarks land on the right tab. */
export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") params.set(k, v);
  params.set("tab", "assignments");
  redirect(`/processes?${params.toString()}`);
}
