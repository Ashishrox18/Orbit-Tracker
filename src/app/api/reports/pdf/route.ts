import { getLocalUser } from "@/db";
import { buildReportPdf } from "@/lib/reportPdf";
import { resolveRange } from "@/lib/reportRanges";
import { todayISO } from "@/lib/time";
import { buildGrowthReport } from "@/services/reportData";

/** The PDF twin of `/api/report` — same range resolution, hand-drawn charts. */
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
  const doc = buildReportPdf(report);

  const chunks: Buffer[] = [];
  const buffer = await new Promise<Buffer>((resolve) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.end();
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="orbit-report-${range.from}-to-${range.to}.pdf"`,
    },
  });
}
