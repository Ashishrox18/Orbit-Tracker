import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { vocabRequestInput, vocabSentenceInput } from "@/lib/contracts";
import { todayISO } from "@/lib/time";
import { ensureVocabulary, submitSentence } from "@/services/learn";

export async function POST(request: Request) {
  return handle(request, vocabRequestInput, { limit: 12 }, async (input) => {
    const user = await getLocalUser();
    if (!user.onboardedAt) throw new UserFacingError("Finish onboarding first.", 409);
    return ensureVocabulary(user, input.date, input.count);
  });
}

export async function PATCH(request: Request) {
  return handle(request, vocabSentenceInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();
    const result = await submitSentence(user, input.id, input.sentence);
    if (!result) throw new UserFacingError("That word no longer exists.", 404);
    void todayISO();
    return result;
  });
}
