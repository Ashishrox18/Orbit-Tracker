import { z } from "zod";

import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { isoDate } from "@/lib/contracts";
import { ensureLearningSession } from "@/services/learning";

const generateInput = z.object({
  date: isoDate,
  /** Present only when the user picks their own topic; otherwise Orbit chooses. */
  topic: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  return handle(request, generateInput, { limit: 15 }, async (input) => {
    const user = await getLocalUser();
    if (!user.onboardedAt) throw new UserFacingError("Finish onboarding first.", 409);

    const { session, aiUsed } = await ensureLearningSession(
      user,
      input.date,
      input.topic ?? null,
    );
    return { session, aiUsed };
  });
}
