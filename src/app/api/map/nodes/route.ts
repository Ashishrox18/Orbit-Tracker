import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import {
  mapNodeCreateInput,
  mapNodeDeleteInput,
  mapNodeUpdateInput,
} from "@/lib/mindmap-contracts";
import { createNode, deleteNode, updateNode } from "@/services/mindmap";

export async function POST(request: Request) {
  return handle(request, mapNodeCreateInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();
    return createNode(user, input);
  });
}

export async function PATCH(request: Request) {
  return handle(request, mapNodeUpdateInput, { limit: 200 }, async (input) => {
    const user = await getLocalUser();
    const node = await updateNode(user, input);
    if (!node) throw new UserFacingError("That node no longer exists.", 404);
    return { node };
  });
}

export async function DELETE(request: Request) {
  return handle(request, mapNodeDeleteInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();
    // Edges cascade with the node, so a delete never leaves a dangling wire.
    if (!(await deleteNode(user, input.id))) {
      throw new UserFacingError("That node no longer exists.", 404);
    }
    return { ok: true };
  });
}
