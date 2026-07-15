import type {
    AttendanceOverview,
    AttendanceStats,
    AttendanceStatsFilters,
    AttendanceStatus,
    GenderAttendanceSummary,
    ReportTableDefinition,
    ReportTemplate,
    StudentGender,
} from "../../shared/types";
import { sanitizeReportHtml } from "./report-html-sanitizer";

type ReportCellValue = string | number;
type ReportDataRow = Record<string, ReportCellValue>;

export type ReportExportContext =
    | {
          reportType: "daily";
          date: string;
          overview: AttendanceOverview;
      }
    | {
          reportType: "detailed";
          filters: AttendanceStatsFilters;
          stats: AttendanceStats;
      };

export type ReportExportMetadata = {
    schoolName: string;
    academicYear: number | string;
    academicTerm: number | string;
};

const genderLabels: Record<StudentGender, string> = {
    male: "ชาย",
    female: "หญิง",
    unknown: "ไม่ระบุ",
};

const statusLabels: Record<AttendanceStatus, string> = {
    present: "มา",
    absent: "ขาด",
    late: "สาย",
    leave: "ลา",
};

export function buildReportHtmlDocument(
    template: ReportTemplate,
    context: ReportExportContext,
    metadata: ReportExportMetadata,
): string {
    const config = template.config;
    const orientation =
        config.orientation === "landscape" ? "landscape" : "portrait";
    const pageMarginMm = numberInRange(config.pageMarginMm, 5, 30, 12);
    const fontSizePt = numberInRange(config.fontSizePt, 8, 20, 11);
    const fontFamily = safeFontFamily(config.fontFamily);
    const renderedTables = new Map<string, string>();
    const regions = {
        header: renderRegion(
            config.sections.headerHtml,
            template,
            context,
            metadata,
            renderedTables,
        ),
        content: renderRegion(
            config.sections.contentHtml,
            template,
            context,
            metadata,
            renderedTables,
        ),
        footer: renderRegion(
            config.sections.footerHtml,
            template,
            context,
            metadata,
            renderedTables,
        ),
    };
    const pageHeight = orientation === "landscape" ? 210 : 297;
    const pageWidth = orientation === "landscape" ? 297 : 210;
    return `<!doctype html>
<html lang="th">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(config.title || template.name)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&amp;display=swap" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&amp;display=swap" />
    <style>
        @page { size: A4 ${orientation}; margin: ${pageMarginMm}mm; }
        * { box-sizing: border-box; }
        html { background: #e2e8f0; }
        body { margin: 0; color: #000; font-family: ${fontFamily}; font-size: ${fontSizePt}pt; line-height: 1.45; }
        .report-page { position: relative; display: flex; flex-direction: column; width: ${pageWidth}mm; min-height: ${pageHeight}mm; margin: 12px auto; padding: ${pageMarginMm}mm; background: #fff; box-shadow: 0 10px 30px rgba(15,23,42,.18); overflow: hidden; }
        .report-page, .report-page * { font-family: ${fontFamily} !important; }
        .report-page, .report-page *:not(.draft-watermark) { color: #000 !important; -webkit-text-fill-color: #000 !important; }
        .report-content { flex: 1; }
        .report-region img { max-width: 100%; }
        .report-region table { page-break-inside: auto; }
        .report-region table, .report-region th, .report-region td { border-color: #000 !important; }
        .report-region thead { display: table-header-group; }
        .report-region tr { break-inside: avoid; page-break-inside: avoid; }
        .report-region p { margin: .35em 0; }
        .draft-watermark { position: fixed; inset: 43% 0 auto; z-index: 0; transform: rotate(-28deg); color: rgba(100,116,139,.14) !important; -webkit-text-fill-color: rgba(100,116,139,.14) !important; font: 700 48pt Arial,sans-serif; text-align: center; pointer-events: none; }
        .report-header,.report-content,.report-footer { position: relative; z-index: 1; }
        @media print {
            html,body { background: #fff; }
            .report-page { width: auto; min-height: calc(${pageHeight}mm - ${pageMarginMm * 2}mm); margin: 0; padding: 0; box-shadow: none; overflow: visible; }
        }
    </style>
</head>
<body>
    <article class="report-page">
        ${config.showDraftWatermark ? '<div class="draft-watermark">ฉบับร่าง</div>' : ""}
        <header class="report-region report-header">${regions.header}</header>
        <main class="report-region report-content">${regions.content}</main>
        <footer class="report-region report-footer">${regions.footer}</footer>
    </article>
</body>
</html>`;
}

export function buildReportCsv(
    template: ReportTemplate,
    context: ReportExportContext,
): string {
    const lines: string[][] = [];
    template.config.tables.forEach((table, tableIndex) => {
        if (tableIndex > 0) {
            lines.push([]);
        }
        lines.push([table.name]);
        lines.push(table.columns.map((column) => column.header));
        const rows = reportRows(table, context);
        rows.forEach((row) => {
            lines.push(
                table.columns.map((column) =>
                    String(row[column.valueToken] ?? ""),
                ),
            );
        });
        if (table.showTotals && rows.length > 0) {
            lines.push(
                table.columns.map((column, index) =>
                    index === 0
                        ? "รวม"
                        : String(totalValue(column.valueToken, rows, context)),
                ),
            );
        }
    });
    return `\uFEFF${lines.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function reportFileBaseName(
    template: ReportTemplate,
    context: ReportExportContext,
): string {
    const period =
        context.reportType === "daily"
            ? context.date
            : `${context.filters.dateFrom || "start"}-${context.filters.dateTo || "end"}`;
    return `${template.config.title || template.name}-${period}`
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, "-")
        .slice(0, 120);
}

export function downloadReportText(
    content: string,
    fileName: string,
    mimeType: string,
): void {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function writeReportToPrintWindow(
    target: Window,
    html: string,
): void {
    const printWhenReady = () => {
        void target.document.fonts.ready
            .then(() => {
                target.focus();
                target.print();
            })
            .catch(() => {
                target.focus();
                target.print();
            });
    };
    target.addEventListener("load", printWhenReady, { once: true });
    target.document.open();
    target.document.write(html);
    target.document.close();
}

function renderRegion(
    sourceHtml: string,
    template: ReportTemplate,
    context: ReportExportContext,
    metadata: ReportExportMetadata,
    renderedTables: Map<string, string>,
): string {
    let html = sanitizeReportHtml(sourceHtml);
    const tokens = reportTokens(template, context, metadata);
    Object.entries(tokens).forEach(([token, value]) => {
        html = html.replace(
            new RegExp(escapeRegExp(`{{${token}}}`), "g"),
            () => escapeTokenText(value),
        );
    });
    template.config.tables.forEach((table) => {
        if (!html.includes(`{{table:${table.id}}}`)) {
            return;
        }
        const token = escapeRegExp(`{{table:${table.id}}}`);
        const rendered =
            renderedTables.get(table.id) ?? renderTable(table, context);
        renderedTables.set(table.id, rendered);
        html = html.replace(
            new RegExp(`<p[^>]*>\\s*${token}\\s*</p>`, "gi"),
            () => rendered,
        );
        html = html.replace(new RegExp(token, "g"), () => rendered);
    });
    return html;
}

function reportTokens(
    template: ReportTemplate,
    context: ReportExportContext,
    metadata: ReportExportMetadata,
): Record<string, string> {
    const tokens: Record<string, string> = {
        "school.name": metadata.schoolName,
        "report.title": template.config.title,
        "report.subtitle": template.config.subtitle,
        "academic.year": String(metadata.academicYear),
        "academic.term": String(metadata.academicTerm),
        generatedAt: new Intl.DateTimeFormat("th-TH", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Bangkok",
        }).format(new Date()),
    };
    if (context.reportType === "daily") {
        tokens["report.dateThai"] = thaiDate(context.date);
    } else {
        tokens["report.dateFromThai"] = context.filters.dateFrom
            ? thaiDate(context.filters.dateFrom)
            : "ไม่ระบุ";
        tokens["report.dateToThai"] = context.filters.dateTo
            ? thaiDate(context.filters.dateTo)
            : "ไม่ระบุ";
    }
    return tokens;
}

function renderTable(
    table: ReportTableDefinition,
    context: ReportExportContext,
): string {
    const rows = reportRows(table, context);
    const head = table.showHeader ? renderTableHeader(table) : "";
    const body =
        rows.length > 0
            ? rows
                  .map(
                      (row, rowIndex) =>
                          `<tr>${table.columns
                              .map((column) => {
                                  const value = String(
                                      row[column.valueToken] ?? "",
                                  );
                                  if (
                                      column.mergeRepeatingValues &&
                                      rowIndex > 0 &&
                                      String(
                                          rows[rowIndex - 1][
                                              column.valueToken
                                          ] ?? "",
                                      ) === value
                                  ) {
                                      return "";
                                  }
                                  let rowSpan = 1;
                                  while (
                                      column.mergeRepeatingValues &&
                                      rowIndex + rowSpan < rows.length &&
                                      String(
                                          rows[rowIndex + rowSpan][
                                              column.valueToken
                                          ] ?? "",
                                      ) === value
                                  ) {
                                      rowSpan += 1;
                                  }
                                  return `<td rowspan="${rowSpan}" style="border:1px solid #000;padding:4px;text-align:${column.align};vertical-align:middle">${escapeHtml(value)}</td>`;
                              })
                              .join("")}</tr>`,
                  )
                  .join("")
            : `<tr><td colspan="${Math.max(table.columns.length, 1)}" style="border:1px solid #000;padding:8px;text-align:center">ไม่พบข้อมูล</td></tr>`;
    const foot =
        table.showTotals && rows.length > 0
            ? `<tfoot><tr>${table.columns
                  .map(
                      (column, index) =>
                          `<td style="border:1px solid #000;background:#f1f5f9;padding:4px;text-align:${column.align};font-weight:700">${index === 0 ? "รวม" : escapeHtml(totalValue(column.valueToken, rows, context))}</td>`,
                  )
                  .join("")}</tr></tfoot>`
            : "";
    return `<table style="width:100%;margin:8px 0;border-collapse:collapse;table-layout:fixed;font-size:.9em">${head}<tbody>${body}</tbody>${foot}</table>`;
}

function renderTableHeader(table: ReportTableDefinition): string {
    return `<thead>${Array.from(
        { length: table.headerRowCount },
        (_, rowIndex) =>
            `<tr>${table.headerCells
                .filter((cell) => cell.rowIndex === rowIndex)
                .sort((a, b) => a.columnIndex - b.columnIndex)
                .map((cell) => {
                    const width = table.columns
                        .slice(
                            cell.columnIndex,
                            cell.columnIndex + cell.columnSpan,
                        )
                        .reduce(
                            (sum, column) => sum + column.widthPercent,
                            0,
                        );
                    return `<th rowspan="${cell.rowSpan}" colspan="${cell.columnSpan}" style="width:${width}%;border:1px solid #000;background:#e2e8f0;padding:4px;text-align:center;vertical-align:middle">${escapeHtml(cell.text)}</th>`;
                })
                .join("")}</tr>`,
    ).join("")}</thead>`;
}

function reportRows(
    table: ReportTableDefinition,
    context: ReportExportContext,
): ReportDataRow[] {
    if (context.reportType === "daily") {
        if (table.dataSource === "daily.school") {
            return [
                dailySummaryRow(
                    context.overview.studentCounts.byGender,
                    context.overview.studentCounts.total,
                    context.overview.total,
                    context.overview.totalByGender,
                ),
            ];
        }
        if (table.dataSource === "daily.classes") {
            return context.overview.classes.map((row) => ({
                "class.name": `${row.classRoom.grade}/${row.classRoom.room}`,
                ...dailySummaryRow(
                    row.studentCountByGender,
                    row.studentCount,
                    row.summary,
                    row.summaryByGender,
                ),
            }));
        }
        if (table.dataSource === "daily.statusStudents") {
            return context.overview.attendanceRows.map((row) => ({
                "class.name": row.classRoom
                    ? `${row.classRoom.grade}/${row.classRoom.room}`
                    : "-",
                "student.number": row.student.number,
                "student.code": row.student.studentCode,
                "student.fullName": row.student.fullName,
                "student.gender": genderLabels[row.student.gender],
                "attendance.status": statusLabels[row.status],
            }));
        }
        return [];
    }
    if (table.dataSource !== "detailed.students") {
        return [];
    }
    return context.stats.rows.map((row) => ({
        "class.name": row.classRoom
            ? `${row.classRoom.grade}/${row.classRoom.room}`
            : "-",
        "student.number": row.student.number,
        "student.code": row.student.studentCode,
        "student.fullName": row.student.fullName,
        "student.gender": genderLabels[row.student.gender],
        "present.count": row.summary.present,
        "present.percent": percent(row.summary.present, row.total),
        "absent.count": row.summary.absent,
        "absent.percent": percent(row.summary.absent, row.total),
        "late.count": row.summary.late,
        "late.percent": percent(row.summary.late, row.total),
        "leave.count": row.summary.leave,
        "leave.percent": percent(row.summary.leave, row.total),
        "attendance.total": row.total,
    }));
}

function dailySummaryRow(
    studentsByGender: Record<StudentGender, number>,
    studentTotal: number,
    summary: Record<AttendanceStatus, number>,
    summaryByGender: GenderAttendanceSummary,
): ReportDataRow {
    return {
        "students.male": studentsByGender.male,
        "students.female": studentsByGender.female,
        "students.total": studentTotal,
        "present.male": summaryByGender.male.present,
        "present.female": summaryByGender.female.present,
        "present.total": summary.present,
        "present.percent": percent(summary.present, studentTotal),
        "absent.male": summaryByGender.male.absent,
        "absent.female": summaryByGender.female.absent,
        "absent.total": summary.absent,
        "absent.percent": percent(summary.absent, studentTotal),
        "late.male": summaryByGender.male.late,
        "late.female": summaryByGender.female.late,
        "late.total": summary.late,
        "late.percent": percent(summary.late, studentTotal),
        "leave.male": summaryByGender.male.leave,
        "leave.female": summaryByGender.female.leave,
        "leave.total": summary.leave,
        "leave.percent": percent(summary.leave, studentTotal),
    };
}

function totalValue(
    token: string,
    rows: ReportDataRow[],
    context: ReportExportContext,
): ReportCellValue {
    if (token.endsWith(".percent")) {
        const prefix = token.slice(0, -".percent".length);
        const numeratorToken = `${prefix}.${context.reportType === "daily" ? "total" : "count"}`;
        const denominatorToken =
            context.reportType === "daily"
                ? "students.total"
                : "attendance.total";
        return percent(
            sumRows(rows, numeratorToken),
            sumRows(rows, denominatorToken),
        );
    }
    if (
        /^(students|present|absent|late|leave)\.(male|female|total|count)$/.test(
            token,
        ) ||
        token === "attendance.total"
    ) {
        return sumRows(rows, token);
    }
    return "";
}

function sumRows(rows: ReportDataRow[], token: string): number {
    return rows.reduce((sum, row) => {
        const value = Number(row[token]);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
}

function percent(value: number, total: number): string {
    return total > 0 ? `${((value / total) * 100).toFixed(2)}%` : "0.00%";
}

function thaiDate(date: string): string {
    const value = new Date(`${date}T00:00:00+07:00`);
    return Number.isNaN(value.getTime())
        ? date
        : new Intl.DateTimeFormat("th-TH", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "Asia/Bangkok",
          }).format(value);
}

function csvCell(value: string): string {
    const safeValue = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safeValue.replace(/"/g, '""')}"`;
}

function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeTokenText(value: unknown): string {
    return escapeHtml(value)
        .replace(/\{/g, "&#123;")
        .replace(/\}/g, "&#125;");
}

function numberInRange(
    value: unknown,
    min: number,
    max: number,
    fallback: number,
): number {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max
        ? number
        : fallback;
}

function safeFontFamily(value: unknown): string {
    return value === '"Noto Sans Thai", sans-serif'
        ? value
        : "Sarabun, sans-serif";
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
