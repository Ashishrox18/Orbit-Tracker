import { z } from "zod";

import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { isoDate } from "@/lib/contracts";
import { ensureRichConcept } from "@/services/learn";

const input = z.object({ date: isoDate, topic: z.string().trim().max(120).optional() });

export async function POST(request: Request) {
  return handle(request, input, { limit: 12 }, async (body) => {
    const user = await getLocalUser();
    if (!user.onboardedAt) throw new UserFacingError("Finish onboarding first.", 409);
    return ensureRichConcept(user, body.date, body.topic ?? null);
  });
}
