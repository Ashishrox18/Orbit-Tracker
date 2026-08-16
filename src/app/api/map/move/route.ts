import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { mapNodeMoveInput } from "@/lib/mindmap-contracts";
import { moveNode } from "@/services/mindmap";

/**
 * Position saves only. Split from the node route because dragging fires far
 * more often than editing and deserves its own, much higher, rate limit.
 */
export async function POST(request: Request) {
  return handle(request, mapNodeMoveInput, { limit: 600 }, async (input) => {
    const user = await getLocalUser();
    if (!(await moveNode(user, input.id, input.x, input.y))) {
      throw new UserFacingError("That node no longer exists.", 404);
    }
    return { ok: true };
  });
}
