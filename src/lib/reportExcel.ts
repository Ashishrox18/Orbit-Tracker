import ExcelJS from "exceljs";

import type { GrowthReport } from "@/services/reportData";

/**
 * The Excel export. Clean data tables only — no embedded chart objects, which
 * no Node library generates reliably. Conditional-formatting data bars and
 * colour scales carry the "at a glance" visual weight instead.
 */

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEEF2FF" },
};

function styleHeader(worksheet: ExcelJS.Worksheet) {
  const header = worksheet.getRow(1);
  header.font = { bold: true };
  header.fill = HEADER_FILL;
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
}

function percentBar(worksheet: ExcelJS.Worksheet, ref: string) {
  worksheet.addConditionalFormatting({
    ref,
    rules: [
      {
        type: "dataBar",
        priority: 1,
        gradient: false,
        border: false,
        cfvo: [
          { type: "num", value: 0 },
          { type: "num", value: 100 },
        ],
      },
    ],
  });
}

/** A data bar scaled to the actual min/max in the range, for arbitrary counts (not percentages). */
function valueBar(worksheet: ExcelJS.Worksheet, ref: string) {
  worksheet.addConditionalFormatting({
    ref,
    rules: [
      {
        type: "dataBar",
        priority: 1,
        gradient: false,
        border: false,
        cfvo: [
          { type: "min" },
          { type: "max" },
        ],
      },
    ],
  });
}

function colorScale(worksheet: ExcelJS.Worksheet, ref: string) {
  worksheet.addConditionalFormatting({
    ref,
    rules: [
      {
        type: "colorScale",
        priority: 1,
        cfvo: [
          { type: "min" },
          { type: "max" },
        ],
        color: [{ argb: "FFDCFCE7" }, { argb: "FFFECACA" }],
      },
    ],
  });
}

export async function buildReportWorkbook(report: GrowthReport) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Orbit";
  workbook.created = new Date(report.generatedAt);

  buildSummarySheet(workbook, report);
  buildGrowthSheet(workbook, report);
  buildCategorySheet(workbook, report);
  buildTaskTagsSheet(workbook, report);
  buildDifficultiesSheet(workbook, report);
  buildDifficultyTagsSheet(workbook, report);
  buildVocabularySheet(workbook, report);
  buildEvidenceSheet(workbook, report);
  buildPainPointsSheet(workbook, report);

  return workbook.xlsx.writeBuffer();
}

function buildSummarySheet(workbook: ExcelJS.Workbook, report: GrowthReport) {
  const sheet = workbook.addWorksheet("Summary");
  sheet.columns = [
    { header: "Metric", key: "metric", width: 32 },
    { header: "Value", key: "value", width: 24 },
  ];
  styleHeader(sheet);

  const rate = report.summary.completionRate;
  const rows: [string, string | number][] = [
    ["Subject", report.subject],
    ["Range", `${report.range.label} (${report.range.from} to ${report.range.to})`],
    ["Generated", report.generatedAt.slice(0, 10)],
    ["Days tracked", report.summary.daysTracked],
    ["Days with work done", report.summary.activeDays],
    ["Tasks planned", report.summary.plannedTasks],
    ["Tasks completed", report.summary.completedTasks],
    ["Completion rate", rate === null ? "—" : `${Math.round(rate * 100)}%`],
    ["Evidence entries", report.summary.evidenceCount],
    ["Verifiable evidence", report.summary.verifiableCount],
    ["Activity streak (current)", report.streaks.activity.current],
    ["Activity streak (longest)", report.streaks.activity.longest],
    ["Three-wins streak (current)", report.streaks.threeWins.current],
    ["Evidence streak (current)", report.streaks.evidence.current],
    ["Vocabulary learned in range", report.vocabulary.addedInRange],
    ["Vocabulary learned all-time", report.vocabulary.totalAllTime],
    ["Mind map nodes added", report.mindMap.nodesAdded],
    ["Mind map links added", report.mindMap.edgesAdded],
    ["Mind map unconnected nodes", report.mindMap.orphanCount],
    ["Difficulties open", report.difficulties.open],
    ["Difficulties in progress", report.difficulties.inProgress],
    ["Difficulties resolved", report.difficulties.resolved],
    [
      "Avg. days to resolve",
      report.difficulties.avgDaysToResolve === null ? "—" : report.difficulties.avgDaysToResolve,
    ],
    [
      "Review retention",
      report.srs.retention === null ? "—" : `${Math.round(report.srs.retention * 100)}%`,
    ],
    ["Review queue (mature)", report.srs.queue.mature],
    ["Review queue (due now)", report.srs.queue.due],
  ];
  for (const [metric, value] of rows) sheet.addRow({ metric, value });
}

function buildGrowthSheet(workbook: ExcelJS.Workbook, report: GrowthReport) {
  const sheet = workbook.addWorksheet("Growth by period");
  sheet.columns = [
    { header: "Period", key: "period", width: 16 },
    { header: "Tasks planned", key: "tasksPlanned", width: 14 },
    { header: "Tasks completed", key: "tasksCompleted", width: 16 },
    { header: "Completion %", key: "completion", width: 14 },
    { header: "Vocabulary added", key: "vocabAdded", width: 16 },
    { header: "Vocabulary total", key: "vocabCumulative", width: 16 },
    { header: "Evidence", key: "evidence", width: 12 },
    { header: "Mind map nodes added", key: "mapNodes", width: 20 },
  ];
  styleHeader(sheet);

  for (const b of report.buckets) {
    const completion = b.tasksPlanned === 0 ? 0 : Math.round((b.tasksCompleted / b.tasksPlanned) * 100);
    sheet.addRow({
      period: b.label,
      tasksPlanned: b.tasksPlanned,
      tasksCompleted: b.tasksCompleted,
      completion,
      vocabAdded: b.vocabAdded,
      vocabCumulative: b.vocabCumulative,
      evidence: b.evidenceCount,
      mapNodes: b.mindMapNodesAdded,
    });
  }

  const last = report.buckets.length + 1;
  if (report.buckets.length > 0) {
    percentBar(sheet, `D2:D${last}`);
    valueBar(sheet, `F2:F${last}`);
  }
}

function buildCategorySheet(workbook: ExcelJS.Workbook, report: GrowthReport) {
  const sheet = workbook.addWorksheet("Tasks by category");
  sheet.columns = [
    { header: "Category", key: "category", width: 18 },
    { header: "Planned", key: "planned", width: 12 },
    { header: "Completed", key: "completed", width: 12 },
    { header: "Skipped", key: "skipped", width: 12 },
    { header: "Completion %", key: "completion", width: 14 },
  ];
  styleHeader(sheet);

  for (const c of report.tasksByCategory) {
    const completion = c.planned === 0 ? 0 : Math.round((c.completed / c.planned) * 100);
    sheet.addRow({ category: c.category, planned: c.planned, completed: c.completed, skipped: c.skipped, completion });
  }

  const last = report.tasksByCategory.length + 1;
  if (report.tasksByCategory.length > 0) percentBar(sheet, `E2:E${last}`);
}

function buildTaskTagsSheet(workbook: ExcelJS.Workbook, report: GrowthReport) {
  const sheet = workbook.addWorksheet("Tasks by tag");
  sheet.columns = [
    { header: "Tag", key: "tag", width: 26 },
    { header: "Planned", key: "planned", width: 12 },
    { header: "Completed", key: "completed", width: 12 },
    { header: "Completion %", key: "completion", width: 14 },
  ];
  styleHeader(sheet);

  for (const t of report.tasksByTag) {
    const completion = t.planned === 0 ? 0 : Math.round((t.completed / t.planned) * 100);
    sheet.addRow({ tag: t.tag, planned: t.planned, completed: t.completed, completion });
  }

  const last = report.tasksByTag.length + 1;
  if (report.tasksByTag.length > 0) percentBar(sheet, `D2:D${last}`);
}

function buildDifficultiesSheet(workbook: ExcelJS.Workbook, report: GrowthReport) {
  const sheet = workbook.addWorksheet("Difficulties");
  sheet.columns = [
    { header: "Topic", key: "topic", width: 40 },
    { header: "Subject", key: "subject", width: 18 },
    { header: "Status", key: "status", width: 14 },
    { header: "Attempts", key: "attempts", width: 12 },
  ];
  styleHeader(sheet);

  for (const d of report.difficulties.byTopic) {
    sheet.addRow({ topic: d.topic, subject: d.subject, status: d.status, attempts: d.attempts });
  }

  const last = report.difficulties.byTopic.length + 1;
  if (report.difficulties.byTopic.length > 0) colorScale(sheet, `D2:D${last}`);
}

function buildDifficultyTagsSheet(workbook: ExcelJS.Workbook, report: GrowthReport) {
  const sheet = workbook.addWorksheet("Difficulties by tag");
  sheet.columns = [
    { header: "Tag", key: "tag", width: 26 },
    { header: "Count", key: "count", width: 12 },
    { header: "Resolved", key: "resolved", width: 12 },
  ];
  styleHeader(sheet);

  for (const t of report.difficulties.byTag) {
    sheet.addRow({ tag: t.tag, count: t.count, resolved: t.resolved });
  }

  const last = report.difficulties.byTag.length + 1;
  if (report.difficulties.byTag.length > 0) colorScale(sheet, `B2:B${last}`);
}

function buildVocabularySheet(workbook: ExcelJS.Workbook, report: GrowthReport) {
  const sheet = workbook.addWorksheet("Vocabulary");
  sheet.columns = [
    { header: "Word", key: "word", width: 24 },
    { header: "Learned on", key: "learnedOn", width: 16 },
  ];
  styleHeader(sheet);
  for (const v of report.vocabulary.words) sheet.addRow({ word: v.word, learnedOn: v.learnedOn });
}

function buildEvidenceSheet(workbook: ExcelJS.Workbook, report: GrowthReport) {
  const sheet = workbook.addWorksheet("Evidence");
  sheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Title", key: "title", width: 36 },
    { header: "Kind", key: "kind", width: 12 },
    { header: "Category", key: "category", width: 16 },
    { header: "Note", key: "note", width: 40 },
  ];
  styleHeader(sheet);
  for (const e of report.evidence.items) {
    sheet.addRow({
      date: e.date,
      title: e.url ? { text: e.title, hyperlink: e.url } : e.title,
      kind: e.kind,
      category: e.category,
      note: e.note ?? "",
    });
  }
}

function buildPainPointsSheet(workbook: ExcelJS.Workbook, report: GrowthReport) {
  const sheet = workbook.addWorksheet("Pain points");
  sheet.columns = [
    { header: "Severity", key: "severity", width: 12 },
    { header: "Finding", key: "finding", width: 60 },
    { header: "Suggested action", key: "action", width: 60 },
  ];
  styleHeader(sheet);
  for (const p of report.painPoints) {
    sheet.addRow({ severity: p.severity, finding: p.finding, action: p.action ?? "" });
  }
}
