import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { mapCreateInput, mapDeleteInput, mapRenameInput } from "@/lib/mindmap-contracts";
import { createMap, deleteMap, renameMap } from "@/services/mindmap";

export async function POST(request: Request) {
  return handle(request, mapCreateInput, { limit: 30 }, async (input) => {
    const user = await getLocalUser();
    return { map: await createMap(user, input.name) };
  });
}

export async function PATCH(request: Request) {
  return handle(request, mapRenameInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();
    const map = await renameMap(user, input.id, input.name);
    if (!map) throw new UserFacingError("That map no longer exists.", 404);
    return { map };
  });
}

export async function DELETE(request: Request) {
  return handle(request, mapDeleteInput, { limit: 30 }, async (input) => {
    const user = await getLocalUser();
    const result = await deleteMap(user, input.id);
    if (result === "not-found") throw new UserFacingError("That map no longer exists.", 404);
    if (result === "universal") {
      throw new UserFacingError("The universal map can't be deleted — it's the one that never resets.", 400);
    }
    return { ok: true };
  });
}
