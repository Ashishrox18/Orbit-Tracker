import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { difficultyCaptureInput, difficultyUpdateInput } from "@/lib/contracts";
import { todayISO } from "@/lib/time";
import { captureDifficulty, updateDifficulty } from "@/services/difficulties";

export async function POST(request: Request) {
  // Tighter limit: this is the only user-triggered route that can reach Groq
  // on every call, so it is the one worth protecting from a refresh loop.
  return handle(request, difficultyCaptureInput, { limit: 20 }, async (input) => {
    const user = await getLocalUser();
    const { difficulty, aiUsed } = await captureDifficulty(user, todayISO(), input);
    return { difficulty, aiUsed };
  });
}

export async function PATCH(request: Request) {
  return handle(request, difficultyUpdateInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();
    const difficulty = await updateDifficulty(user, input);
    if (!difficulty) throw new UserFacingError("That difficulty no longer exists.", 404);
    return { difficulty };
  });
}
