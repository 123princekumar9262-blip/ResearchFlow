import { z } from "zod";

export const id = z.uuid("That item reference is invalid.");
export const isoDate = z.iso.date("Use a valid date.");

/** "" or missing → null; otherwise a valid YYYY-MM-DD. */
export const optionalDate = z
  .union([isoDate, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const optionalId = z
  .union([id, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const title = z.string().trim().min(1, "Give it a title.").max(200, "Keep the title under 200 characters.");
export const longText = (max = 5000) => z.string().trim().max(max, `Keep it under ${max} characters.`).default("");

export const taskStatus = z.enum(["todo", "in_progress", "in_review", "changes_requested", "done"]);
export const taskPriority = z.enum(["low", "medium", "high", "urgent"]);
