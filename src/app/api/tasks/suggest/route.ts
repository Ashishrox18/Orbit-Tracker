import { z } from "zod";

import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { isoDate } from "@/lib/contracts";
import { todayISO } from "@/lib/time";
import { getDayView } from "@/services/plans";
import { applySuggestions, suggestTasks } from "@/services/suggestions";

const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suggest"),
    intent: z.string().trim().min(2, "Say what you want to do").max(200),
  }),
  z.object({
    action: z.literal("apply"),
    date: isoDate,
    batchIds: z.array(z.uuid()).min(1).max(8),
    chosenIds: z.array(z.uuid()).max(8),
  }),
]);

export async function POST(request: Request) {
  // Suggesting always costs a Groq call, so it carries the tighter limit.
  return handle(request, body, { limit: 30 }, async (input) => {
    const user = await getLocalUser();
    if (!user.onboardedAt) throw new UserFacingError("Finish onboarding first.", 409);

    if (input.action === "apply") {
      return applySuggestions(user, input.date, input.batchIds, input.chosenIds);
    }

    const today = todayISO();
    const day = await getDayView(user, today, new Date().toTimeString().slice(0, 5));

    return suggestTasks(user, input.intent, {
      goals: user.goals,
      subjects: user.subjects,
      examMode: user.examMode,
      existingTitles: day.tasks.map((t) => t.title),
    });
  });
}
