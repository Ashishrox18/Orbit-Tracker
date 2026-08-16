import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { taskCreateInput, taskDeleteInput, taskEditInput, taskUpdateInput } from "@/lib/contracts";
import { addTask, deleteTask, editTask, updateTaskStatus } from "@/services/plans";

export async function POST(request: Request) {
  return handle(request, taskCreateInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();
    const task = await addTask(user, input.date, {
      title: input.title,
      category: input.category,
      estimatedMinutes: input.estimatedMinutes,
      priority: input.priority,
      tags: input.tags,
    });
    return { task };
  });
}

export async function PATCH(request: Request) {
  return handle(request, taskUpdateInput, { limit: 120 }, async (input) => {
    const user = await getLocalUser();
    const task = await updateTaskStatus(
      user,
      input.id,
      input.status ?? "pending",
      input.actualMinutes,
    );
    if (!task) throw new UserFacingError("That task no longer exists.", 404);
    return { task };
  });
}

export async function PUT(request: Request) {
  return handle(request, taskEditInput, { limit: 120 }, async (input) => {
    const user = await getLocalUser();
    const task = await editTask(user, input);
    if (!task) throw new UserFacingError("That task no longer exists.", 404);
    return { task };
  });
}

export async function DELETE(request: Request) {
  return handle(request, taskDeleteInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();
    if (!(await deleteTask(user, input.id))) {
      throw new UserFacingError("That task no longer exists.", 404);
    }
    return { ok: true };
  });
}
