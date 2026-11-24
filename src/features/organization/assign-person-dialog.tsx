"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox, type Option } from "@/components/common/filters";

/** Generic "assign a person to a role" dialog (department head, supervisor, PM). */
export function AssignPersonDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  options,
  currentId,
  onSave,
  successMessage,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  label: string;
  options: Option[];
  currentId: string | null;
  onSave: (id: string | null) => Promise<void>;
  successMessage: string;
}) {
  const [value, setValue] = useState<string | null>(currentId);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setValue(currentId);
  }, [open, currentId]);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>{label}</Label>
          <Combobox value={value} onChange={setValue} options={options} placeholder="Select employee" searchPlaceholder="Search employees…" />
          <p className="text-xs text-muted-foreground">Clear the selection to leave this position unassigned.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || value === currentId}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(value);
                toast.success(successMessage);
                onOpenChange(false);
              } catch (err) {
                toast.error("Assignment failed", { description: err instanceof Error ? err.message : String(err) });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            Save assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
