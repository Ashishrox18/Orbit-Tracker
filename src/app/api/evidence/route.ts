import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { evidenceCreateInput, evidenceDeleteInput } from "@/lib/evidence-contracts";
import { addEvidence, deleteEvidence } from "@/services/evidence";

export async function POST(request: Request) {
  return handle(request, evidenceCreateInput, { limit: 120 }, async (input) => {
    const user = await getLocalUser();
    return { evidence: await addEvidence(user, input) };
  });
}

export async function DELETE(request: Request) {
  return handle(request, evidenceDeleteInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();
    if (!(await deleteEvidence(user, input.id))) {
      throw new UserFacingError("That entry no longer exists.", 404);
    }
    return { ok: true };
  });
}
