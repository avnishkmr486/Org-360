"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { useDatabase } from "@/hooks/use-data";
import { ENTITIES } from "./entities";

export function MasterDataHome() {
  const db = useDatabase();
  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "Master Data" }]}
        title="Master Data"
        description="Reference data that drives employee records, eligibility rules, process configuration and Excel import validation."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ENTITIES.map((e) => {
          const rows = e.rows(db);
          const active = rows.filter((r) => r.status === "active").length;
          return (
            <Link key={e.slug} href={`/master-data/${e.slug}`} className="card-elevated card-hover group flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between">
                <span className="flex size-10 items-center justify-center rounded-lg bg-teal-soft text-teal">
                  <e.icon className="size-5" />
                </span>
                <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{e.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.description}</p>
              </div>
              <div className="mt-auto flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{rows.length}</span>
                <span className="text-xs text-muted-foreground">
                  records · {active} active{rows.length - active ? ` · ${rows.length - active} inactive` : ""}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
