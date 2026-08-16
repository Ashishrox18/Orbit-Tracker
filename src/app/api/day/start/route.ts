import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { startDayInput } from "@/lib/contracts";
import { setPlanSummary, startDay } from "@/services/plans";

/** One deterministic line per mode — no AI call in the planning path at all. */
function summaryFor(examMode: boolean): string {
  return examMode
    ? "Exam mode: preparation, difficult topics and recovery come first."
    : "Three wins, mandatory habits protected, the rest sized to the time you have.";
}

export async function POST(request: Request) {
  return handle(request, startDayInput, { limit: 20 }, async (input) => {
    const user = await getLocalUser();
    if (!user.onboardedAt) throw new UserFacingError("Finish onboarding first.", 409);

    const result = await startDay(user, input);
    const summary = summaryFor(input.examMode);
    await setPlanSummary(result.planId, summary);

    return {
      planId: result.planId,
      theme: result.plan.theme,
      summary,
      rationale: result.plan.rationale,
      unscheduledCount: result.unscheduledCount,
      loadFactor: result.loadFactor,
    };
  });
}
