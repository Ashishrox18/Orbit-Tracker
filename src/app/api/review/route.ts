import { getLocalUser } from "@/db";
import { handle } from "@/lib/api";
import { reviewInput } from "@/lib/contracts";
import { submitReview } from "@/services/reviews";

export async function POST(request: Request) {
  return handle(request, reviewInput, { limit: 15 }, async (input) => {
    const user = await getLocalUser();
    const { review, aiUsed } = await submitReview(user, input);
    return { review, aiUsed };
  });
}
