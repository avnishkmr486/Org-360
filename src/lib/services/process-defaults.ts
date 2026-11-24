import type { Process } from "@/types";
import { emptyScope } from "./process-scope";

/** The extended process fields (applied-for, meeting, follow-up, …) with neutral defaults. */
export type ProcessExtras = Pick<
  Process,
  | "scope"
  | "meetingDate"
  | "meetingAgenda"
  | "meetingAttendeeIds"
  | "meetingNotes"
  | "followUpDate"
  | "followUpAction"
  | "followUpOwnerId"
  | "nextReviewDate"
  | "lastReviewedOn"
  | "riskLevel"
  | "slaDays"
  | "successMetric"
  | "escalationContactId"
  | "stakeholderIds"
  | "tags"
  | "references"
  | "remarks"
>;

export function defaultProcessExtras(): ProcessExtras {
  return {
    scope: emptyScope(),
    meetingDate: null,
    meetingAgenda: "",
    meetingAttendeeIds: [],
    meetingNotes: "",
    followUpDate: null,
    followUpAction: "",
    followUpOwnerId: null,
    nextReviewDate: null,
    lastReviewedOn: null,
    riskLevel: "medium",
    slaDays: null,
    successMetric: "",
    escalationContactId: null,
    stakeholderIds: [],
    tags: [],
    references: [],
    remarks: "",
  };
}
