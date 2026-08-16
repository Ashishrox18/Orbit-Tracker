import { eq } from "drizzle-orm";

import { db, getLocalUser } from "@/db";
import { habits, users } from "@/db/schema";
import { handle } from "@/lib/api";
import { onboardingInput } from "@/lib/contracts";

export async function POST(request: Request) {
  return handle(request, onboardingInput, { limit: 10 }, async (input) => {
    const user = await getLocalUser();

    await db
      .update(users)
      .set({
        name: input.name,
        wakeTime: input.wakeTime,
        sleepTime: input.sleepTime,
        dailyHours: input.dailyHours,
        exerciseMinutes: input.exerciseMinutes,
        learningMinutes: input.learningMinutes,
        socialFrequencyDays: input.socialFrequencyDays,
        examMode: input.examMode,
        goals: input.goals,
        subjects: input.subjects,
        examSubjects: input.examSubjects,
        onboardedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Re-running onboarding replaces habits rather than duplicating them.
    await db.delete(habits).where(eq(habits.userId, user.id));
    if (input.habits.length > 0) {
      await db.insert(habits).values(
        input.habits.map((h) => ({
          userId: user.id,
          title: h.title,
          category: h.category,
          durationMinutes: h.durationMinutes,
        })),
      );
    }

    return { ok: true };
  });
}
