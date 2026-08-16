import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { reviewGradeInput } from "@/lib/contracts";
import { todayISO } from "@/lib/time";
import { gradeReview } from "@/services/learn";

export async function POST(request: Request) {
  // Grading is local arithmetic, never an AI call, so the limit is generous.
  return handle(request, reviewGradeInput, { limit: 300 }, async (input) => {
    const user = await getLocalUser();
    const item = await gradeReview(user.id, input.id, input.grade, todayISO());
    if (!item) throw new UserFacingError("That review item no longer exists.", 404);
    return { item };
  });
}
