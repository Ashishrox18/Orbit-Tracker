import { getLocalUser } from "@/db";
import { handle } from "@/lib/api";
import { feynmanInput } from "@/lib/contracts";
import { runFeynman } from "@/services/learn";

export async function POST(request: Request) {
  return handle(request, feynmanInput, { limit: 30 }, async (input) => {
    const user = await getLocalUser();
    return runFeynman(user, input.date, input.explanation);
  });
}
