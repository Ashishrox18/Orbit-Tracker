import { z } from "zod";

import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { isoDate } from "@/lib/contracts";
import { completeWeeklyReview, ensureWeeklyReview } from "@/services/learn";

const generate = z.object({ weekEnding: isoDate });
const complete = z.object({ weekEnding: isoDate, score: z.number().int().min(0).max(100) });

export async function POST(request: Request) {
  return handle(request, generate, { limit: 8 }, async (input) => {
    const user = await getLocalUser();
    if (!user.onboardedAt) throw new UserFacingError("Finish onboarding first.", 409);
    return ensureWeeklyReview(user, input.weekEnding);
  });
}

export async function PATCH(request: Request) {
  return handle(request, complete, { limit: 20 }, async (input) => {
    const user = await getLocalUser();
    const review = await completeWeeklyReview(user, input.weekEnding, input.score);
    if (!review) throw new UserFacingError("No review exists for that week.", 404);
    return { review };
  });
}
