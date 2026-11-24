"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import type { AppRole } from "@/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDatabase } from "@/hooks/use-data";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { isMenuLocked, navForRole, navKey } from "@/lib/navigation";
import { updateSettings } from "@/lib/repositories";

const ROLES = Object.keys(ROLE_LABELS) as AppRole[];

/** Super Admin: choose, per role, which side-menu entries are shown. */
export function MenuConfigPanel() {
  const db = useDatabase();
  const [role, setRole] = useState<AppRole>("administrator");
  const saved = db.settings.menuHidden?.[role] ?? [];
  const [draft, setDraft] = useState<string[]>(saved);
  const [saving, setSaving] = useState(false);

  // Everything this role is allowed to open — the menu before any hiding.
  const base = navForRole(role);
  const dirty = draft.length !== saved.length || draft.some((k) => !saved.includes(k));

  const pick = (r: AppRole) => {
    setRole(r);
    setDraft(db.settings.menuHidden?.[r] ?? []);
  };
  const setHidden = (key: string, hide: boolean) => setDraft((d) => (hide ? [...new Set([...d, key])] : d.filter((k) => k !== key)));

  const save = async (next: string[]) => {
    setSaving(true);
    try {
      const menuHidden = { ...db.settings.menuHidden };
      if (next.length) menuHidden[role] = next;
      else delete menuHidden[role];
      await updateSettings({ menuHidden }, `Side menu for ${ROLE_LABELS[role]} updated (${next.length} hidden).`);
      setDraft(next);
      toast.success(`Menu saved for ${ROLE_LABELS[role]}`, { description: next.length ? `${next.length} entr${next.length === 1 ? "y" : "ies"} hidden.` : "Default menu restored." });
    } catch (e) {
      toast.error("Could not save the menu", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card-elevated fade-in">
      <header className="border-b px-6 py-4">
        <h2 className="text-base font-semibold">Menu Configuration</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Choose which side-menu entries each role sees. Turning an entry off only hides it from the menu — what a role is allowed to open is still decided by its permissions.
        </p>
      </header>
      <div className="space-y-4 px-6 py-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-sm font-medium">Role</span>
          <Select value={role} onValueChange={(v) => pick(v as AppRole)}>
            <SelectTrigger className="w-full sm:w-64" aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                  {(db.settings.menuHidden?.[r]?.length ?? 0) > 0 ? " · customised" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-4">
          {base.map((section) => (
            <div key={section.label} className="overflow-hidden rounded-lg border">
              <div className="border-b bg-muted/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section.label}</div>
              <ul className="divide-y">
                {section.items.map((item) => {
                  const key = navKey(item);
                  const locked = isMenuLocked(role, key);
                  const hidden = draft.includes(key) && !locked;
                  return (
                    <li key={key} className="px-4 py-2.5">
                      <div className="flex items-center gap-3 text-sm">
                        <item.icon className="size-4 text-muted-foreground" />
                        <span className="flex-1 font-medium">{item.title}</span>
                        {locked ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Lock className="size-3" /> Always shown
                          </span>
                        ) : null}
                        <Switch checked={!hidden} onCheckedChange={(on) => setHidden(key, !on)} disabled={locked} aria-label={`Show ${item.title}`} />
                      </div>
                      {item.children?.length ? (
                        <ul className="mt-2 space-y-1.5 border-l pl-4 ml-2">
                          {item.children.map((c) => {
                            const ck = navKey(item, c);
                            return (
                              <li key={ck} className="flex items-center gap-3 text-sm">
                                <span className={hidden ? "flex-1 text-muted-foreground/60" : "flex-1 text-muted-foreground"}>{c.title}</span>
                                <Switch checked={!draft.includes(ck) && !hidden} onCheckedChange={(on) => setHidden(ck, !on)} disabled={hidden} aria-label={`Show ${c.title} under ${item.title}`} />
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t bg-muted/30 px-6 py-3">
        <Button variant="ghost" size="sm" disabled={saving || (draft.length === 0 && saved.length === 0)} onClick={() => save([])}>
          Reset {ROLE_LABELS[role]} to default
        </Button>
        <Button size="sm" disabled={saving || !dirty} onClick={() => save(draft)}>
          Save menu
        </Button>
      </footer>
    </section>
  );
}
