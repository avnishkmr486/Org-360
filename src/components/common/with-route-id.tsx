"use client";

import type { ComponentType } from "react";
import { usePath } from "@/hooks/use-path";
import { PLACEHOLDER } from "@/lib/static-params-const";

/**
 * Detail pages get their id from the route. On the static GitHub Pages build, a record created after the build is served
 * through a template page (id "__ID__"); the real id is then read from the browser's address instead.
 */
export function WithRouteId({ Component, prop, id, segment = 1 }: { Component: ComponentType<Record<string, string>>; prop: string; id: string; segment?: number }) {
  const path = usePath();
  const real = id === PLACEHOLDER ? decodeURIComponent(path.split("/")[segment + 1] ?? "") : id;
  return <Component {...{ [prop]: real }} />;
}
