import PDFDocument from "pdfkit";

import type { GrowthReport } from "@/services/reportData";

/**
 * The PDF export. Every chart here is hand-drawn with vector primitives —
 * no canvas, no image dependency — so it's exactly as reliable as drawing a
 * rectangle. Excel gets the data tables; this is where the growth curve and
 * the bar charts actually live.
 */

const INK = "#111827";
const INK_SOFT = "#4b5563";
const INK_FAINT = "#6b7280";
const LINE = "#e5e7eb";
const GRID = "#f3f4f6";
const ACCENT = "#4f46e5";
const PHYSICAL = "#16a34a";
const MENTAL = "#2563eb";
const EMOTIONAL = "#db2777";
const DANGER = "#dc2626";

const PAGE_MARGIN = 50;

export function buildReportPdf(report: GrowthReport): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, autoFirstPage: false });

  addCoverPage(doc, report);
  addFiguresPage(doc, report);
  addGrowthChartsPage(doc, report);
  addCategoryChartPage(doc, report);
  addTaskTagsPage(doc, report);
  addDifficultiesPage(doc, report);
  addDifficultyTagsPage(doc, report);
  addPainPointsPage(doc, report);
  addEvidencePage(doc, report);

  return doc;
}

function pageHeader(doc: PDFKit.PDFDocument, title: string, report: GrowthReport): number {
  doc.fontSize(9).fillColor(INK_FAINT).text(`Orbit growth report · ${report.range.label}`, PAGE_MARGIN, 40);
  doc.fontSize(16).fillColor(INK).text(title, PAGE_MARGIN, 58);
  doc
    .moveTo(PAGE_MARGIN, 88)
    .lineTo(doc.page.width - PAGE_MARGIN, 88)
    .strokeColor(LINE)
    .lineWidth(1)
    .stroke();
  return 104;
}

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

/* ---------------------------------------------------------------- cover */

function addCoverPage(doc: PDFKit.PDFDocument, report: GrowthReport) {
  doc.addPage();
  doc.fontSize(26).fillColor(INK).text("Orbit", PAGE_MARGIN, 240);
  doc.fontSize(20).fillColor(INK).text("Growth report", PAGE_MARGIN, 274);
  doc.fontSize(12).fillColor(INK_SOFT).text(report.subject, PAGE_MARGIN, 316);
  doc
    .fontSize(11)
    .fillColor(INK_FAINT)
    .text(`${report.range.label} · ${report.range.from} to ${report.range.to}`, PAGE_MARGIN, 336);
  doc.fontSize(9).fillColor(INK_FAINT).text(`Generated ${report.generatedAt.slice(0, 10)}`, PAGE_MARGIN, 354);

  doc
    .fontSize(9)
    .fillColor(INK_FAINT)
    .text(
      "Completion figures are computed from recorded task outcomes. Entries marked self-reported " +
        "are not independently verifiable; links are.",
      PAGE_MARGIN,
      doc.page.height - 110,
      { width: contentWidth(doc) },
    );
}

/* ------------------------------------------------------------- figures */

function addFiguresPage(doc: PDFKit.PDFDocument, report: GrowthReport) {
  doc.addPage();
  const top = pageHeader(doc, "Headline figures", report);

  const rate = report.summary.completionRate;
  const tiles: { label: string; value: string }[] = [
    { label: "Days tracked", value: String(report.summary.daysTracked) },
    { label: "Days with work done", value: String(report.summary.activeDays) },
    { label: "Completion rate", value: rate === null ? "—" : `${Math.round(rate * 100)}%` },
    { label: "Tasks completed", value: `${report.summary.completedTasks}/${report.summary.plannedTasks}` },
    { label: "Verifiable evidence", value: `${report.summary.verifiableCount}/${report.summary.evidenceCount}` },
    { label: "Vocabulary learned", value: String(report.vocabulary.addedInRange) },
    { label: "Mind map growth", value: `${report.mindMap.nodesAdded} nodes · ${report.mindMap.edgesAdded} links` },
    { label: "Difficulties resolved", value: String(report.difficulties.resolved) },
    { label: "Activity streak", value: `${report.streaks.activity.current} days` },
    { label: "Three-wins streak", value: `${report.streaks.threeWins.current} days` },
    { label: "Evidence streak", value: `${report.streaks.evidence.current} days` },
    {
      label: "Review retention",
      value: report.srs.retention === null ? "—" : `${Math.round(report.srs.retention * 100)}%`,
    },
  ];

  const cols = 3;
  const gap = 14;
  const tileW = (contentWidth(doc) - gap * (cols - 1)) / cols;
  const tileH = 62;

  tiles.forEach((tile, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const tx = PAGE_MARGIN + col * (tileW + gap);
    const ty = top + row * (tileH + gap);
    doc.roundedRect(tx, ty, tileW, tileH, 6).strokeColor(LINE).lineWidth(1).stroke();
    doc.fontSize(15).fillColor(INK).text(tile.value, tx + 10, ty + 12, { width: tileW - 20 });
    doc.fontSize(8).fillColor(INK_FAINT).text(tile.label, tx + 10, ty + 38, { width: tileW - 20 });
  });
}

/* ------------------------------------------------------------ line chart */

interface LineSeries {
  name: string;
  color: string;
  values: number[];
}

function drawLineChart(
  doc: PDFKit.PDFDocument,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    labels: string[];
    series: LineSeries[];
    valueFormatter?: (v: number) => string;
  },
) {
  const { x, y, width, height, labels, series, valueFormatter = (v) => String(Math.round(v)) } = opts;

  // legend
  let lx = x;
  const ly = y - 16;
  for (const s of series) {
    doc.rect(lx, ly, 8, 8).fill(s.color);
    doc.fontSize(8).fillColor(INK).text(s.name, lx + 12, ly - 1);
    lx += 12 + doc.widthOfString(s.name) + 18;
  }

  const maxY = Math.max(1, ...series.flatMap((s) => s.values));

  doc
    .strokeColor(LINE)
    .lineWidth(1)
    .moveTo(x, y)
    .lineTo(x, y + height)
    .lineTo(x + width, y + height)
    .stroke();

  const GRID_LINES = 4;
  for (let i = 0; i <= GRID_LINES; i += 1) {
    const v = (maxY * i) / GRID_LINES;
    const gy = y + height - (i / GRID_LINES) * height;
    doc.strokeColor(GRID).lineWidth(1).moveTo(x, gy).lineTo(x + width, gy).stroke();
    doc.fontSize(7).fillColor(INK_FAINT).text(valueFormatter(v), x - 38, gy - 4, { width: 32, align: "right" });
  }

  if (labels.length >= 2) {
    const stepX = width / (labels.length - 1);

    for (const s of series) {
      doc.strokeColor(s.color).lineWidth(2);
      s.values.forEach((v, i) => {
        const px = x + i * stepX;
        const py = y + height - (v / maxY) * height;
        if (i === 0) doc.moveTo(px, py);
        else doc.lineTo(px, py);
      });
      doc.stroke();

      s.values.forEach((v, i) => {
        const px = x + i * stepX;
        const py = y + height - (v / maxY) * height;
        doc.circle(px, py, 2).fill(s.color);
      });
    }

    const every = Math.max(1, Math.ceil(labels.length / 8));
    labels.forEach((label, i) => {
      if (i % every !== 0 && i !== labels.length - 1) return;
      const px = x + i * stepX;
      doc.save();
      doc.fontSize(7).fillColor(INK_FAINT);
      doc.rotate(-45, { origin: [px, y + height + 12] });
      doc.text(label, px - 22, y + height + 12, { width: 44, lineBreak: false });
      doc.restore();
    });
  }
}

function addGrowthChartsPage(doc: PDFKit.PDFDocument, report: GrowthReport) {
  doc.addPage();
  const top = pageHeader(doc, "Growth over time", report);

  const labels = report.buckets.map((b) => b.label);
  const completionValues = report.buckets.map((b) =>
    b.tasksPlanned === 0 ? 0 : Math.round((b.tasksCompleted / b.tasksPlanned) * 100),
  );
  const vocabValues = report.buckets.map((b) => b.vocabCumulative);

  const chartX = PAGE_MARGIN + 40;
  const chartW = contentWidth(doc) - 40;

  if (report.buckets.length < 2) {
    doc
      .fontSize(10)
      .fillColor(INK_FAINT)
      .text("Not enough periods in this range to draw a curve — pick a longer range.", PAGE_MARGIN, top + 20);
    return;
  }

  drawLineChart(doc, {
    x: chartX,
    y: top + 30,
    width: chartW,
    height: 150,
    labels,
    series: [{ name: "Task completion rate", color: ACCENT, values: completionValues }],
    valueFormatter: (v) => `${Math.round(v)}%`,
  });

  const secondTop = top + 30 + 150 + 60;
  drawLineChart(doc, {
    x: chartX,
    y: secondTop,
    width: chartW,
    height: 150,
    labels,
    series: [{ name: "Vocabulary learned (cumulative)", color: MENTAL, values: vocabValues }],
  });
}

/* ---------------------------------------------------------------- bars */

interface BarSeries {
  name: string;
  color: string;
  values: number[];
}

function drawGroupedBarChart(
  doc: PDFKit.PDFDocument,
  opts: { x: number; y: number; width: number; height: number; categories: string[]; series: BarSeries[] },
) {
  const { x, y, width, height, categories, series } = opts;

  let lx = x;
  const ly = y - 16;
  for (const s of series) {
    doc.rect(lx, ly, 8, 8).fill(s.color);
    doc.fontSize(8).fillColor(INK).text(s.name, lx + 12, ly - 1);
    lx += 12 + doc.widthOfString(s.name) + 18;
  }

  const maxY = Math.max(1, ...series.flatMap((s) => s.values));

  doc
    .strokeColor(LINE)
    .lineWidth(1)
    .moveTo(x, y)
    .lineTo(x, y + height)
    .lineTo(x + width, y + height)
    .stroke();

  const GRID_LINES = 4;
  for (let i = 0; i <= GRID_LINES; i += 1) {
    const v = (maxY * i) / GRID_LINES;
    const gy = y + height - (i / GRID_LINES) * height;
    doc.strokeColor(GRID).lineWidth(1).moveTo(x, gy).lineTo(x + width, gy).stroke();
    doc.fontSize(7).fillColor(INK_FAINT).text(String(Math.round(v)), x - 34, gy - 4, { width: 28, align: "right" });
  }

  if (categories.length === 0) return;

  const slotW = width / categories.length;
  const barW = (slotW * 0.6) / Math.max(1, series.length);

  categories.forEach((cat, ci) => {
    const slotX = x + ci * slotW + slotW * 0.2;
    series.forEach((s, si) => {
      const v = s.values[ci] ?? 0;
      const barH = (v / maxY) * height;
      const bx = slotX + si * barW;
      doc.fillColor(s.color).rect(bx, y + height - barH, Math.max(1, barW - 2), barH).fill();
      if (v > 0) {
        doc.fontSize(6).fillColor(INK_SOFT).text(String(v), bx - 4, y + height - barH - 9, {
          width: barW + 8,
          align: "center",
        });
      }
    });
    doc.fontSize(7).fillColor(INK_SOFT).text(cat, x + ci * slotW, y + height + 6, { width: slotW, align: "center" });
  });
}

function addCategoryChartPage(doc: PDFKit.PDFDocument, report: GrowthReport) {
  doc.addPage();
  const top = pageHeader(doc, "Tasks by category", report);

  if (report.tasksByCategory.length === 0) {
    doc.fontSize(10).fillColor(INK_FAINT).text("No tasks recorded in this range.", PAGE_MARGIN, top + 20);
    return;
  }

  drawGroupedBarChart(doc, {
    x: PAGE_MARGIN + 34,
    y: top + 30,
    width: contentWidth(doc) - 34,
    height: 220,
    categories: report.tasksByCategory.map((c) => c.category),
    series: [
      { name: "Planned", color: LINE_ACCENT_MUTED, values: report.tasksByCategory.map((c) => c.planned) },
      { name: "Completed", color: PHYSICAL, values: report.tasksByCategory.map((c) => c.completed) },
    ],
  });
}

const LINE_ACCENT_MUTED = "#c7d2fe";

/* --------------------------------------------------------- difficulties */

function drawHorizontalBarChart(
  doc: PDFKit.PDFDocument,
  opts: { x: number; y: number; width: number; barHeight: number; gap: number; items: { label: string; value: number }[]; color: string },
) {
  const { x, y, width, barHeight, gap, items, color } = opts;
  const maxV = Math.max(1, ...items.map((i) => i.value));
  const labelWidth = 200;
  const chartX = x + labelWidth;
  const chartWidth = width - labelWidth - 30;

  items.forEach((item, i) => {
    const by = y + i * (barHeight + gap);
    doc.fontSize(8).fillColor(INK).text(item.label, x, by + 3, { width: labelWidth - 8, ellipsis: true, lineBreak: false });
    const barW = (item.value / maxV) * chartWidth;
    doc.fillColor(color).rect(chartX, by, Math.max(1, barW), barHeight).fill();
    doc.fontSize(8).fillColor(INK_SOFT).text(String(item.value), chartX + barW + 6, by + 3);
  });
}

function addTaskTagsPage(doc: PDFKit.PDFDocument, report: GrowthReport) {
  doc.addPage();
  const top = pageHeader(doc, "Tasks by tag", report);

  const topTags = [...report.tasksByTag].sort((a, b) => b.planned - a.planned).slice(0, 12);

  if (topTags.length === 0) {
    doc.fontSize(10).fillColor(INK_FAINT).text("No tagged tasks in this range.", PAGE_MARGIN, top + 20);
    return;
  }

  doc
    .fontSize(9)
    .fillColor(INK_SOFT)
    .text("Bar length is tasks planned under that tag — the number after it is planned, not completed.", PAGE_MARGIN, top);

  drawHorizontalBarChart(doc, {
    x: PAGE_MARGIN,
    y: top + 24,
    width: contentWidth(doc),
    barHeight: 14,
    gap: 8,
    items: topTags.map((t) => ({ label: t.tag, value: t.planned })),
    color: ACCENT,
  });
}

function addDifficultyTagsPage(doc: PDFKit.PDFDocument, report: GrowthReport) {
  doc.addPage();
  const top = pageHeader(doc, "Difficulties by tag", report);

  const topTags = [...report.difficulties.byTag].sort((a, b) => b.count - a.count).slice(0, 12);

  if (topTags.length === 0) {
    doc.fontSize(10).fillColor(INK_FAINT).text("No tagged difficulties in this range.", PAGE_MARGIN, top + 20);
    return;
  }

  drawHorizontalBarChart(doc, {
    x: PAGE_MARGIN,
    y: top + 20,
    width: contentWidth(doc),
    barHeight: 14,
    gap: 8,
    items: topTags.map((t) => ({ label: t.tag, value: t.count })),
    color: MENTAL,
  });
}

function addDifficultiesPage(doc: PDFKit.PDFDocument, report: GrowthReport) {
  doc.addPage();
  const top = pageHeader(doc, "Difficulty topics", report);

  doc
    .fontSize(9)
    .fillColor(INK_SOFT)
    .text(
      `${report.difficulties.open} open · ${report.difficulties.inProgress} in progress · ${report.difficulties.resolved} resolved` +
        (report.difficulties.avgDaysToResolve !== null
          ? ` · ${report.difficulties.avgDaysToResolve} days to resolve on average`
          : ""),
      PAGE_MARGIN,
      top,
    );

  const topTopics = [...report.difficulties.byTopic]
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 12);

  if (topTopics.length === 0) {
    doc.fontSize(10).fillColor(INK_FAINT).text("No difficulties captured in this range.", PAGE_MARGIN, top + 30);
    return;
  }

  drawHorizontalBarChart(doc, {
    x: PAGE_MARGIN,
    y: top + 34,
    width: contentWidth(doc),
    barHeight: 14,
    gap: 8,
    items: topTopics.map((t) => ({ label: `${t.topic} (${t.subject})`, value: t.attempts })),
    color: EMOTIONAL,
  });
}

/* --------------------------------------------------------- pain points */

function addPainPointsPage(doc: PDFKit.PDFDocument, report: GrowthReport) {
  doc.addPage();
  let y = pageHeader(doc, "Where it leaks", report);

  const severityColor: Record<string, string> = { high: DANGER, medium: "#d97706", low: INK_FAINT };

  for (const p of report.painPoints) {
    doc.circle(PAGE_MARGIN + 3, y + 5, 3).fill(severityColor[p.severity] ?? INK_FAINT);
    doc.fontSize(10).fillColor(INK).text(p.finding, PAGE_MARGIN + 14, y, { width: contentWidth(doc) - 14 });
    y = doc.y + 2;
    if (p.action) {
      doc.fontSize(9).fillColor(INK_SOFT).text(p.action, PAGE_MARGIN + 14, y, { width: contentWidth(doc) - 14 });
      y = doc.y;
    }
    y += 14;
  }
}

/* -------------------------------------------------------------- evidence */

function addEvidencePage(doc: PDFKit.PDFDocument, report: GrowthReport) {
  doc.addPage();
  let y = pageHeader(doc, "Evidence", report);

  if (report.evidence.items.length === 0) {
    doc.fontSize(10).fillColor(INK_FAINT).text("Nothing recorded in this range.", PAGE_MARGIN, y);
    return;
  }

  for (const item of report.evidence.items) {
    if (y > doc.page.height - 80) {
      doc.addPage();
      y = pageHeader(doc, "Evidence (continued)", report);
    }

    doc.fontSize(8).fillColor(INK_FAINT).text(item.date, PAGE_MARGIN, y, { width: 60 });
    const titleX = PAGE_MARGIN + 65;
    const titleWidth = contentWidth(doc) - 65 - 90;
    doc.fontSize(9).fillColor(item.url ? ACCENT : INK).text(item.title, titleX, y, { width: titleWidth });
    if (item.url) doc.link(titleX, y, titleWidth, 12, item.url);
    doc.fontSize(8).fillColor(INK_FAINT).text(item.category, PAGE_MARGIN + contentWidth(doc) - 80, y, { width: 80, align: "right" });
    y = doc.y + 6;
  }
}
