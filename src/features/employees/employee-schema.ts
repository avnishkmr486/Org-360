import { z } from "zod";
import type { ISODate } from "@/types";

export const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{7,15}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Free-form business key: letters, digits and - . _ (max 30), e.g. "2011-256" or "EMP-1001". */
export const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/;

/** Validation rules for the Add/Edit employee form. */
export function employeeFormSchema(today: ISODate) {
  return z.object({
    id: z.string().trim().min(1, "Employee ID is required").regex(EMPLOYEE_ID_PATTERN, "Use letters, numbers and - . _ only (max 30), e.g. 2011-256"),
    firstName: z.string().trim().min(1, "First name is required").max(50, "Max 50 characters"),
    lastName: z.string().trim().min(1, "Last name is required").max(50, "Max 50 characters"),
    // Optional: "" = not provided. When given it must be a valid address.
    email: z.string().trim().refine((v) => v === "" || EMAIL_PATTERN.test(v), "Enter a valid email address"),
    // Optional (the Excel import accepts rows without a phone): "" = not provided.
    phone: z.string().trim().refine((v) => v === "" || PHONE_PATTERN.test(v), "Enter a valid phone number, e.g. +91 9812345678"),
    bandId: z.string().min(1, "Select a band"),
    designationId: z.string().nullable(),
    departmentId: z.string().min(1, "Select a department"),
    teamId: z.string().nullable(),
    reportingManagerId: z.string().nullable(),
    dateOfJoining: z
      .string()
      .min(1, "Date of joining is required")
      .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date")
      .refine((v) => v <= today, "Date of joining cannot be in the future"),
    status: z.enum(["active", "on_leave", "inactive"]),
  });
}

export type EmployeeFormValues = z.infer<ReturnType<typeof employeeFormSchema>>;
