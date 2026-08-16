import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { mapLinkDeleteInput, mapLinkInput } from "@/lib/mindmap-contracts";
import { acceptLink, linkNodes, proposeLinks, unlinkNodes } from "@/services/mindmap";

export async function POST(request: Request) {
  return handle(request, mapLinkInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();

    if (input.action === "propose") return proposeLinks(user, input.date, input.mapId);

    if (input.action === "accept") {
      if (!(await acceptLink(user, input.id))) {
        throw new UserFacingError("That suggestion no longer exists.", 404);
      }
      return { ok: true };
    }

    const edge = await linkNodes(user, input.fromId, input.toId, input.relationship);
    if (!edge) throw new UserFacingError("A node cannot link to itself.", 400);
    return { edge };
  });
}

export async function DELETE(request: Request) {
  return handle(request, mapLinkDeleteInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();
    if (!(await unlinkNodes(user, input.id))) {
      throw new UserFacingError("That link no longer exists.", 404);
    }
    return { ok: true };
  });
}
