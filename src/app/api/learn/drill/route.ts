import { getLocalUser } from "@/db";
import { handle } from "@/lib/api";
import { drillResultInput } from "@/lib/contracts";
import { todayISO } from "@/lib/time";
import { recordDrill } from "@/services/learn";

export async function POST(request: Request) {
  return handle(request, drillResultInput, { limit: 200 }, async (input) => {
    const user = await getLocalUser();
    return { session: await recordDrill(user, todayISO(), input) };
  });
}
