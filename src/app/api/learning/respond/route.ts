import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { learningResponseInput } from "@/lib/contracts";
import { recordLearningResponse } from "@/services/learning";

export async function POST(request: Request) {
  return handle(request, learningResponseInput, { limit: 40 }, async (input) => {
    const user = await getLocalUser();
    const session = await recordLearningResponse(user, input);
    if (!session) throw new UserFacingError("No learning card exists for that day.", 404);
    return { session };
  });
}
