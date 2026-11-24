"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Star, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bulkReview, reviewTask } from "@/lib/repositories";
import { cn } from "@/lib/utils";

export type ReviewDecision = "approve" | "reject";

/** Approve / reject one or many submitted tasks. Rejection requires remarks. */
export function ReviewDialog({
  open,
  onOpenChange,
  taskIds,
  decision,
  subject,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  taskIds: string[];
  decision: ReviewDecision;
  subject?: string;
  onDone?: () => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [score, setScore] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setRemarks("");
      setScore(4);
      setError("");
    }
  }, [open]);

  const many = taskIds.length > 1;
  const approve = decision === "approve";

  const submit = async () => {
    if (!approve && remarks.trim().length < 5) {
      setError("Remarks are required when rejecting (min 5 characters) so the employee knows what to fix.");
      return;
    }
    setBusy(true);
    try {
      if (many) {
        const n = await bulkReview(taskIds, decision, remarks);
        toast.success(`${n} submission${n === 1 ? "" : "s"} ${approve ? "approved" : "rejected"}`, { description: n < taskIds.length ? `${taskIds.length - n} skipped (no longer awaiting review)` : undefined });
      } else {
        await reviewTask(taskIds[0], decision, remarks, approve ? score : undefined);
        toast.success(approve ? "Submission approved" : "Submission rejected", { description: subject });
      }
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error("Review failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {approve ? <CheckCircle2 className="size-5 text-success" /> : <XCircle className="size-5 text-danger" />}
            {approve ? "Approve" : "Reject"} {many ? `${taskIds.length} submissions` : "submission"}
          </DialogTitle>
          <DialogDescription>
            {subject ?? (approve ? "Approved tasks count as completed toward compliance." : "Rejected tasks do not count as completed. The employee is notified with your remarks.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {approve && !many ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Submission quality</Label>
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Quality score">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={score === n} onClick={() => setScore(n)} className="rounded p-0.5" aria-label={`${n} of 5`}>
                    <Star className={cn("size-6", n <= score ? "fill-warning text-warning" : "text-muted-foreground/40")} />
                  </button>
                ))}
                <span className="ml-2 text-xs text-muted-foreground">{["", "Poor", "Fair", "Good", "Very good", "Excellent"][score]}</span>
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="review-remarks" className="text-xs">
              Remarks {approve ? <span className="text-muted-foreground">(optional)</span> : <span className="text-danger">*</span>}
            </Label>
            <Textarea
              id="review-remarks"
              rows={3}
              value={remarks}
              onChange={(e) => {
                setRemarks(e.target.value);
                setError("");
              }}
              placeholder={approve ? "Optional note for the employee" : "Explain what needs to be corrected"}
              aria-invalid={!!error}
            />
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant={approve ? "default" : "destructive"} onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : approve ? <CheckCircle2 /> : <XCircle />}
            {approve ? "Approve" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
