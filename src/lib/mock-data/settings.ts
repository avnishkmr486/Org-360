import type { AppSettings } from "@/types";
import { DEFAULT_THRESHOLDS } from "@/lib/calculations/compliance";

export const settingsSeed: AppSettings = {
  thresholds: { ...DEFAULT_THRESHOLDS },
  dateFormat: "dd MMM yyyy",
  timeZone: "Asia/Kolkata",
  theme: "system",
  brandAccent: "teal",
  reportFooter: "Confidential — for internal management use only.",
  processConfig: {
    defaultThreshold: 90,
    defaultFrequency: "weekly",
    evidenceRequiredByDefault: false,
    approvalRequiredByDefault: false,
    dueSoonDays: 3,
    allowLateSubmission: true,
  },
  notificationPreferences: {
    process_assigned: { inApp: true, email: true },
    due_soon: { inApp: true, email: true },
    overdue: { inApp: true, email: true },
    submission_completed: { inApp: true, email: false },
    submission_rejected: { inApp: true, email: true },
    approval_pending: { inApp: true, email: true },
    below_threshold: { inApp: true, email: true },
  },
};
