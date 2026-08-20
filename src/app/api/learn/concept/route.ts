import { z } from "zod";
import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { isoDate } from "@/lib/contracts";
import { saveConceptManual } from "@/services/learn";

// POST — save a concept topic (user writes their own explanation in Feynman box)
const input = z.object({
  date:  isoDate,
  topic: z.string().trim().min(1).max(120),
});

export async function POST(request: Request) {
  return handle(request, input, { limit: 60 }, async (body) => {
    const user = await getLocalUser();
    if (!user.onboardedAt) throw new UserFacingError("Finish onboarding first.", 409);
    const session = await saveConceptManual(user, body.date, body.topic);
    return { session };
  });
}

// PATCH — save the user's own explanation (Feynman box, no AI grading)
const explainInput = z.object({
  date:        isoDate,
  explanation: z.string().trim().min(1).max(5000),
});

export async function PATCH(request: Request) {
  return handle(request, explainInput, { limit: 60 }, async (body) => {
    const user = await getLocalUser();
    if (!user.onboardedAt) throw new UserFacingError("Finish onboarding first.", 409);
    const session = await saveConceptExplanation(user.id, body.date, body.explanation);
    if (!session) throw new UserFacingError("No concept card for today.", 404);
    return { session };
  });
}

import { db } from "@/db";
import { learningSessions } from "@/db/schema";
import { and, eq } from "drizzle-orm";

async function saveConceptExplanation(userId: string, date: string, explanation: string) {
  const updated = await db
    .update(learningSessions)
    .set({ userResponse: explanation })
    .where(and(eq(learningSessions.userId, userId), eq(learningSessions.date, date)))
    .returning();
  return updated[0] ?? null;
}
