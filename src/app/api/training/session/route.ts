import { getLocalUser } from "@/db";
import { handle } from "@/lib/api";
import { trainingSessionInput } from "@/lib/evidence-contracts";
import { todayISO } from "@/lib/time";
import { recordTrainingSession } from "@/services/evidence";

export async function POST(request: Request) {
  return handle(request, trainingSessionInput, { limit: 200 }, async (input) => {
    const user = await getLocalUser();
    return { session: await recordTrainingSession(user, todayISO(), input) };
  });
}
