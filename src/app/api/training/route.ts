import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { trainingLinkDeleteInput, trainingLinkInput } from "@/lib/evidence-contracts";
import { deleteTrainingLink, upsertTrainingLink } from "@/services/evidence";

export async function POST(request: Request) {
  return handle(request, trainingLinkInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();
    return { link: await upsertTrainingLink(user, input) };
  });
}

export async function DELETE(request: Request) {
  return handle(request, trainingLinkDeleteInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();
    if (!(await deleteTrainingLink(user, input.id))) {
      throw new UserFacingError("That link no longer exists.", 404);
    }
    return { ok: true };
  });
}
