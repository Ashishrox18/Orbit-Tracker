import { z } from "zod";
import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { isoDate } from "@/lib/contracts";
import { weeklyMaterial } from "@/services/learn";

// GET-equivalent via POST — return this week's material as a plain list, no AI
const input = z.object({ weekEnding: isoDate });

export async function POST(request: Request) {
  return handle(request, input, { limit: 60 }, async (body) => {
    const user = await getLocalUser();
    if (!user.onboardedAt) throw new UserFacingError("Finish onboarding first.", 409);
    const material = await weeklyMaterial(user.id, body.weekEnding);
    return {
      review: {
        synthesis: null,
        questions: [
          ...material.words.map((w) => ({ prompt: `What does "${w}" mean?`, answer: "", source: "vocabulary" })),
          ...material.concepts.map((c) => ({ prompt: `Explain: ${c}`, answer: "", source: "concept" })),
        ],
        wordCount:    material.words.length,
        conceptCount: material.concepts.length,
      },
    };
  });
}
