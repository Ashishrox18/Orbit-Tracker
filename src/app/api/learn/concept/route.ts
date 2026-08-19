import { z } from "zod";

import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { isoDate } from "@/lib/contracts";
import { ensureRichConcept } from "@/services/learn";

// `force: true` means the user clicked "Choose for me" or "Use my topic"
// explicitly — always regenerate even if a concept exists for today.
const input = z.object({
  date:  isoDate,
  topic: z.string().trim().max(120).optional(),
  force: z.boolean().optional(),
});

export async function POST(request: Request) {
  return handle(request, input, { limit: 12 }, async (body) => {
    const user = await getLocalUser();
    if (!user.onboardedAt) throw new UserFacingError("Finish onboarding first.", 409);
    return ensureRichConcept(user, body.date, body.topic ?? null, body.force ?? false);
  });
}
