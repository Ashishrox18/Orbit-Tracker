import { eq } from "drizzle-orm";

import { db, getLocalUser } from "@/db";
import { habits, users } from "@/db/schema";
import { handle } from "@/lib/api";
import { settingsInput } from "@/lib/contracts";

export async function PATCH(request: Request) {
  return handle(request, settingsInput, { limit: 30 }, async (input) => {
    const user = await getLocalUser();

    // Build the update from provided keys only, so a partial save never blanks
    // a field the form didn't render.
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const scalarKeys = [
      "name",
      "wakeTime",
      "sleepTime",
      "dailyHours",
      "exerciseMinutes",
      "learningMinutes",
      "socialFrequencyDays",
      "examMode",
      "goals",
      "subjects",
      "examSubjects",
    ] as const;

    for (const key of scalarKeys) {
      const value = input[key];
      if (value !== undefined) patch[key] = value;
    }

    await db.update(users).set(patch).where(eq(users.id, user.id));

    if (input.habits !== undefined) {
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
    }

    return { ok: true };
  });
}
