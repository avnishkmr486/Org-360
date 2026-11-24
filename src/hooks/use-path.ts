"use client";

import { usePathname } from "next/navigation";

/** The current path without a trailing slash (the static GitHub Pages build serves "/login/"). */
export function usePath(): string {
  const p = usePathname();
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}
