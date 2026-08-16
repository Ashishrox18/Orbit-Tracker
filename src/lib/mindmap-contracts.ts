import { z } from "zod";

import { MIND_DOMAINS } from "./domains";

/** Mind map API inputs. Kept apart from contracts.ts, which is already large. */

const title = z.string().trim().min(1).max(200);

export const mapCreateInput = z.object({ name: title });
export const mapRenameInput = z.object({ id: z.uuid(), name: title });
export const mapDeleteInput = z.object({ id: z.uuid() });

export const mapNodeCreateInput = z.object({
  mapId: z.uuid().optional(),
  title,
  domain: z.enum(MIND_DOMAINS).default("abstract"),
  notes: z.string().trim().max(8_000).optional(),
  autoSummary: z.boolean().default(true),
});

export const mapNodeUpdateInput = z.object({
  id: z.uuid(),
  title: title.optional(),
  domain: z.enum(MIND_DOMAINS).optional(),
  notes: z.string().trim().max(8_000).optional(),
  summary: z.string().trim().max(2_000).optional(),
  // Empty string clears it — the panel has one field, not a value/clear pair.
  resourceUrl: z.union([z.literal(""), z.string().trim().url().max(500)]).optional(),
});

/** Dragging is high-frequency, so position saves get their own tiny payload. */
export const mapNodeMoveInput = z.object({
  id: z.uuid(),
  x: z.number().min(-20_000).max(20_000),
  y: z.number().min(-20_000).max(20_000),
});

export const mapNodeDeleteInput = z.object({ id: z.uuid() });

export const mapLinkInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    fromId: z.uuid(),
    toId: z.uuid(),
    relationship: z.string().trim().min(2).max(80).default("relates to"),
  }),
  z.object({
    action: z.literal("propose"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mapId: z.uuid().optional(),
  }),
  z.object({ action: z.literal("accept"), id: z.uuid() }),
]);

export const mapLinkDeleteInput = z.object({ id: z.uuid() });
