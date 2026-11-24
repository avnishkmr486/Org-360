"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Filter state stored in the URL query string — makes every filtered view
 * shareable and lets dashboard drill-downs open pages pre-filtered.
 *
 * Conventional keys: department, team, employee, band, role, process,
 * category, pstatus (process status), status, from, to, q, tab, tier.
 */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const values = useMemo(() => {
    const out = {} as Record<K, string>;
    for (const k of keys) out[k] = params.get(k) ?? "";
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, keys.join("|")]);

  const set = useCallback(
    (patch: Partial<Record<K, string | null>>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch) as [string, string | null | undefined][]) {
        if (v === null || v === undefined || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const clear = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    for (const k of keys) next.delete(k);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, pathname, router, keys.join("|")]);

  const activeCount = keys.filter((k) => values[k] && k !== "tab" && k !== "q").length;

  return { values, set, clear, activeCount };
}
