import { and, eq, gte } from "drizzle-orm";

import { db, getLocalUser } from "@/db";
import { tasks } from "@/db/schema";
import { fail } from "@/lib/api";
import { painPoints, reportSummary, streaks } from "@/lib/consistency";
import { reportRangeInput } from "@/lib/evidence-contracts";
import { shiftISO, todayISO } from "@/lib/time";
import { listDifficulties } from "@/services/difficulties";
import { evidenceDates, listEvidence } from "@/services/evidence";
import { recentRollups } from "@/services/history";

/**
 * The raw report as JSON. Exists so the data is never locked inside this app —
 * everything the printed page shows is here, plus the rows behind it.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const to = url.searchParams.get("to") ?? todayISO();
  const from = url.searchParams.get("from") ?? shiftISO(to, -89);

  const parsed = reportRangeInput.safeParse({ from, to });
  if (!parsed.success) return fail("Invalid date range.", 400);
  if (parsed.data.from > parsed.data.to) return fail("The range starts after it ends.", 400);

  const user = await getLocalUser();

  const [rollups, evidence, evDates, difficulties, taskRows] = await Promise.all([
    recentRollups(user.id, parsed.data.to, 400),
    listEvidence(user.id, parsed.data.from, parsed.data.to),
    evidenceDates(user.id),
    listDifficulties(user.id),
    db
      .select({ category: tasks.category, status: tasks.status })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, user.id),
          gte(tasks.createdAt, new Date(`${parsed.data.from}T00:00:00Z`)),
        ),
      ),
  ]);

  const inRange = rollups.filter((r) => r.date >= parsed.data.from && r.date <= parsed.data.to);

  const body = {
    generatedAt: new Date().toISOString(),
    subject: user.name,
    range: parsed.data,
    summary: reportSummary(inRange, evidence, parsed.data.from, parsed.data.to),
    streaks: streaks(rollups, evDates, todayISO()),
    painPoints: painPoints({
      rollups: inRange,
      recurringDifficulties: difficulties
        .filter((d) => d.status !== "resolved" && d.attempts >= 2)
        .map((d) => ({ topic: d.topic, attempts: d.attempts })),
      taskOutcomes: taskRows,
      evidenceDates: evDates,
      today: todayISO(),
    }),
    days: inRange,
    evidence: evidence.map((e) => ({
      date: e.date,
      kind: e.kind,
      title: e.title,
      url: e.url,
      note: e.note,
      metricValue: e.metricValue,
      metricUnit: e.metricUnit,
      category: e.category,
      verifiable: e.kind === "link" || e.kind === "file",
    })),
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="orbit-report-${parsed.data.from}-to-${parsed.data.to}.json"`,
    },
  });
}
