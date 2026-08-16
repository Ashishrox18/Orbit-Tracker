import { getLocalUser } from "@/db";
import { buildReportWorkbook } from "@/lib/reportExcel";
import { resolveRange } from "@/lib/reportRanges";
import { todayISO } from "@/lib/time";
import { buildGrowthReport } from "@/services/reportData";

/** The Excel twin of `/api/report` — same range resolution, richer sheets. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const range = resolveRange(
    {
      preset: url.searchParams.get("preset") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    },
    todayISO(),
  );

  const user = await getLocalUser();
  const report = await buildGrowthReport(user, range);
  const buffer = await buildReportWorkbook(report);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="orbit-report-${range.from}-to-${range.to}.xlsx"`,
    },
  });
}
