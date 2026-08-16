import { z } from "zod";

/** Evidence and external training links. */

export const EVIDENCE_KINDS = ["link", "file", "metric", "reflection"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_CATEGORIES = [
  "code",
  "writing",
  "study",
  "fitness",
  "career",
  "training",
  "other",
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

/** Only http(s). A javascript: or data: URL has no business in a report. */
const safeUrl = z
  .string()
  .trim()
  .max(2_000)
  .refine((v) => /^https?:\/\//i.test(v), "Must be a http or https link");

export const evidenceCreateInput = z
  .object({
    date: isoDate,
    kind: z.enum(EVIDENCE_KINDS),
    title: z.string().trim().min(1, "Give it a title").max(200),
    url: safeUrl.optional(),
    note: z.string().trim().max(2_000).optional(),
    metricValue: z.number().min(-1e9).max(1e9).optional(),
    metricUnit: z.string().trim().max(24).optional(),
    category: z.enum(EVIDENCE_CATEGORIES).default("other"),
    taskId: z.uuid().optional(),
  })
  // A link with no URL, or a metric with no number, would be evidence of
  // nothing — the shape has to match the kind.
  .refine((v) => (v.kind === "link" || v.kind === "file" ? Boolean(v.url) : true), {
    message: "A link needs a URL",
    path: ["url"],
  })
  .refine((v) => (v.kind === "metric" ? v.metricValue !== undefined : true), {
    message: "A metric needs a number",
    path: ["metricValue"],
  });

export const evidenceDeleteInput = z.object({ id: z.uuid() });

export const trainingLinkInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  url: safeUrl.nullable().optional(),
  trains: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  sortOrder: z.number().int().min(0).max(100).default(0),
});

export const trainingLinkDeleteInput = z.object({ id: z.uuid() });

export const trainingSessionInput = z.object({
  linkId: z.uuid(),
  score: z.number().int().min(0).max(1_000_000),
  level: z.number().int().min(0).max(1_000).default(0),
  durationSeconds: z.number().int().min(0).max(7_200).default(0),
});

export const reportRangeInput = z.object({ from: isoDate, to: isoDate });
