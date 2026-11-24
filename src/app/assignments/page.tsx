"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Assignments now live inside Process Management; old links and bookmarks land on the right tab. */
function Redirect() {
  const router = useRouter();
  const search = useSearchParams();
  useEffect(() => {
    const params = new URLSearchParams(search.toString());
    params.set("tab", "assignments");
    router.replace(`/processes?${params.toString()}`);
  }, [router, search]);
  return null;
}

export default function AssignmentsPage() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
