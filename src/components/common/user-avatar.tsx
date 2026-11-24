import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils/format";
import { hashString } from "@/lib/utils/random";

const PALETTE = [
  "bg-[#e3ecfb] text-[#1d4ed8] dark:bg-[#1e3a8a]/40 dark:text-[#93c5fd]",
  "bg-[#ddf4f1] text-[#0f766e] dark:bg-[#134e4a]/50 dark:text-[#5eead4]",
  "bg-[#fdebd8] text-[#b45309] dark:bg-[#78350f]/40 dark:text-[#fcd34d]",
  "bg-[#ece8fb] text-[#5b21b6] dark:bg-[#4c1d95]/40 dark:text-[#c4b5fd]",
  "bg-[#fde4ec] text-[#be185d] dark:bg-[#831843]/40 dark:text-[#f9a8d4]",
  "bg-[#e2f3e5] text-[#15803d] dark:bg-[#14532d]/40 dark:text-[#86efac]",
];

export function UserAvatar({ name, size = "md", className }: { name: string; size?: "xs" | "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sizes = { xs: "size-6 text-[10px]", sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-12 text-sm", xl: "size-16 text-lg" };
  return (
    <span className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold", sizes[size], PALETTE[hashString(name) % PALETTE.length], className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function PersonCell({ name, sub, size = "sm" }: { name: string; sub?: string; size?: "xs" | "sm" | "md" }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <UserAvatar name={name} size={size} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{name}</div>
        {sub ? <div className="truncate text-xs text-muted-foreground">{sub}</div> : null}
      </div>
    </div>
  );
}
