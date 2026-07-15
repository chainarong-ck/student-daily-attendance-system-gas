import type {
    CopyReportTemplatesPayload,
    ReportTemplate,
    ReportTemplateConfig,
    ReportTableDataSource,
    ReportTableDefinition,
    ReportTableHeaderCell,
    ReportType,
} from "../shared/types";
import { AcademicYearService } from "./AcademicYearService";
import { ServerConstant } from "./ServerConstant";
import { ServerUtils } from "./ServerUtils";
import { SheetDatabase } from "./SheetDatabase";

export class ReportTemplateService {
    static list(
        database: SheetDatabase = AcademicYearService.ensureCurrentSheet(),
    ): ReportTemplate[] {
        return this.sortTemplates(
            database
                .readObjects("ReportTemplates")
                .map((row) => this.fromRow(row)),
        );
    }

    static listEnabled(
        database: SheetDatabase = AcademicYearService.ensureCurrentSheet(),
    ): ReportTemplate[] {
        return this.list(database).filter((template) => template.enabled);
    }

    static save(
        rows: ReportTemplate[],
        database: SheetDatabase = AcademicYearService.ensureCurrentSheet(),
        existingRows?: ReportTemplate[],
    ): ReportTemplate[] {
        ServerUtils.assert(Array.isArray(rows), "ข้อมูลเทมเพลตไม่ถูกต้อง");
        const existingIds = new Set(
            (existingRows ?? this.list(database)).map(
                (template) => template.id,
            ),
        );
        const normalized = this.normalizeRows(rows, existingIds);
        database.writeObjects(
            "ReportTemplates",
            normalized.map((template) => this.toRow(template)),
        );
        return this.sortTemplates(normalized);
    }

    static listForAcademicYear(key: string): ReportTemplate[] {
        return this.list(AcademicYearService.getSheetForAcademicYearKey(key));
    }

    static copyFromAcademicYear(
        payload: CopyReportTemplatesPayload,
    ): ReportTemplate[] {
        const sourceKey = ServerUtils.normalizeText(
            payload.sourceAcademicYearKey,
        );
        const targetContext = AcademicYearService.requireCurrentContext(
            payload.targetAcademicYearKey,
        );
        ServerUtils.assert(
            sourceKey !==
                ServerUtils.academicYearKey(targetContext.academicYear),
            "ปีการศึกษาต้นทางต้องไม่ใช่ปีการศึกษาปัจจุบัน",
        );
        ServerUtils.assert(
            Array.isArray(payload.templateIds),
            "รายการเทมเพลตที่ต้องการคัดลอกไม่ถูกต้อง",
        );
        const selectedIds = new Set(
            payload.templateIds.map((id) => ServerUtils.normalizeText(id)),
        );
        ServerUtils.assert(
            selectedIds.size > 0,
            "กรุณาเลือกเทมเพลตที่ต้องการคัดลอก",
        );
        const sourceRows = this.listForAcademicYear(sourceKey).filter(
            (template) => selectedIds.has(template.id),
        );
        ServerUtils.assert(
            sourceRows.length === selectedIds.size,
            "ไม่พบเทมเพลตต้นทางบางรายการ",
        );

        const targetRows = this.list(targetContext.database);
        ServerUtils.assert(
            targetRows.length + sourceRows.length <=
                ServerConstant.LIMITS.reportTemplates,
            `มีเทมเพลตได้ไม่เกิน ${ServerConstant.LIMITS.reportTemplates} รายการต่อปีการศึกษา`,
        );
        const sourceYear = targetContext.config.academicYears.find(
            (year) => ServerUtils.academicYearKey(year) === sourceKey,
        );
        ServerUtils.assert(sourceYear !== undefined, "ไม่พบปีการศึกษาต้นทาง");
        const usedNames = new Set(
            targetRows.map((template) =>
                this.nameKey(template.reportType, template.name),
            ),
        );
        const defaultTypes = new Set(
            targetRows
                .filter((template) => template.isDefault)
                .map((template) => template.reportType),
        );
        const copiedRows = sourceRows.map((source) => {
            const name = this.copiedName(
                source.name,
                source.reportType,
                `${sourceYear.y}/${sourceYear.t}`,
                usedNames,
            );
            const isDefault =
                source.isDefault && !defaultTypes.has(source.reportType);
            if (isDefault) {
                defaultTypes.add(source.reportType);
            }
            return {
                ...source,
                id: "",
                name,
                isDefault,
                config: { ...source.config },
                updatedAt: "",
            };
        });
        return this.save(
            [...targetRows, ...copiedRows],
            targetContext.database,
            targetRows,
        );
    }

    static defaultConfig(reportType: ReportType): ReportTemplateConfig {
        const daily = reportType === "daily";
        return {
            orientation: daily ? "portrait" : "landscape",
            pageMarginMm: 12,
            fontFamily: "Sarabun, sans-serif",
            fontSizePt: 11,
            title:
                daily
                    ? "รายงานสถิตินักเรียนประจำวัน"
                    : "รายงานสถิติการเข้าเรียนแบบละเอียด",
            subtitle: "",
            showLogo: true,
            showStatusDetails: true,
            showDutyNotes: daily,
            showSignatures: true,
            showDraftWatermark: true,
            sections: {
                headerHtml:
                    '<div style="text-align:center"><h2>{{school.name}}</h2><p>{{report.title}}</p><p>ปีการศึกษา {{academic.year}} เทอม {{academic.term}}</p></div>',
                contentHtml: daily
                    ? '<p>ประจำวันที่ {{report.dateThai}}</p><p>{{table:daily-summary}}</p>'
                    : '<p>ช่วงวันที่ {{report.dateFromThai}} ถึง {{report.dateToThai}}</p><p>{{table:detailed-students}}</p>',
                footerHtml:
                    '<div style="text-align:center"><p>ลงชื่อ................................................</p><p>(................................................)</p><p>ผู้รับรองรายงาน</p></div>',
            },
            tables: [this.defaultTable(reportType)],
        };
    }

    private static normalizeRows(
        rows: ReportTemplate[],
        existingIds: Set<string>,
    ): ReportTemplate[] {
        ServerUtils.assert(
            rows.length <= ServerConstant.LIMITS.reportTemplates,
            `มีเทมเพลตได้ไม่เกิน ${ServerConstant.LIMITS.reportTemplates} รายการต่อปีการศึกษา`,
        );
        const ids = new Set<string>();
        const names = new Set<string>();
        const defaultTypes = new Set<ReportType>();
        const now = Utilities.formatDate(
            new Date(),
            "UTC",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
        );
        return rows.map((row) => {
            const reportType = this.reportType(row.reportType);
            const name = ServerUtils.normalizeText(row.name);
            ServerUtils.assert(name.length > 0, "ต้องระบุชื่อเทมเพลต");
            ServerUtils.assert(
                name.length <= ServerConstant.LIMITS.reportTemplateNameLength,
                `ชื่อเทมเพลตห้ามเกิน ${ServerConstant.LIMITS.reportTemplateNameLength} ตัวอักษร`,
            );
            const nameKey = this.nameKey(reportType, name);
            ServerUtils.assert(
                !names.has(nameKey),
                `ชื่อเทมเพลต “${name}” ซ้ำในประเภทรายงานเดียวกัน`,
            );
            names.add(nameKey);

            const requestedId = ServerUtils.normalizeText(row.id);
            const id =
                requestedId && existingIds.has(requestedId)
                    ? requestedId
                    : ServerUtils.createShortId("rpt");
            ServerUtils.assert(!ids.has(id), "รหัสเทมเพลตซ้ำ");
            ids.add(id);
            const isDefault = Boolean(row.isDefault);
            if (isDefault) {
                ServerUtils.assert(
                    !defaultTypes.has(reportType),
                    "ตั้งค่าเริ่มต้นได้เพียงหนึ่งเทมเพลตต่อประเภทรายงาน",
                );
                defaultTypes.add(reportType);
            }
            const config = this.normalizeConfig(row.config, reportType);
            const tablesJson = ServerUtils.stringifyJson(config.tables);
            ServerUtils.assert(
                tablesJson.length <=
                    ServerConstant.LIMITS.reportTemplateConfigLength,
                "การตั้งค่าตารางมีขนาดใหญ่เกินไป",
            );
            return {
                id,
                name,
                reportType,
                isDefault,
                enabled: Boolean(row.enabled),
                config,
                updatedAt: now,
            };
        });
    }

    private static normalizeConfig(
        input: ReportTemplateConfig,
        reportType: ReportType,
    ): ReportTemplateConfig {
        const fallback = this.defaultConfig(reportType);
        const title = ServerUtils.normalizeText(input?.title);
        const subtitle = ServerUtils.normalizeText(input?.subtitle);
        ServerUtils.assert(title.length > 0, "ต้องระบุหัวข้อรายงาน");
        ServerUtils.assert(
            title.length <= ServerConstant.LIMITS.reportTemplateTextLength &&
                subtitle.length <=
                    ServerConstant.LIMITS.reportTemplateTextLength,
            `ข้อความในเทมเพลตห้ามเกิน ${ServerConstant.LIMITS.reportTemplateTextLength} ตัวอักษรต่อช่อง`,
        );
        const sections = {
            headerHtml: this.templateHtml(
                input?.sections?.headerHtml ?? fallback.sections.headerHtml,
            ),
            contentHtml: this.templateHtml(
                input?.sections?.contentHtml ?? fallback.sections.contentHtml,
            ),
            footerHtml: this.templateHtml(
                input?.sections?.footerHtml ?? fallback.sections.footerHtml,
            ),
        };
        const tables = this.normalizeTables(
            input?.tables ?? fallback.tables,
            reportType,
        );
        return {
            orientation:
                input?.orientation === "landscape" ? "landscape" : "portrait",
            pageMarginMm: this.numberInRange(input?.pageMarginMm, 5, 30, 12),
            fontFamily: this.fontFamily(input?.fontFamily),
            fontSizePt: this.numberInRange(input?.fontSizePt, 8, 20, 11),
            title,
            subtitle,
            showLogo: input?.showLogo ?? fallback.showLogo,
            showStatusDetails:
                input?.showStatusDetails ?? fallback.showStatusDetails,
            showDutyNotes: input?.showDutyNotes ?? fallback.showDutyNotes,
            showSignatures: input?.showSignatures ?? fallback.showSignatures,
            showDraftWatermark:
                input?.showDraftWatermark ?? fallback.showDraftWatermark,
            sections,
            tables,
        };
    }

    private static fromRow(row: Record<string, string>): ReportTemplate {
        const reportType = this.reportType(row.reportType);
        const fallback = this.defaultConfig(reportType);
        const parsed = this.recordValue(
            ServerUtils.parseJson<unknown>(row.configJson, {}),
        );
        const parsedSections = this.recordValue(parsed.sections);
        const splitStorage = Boolean(
            row.headerHtml ||
                row.contentHtml ||
                row.footerHtml ||
                row.tablesJson,
        );
        const sections = splitStorage
            ? {
                  headerHtml: row.headerHtml ?? "",
                  contentHtml: row.contentHtml ?? "",
                  footerHtml: row.footerHtml ?? "",
              }
            : {
                  headerHtml:
                      parsedSections.headerHtml ?? fallback.sections.headerHtml,
                  contentHtml:
                      parsedSections.contentHtml ??
                      fallback.sections.contentHtml,
                  footerHtml:
                      parsedSections.footerHtml ?? fallback.sections.footerHtml,
              };
        const storedTables = splitStorage
            ? ServerUtils.parseJson<unknown>(row.tablesJson, [])
            : parsed.tables;
        return {
            id: ServerUtils.normalizeText(row.id),
            name: ServerUtils.normalizeText(row.name),
            reportType,
            isDefault: row.isDefault === "true",
            enabled: row.enabled !== "false",
            config: this.normalizeStoredConfig(
                parsed,
                sections,
                storedTables,
                reportType,
            ),
            updatedAt: ServerUtils.normalizeText(row.updatedAt),
        };
    }

    private static normalizeStoredConfig(
        parsed: Record<string, unknown>,
        rawSections: Record<keyof ReportTemplateConfig["sections"], unknown>,
        rawTables: unknown,
        reportType: ReportType,
    ): ReportTemplateConfig {
        const fallback = this.defaultConfig(reportType);
        const title =
            ServerUtils.normalizeText(parsed.title).slice(
                0,
                ServerConstant.LIMITS.reportTemplateTextLength,
            ) || fallback.title;
        const subtitle = ServerUtils.normalizeText(parsed.subtitle).slice(
            0,
            ServerConstant.LIMITS.reportTemplateTextLength,
        );
        const sections = {
            headerHtml: this.safeStoredTemplateHtml(
                rawSections.headerHtml,
                fallback.sections.headerHtml,
            ),
            contentHtml: this.safeStoredTemplateHtml(
                rawSections.contentHtml,
                fallback.sections.contentHtml,
            ),
            footerHtml: this.safeStoredTemplateHtml(
                rawSections.footerHtml,
                fallback.sections.footerHtml,
            ),
        };
        let tables = fallback.tables;
        try {
            const candidates = Array.isArray(rawTables)
                ? (rawTables as ReportTableDefinition[])
                : fallback.tables;
            tables = this.normalizeTables(
                this.migrateStoredTables(candidates, reportType),
                reportType,
            );
        } catch {
            // A malformed row edited directly in Sheets must not reach the
            // report renderer. Keep the rest of the template usable.
            tables = fallback.tables;
        }
        return {
            orientation:
                parsed.orientation === "landscape" ? "landscape" : "portrait",
            pageMarginMm: this.numberInRange(parsed.pageMarginMm, 5, 30, 12),
            fontFamily: this.fontFamily(parsed.fontFamily),
            fontSizePt: this.numberInRange(parsed.fontSizePt, 8, 20, 11),
            title,
            subtitle,
            showLogo: this.storedBoolean(parsed.showLogo, fallback.showLogo),
            showStatusDetails: this.storedBoolean(
                parsed.showStatusDetails,
                fallback.showStatusDetails,
            ),
            showDutyNotes: this.storedBoolean(
                parsed.showDutyNotes,
                fallback.showDutyNotes,
            ),
            showSignatures: this.storedBoolean(
                parsed.showSignatures,
                fallback.showSignatures,
            ),
            showDraftWatermark: this.storedBoolean(
                parsed.showDraftWatermark,
                fallback.showDraftWatermark,
            ),
            sections,
            tables,
        };
    }

    private static toRow(template: ReportTemplate): Record<string, string> {
        const { sections, tables, ...pageConfig } = template.config;
        return {
            id: template.id,
            name: template.name,
            reportType: template.reportType,
            isDefault: String(template.isDefault),
            enabled: String(template.enabled),
            configJson: ServerUtils.stringifyJson(pageConfig),
            updatedAt: template.updatedAt,
            headerHtml: sections.headerHtml,
            contentHtml: sections.contentHtml,
            footerHtml: sections.footerHtml,
            tablesJson: ServerUtils.stringifyJson(tables),
        };
    }

    private static reportType(value: unknown): ReportType {
        const normalized = ServerUtils.normalizeText(value);
        ServerUtils.assert(
            normalized === "daily" || normalized === "detailed",
            "ประเภทรายงานไม่ถูกต้อง",
        );
        return normalized;
    }

    private static defaultTable(reportType: ReportType): ReportTableDefinition {
        if (reportType === "daily") {
            const columns = [
                this.column("class", "ชั้น/ห้อง", "class.name", 20, "left"),
                this.column("students", "นักเรียนทั้งหมด", "students.total", 16),
                this.column("present", "มา", "present.total", 16),
                this.column("absent", "ขาด", "absent.total", 16),
                this.column("late", "สาย", "late.total", 16),
                this.column("leave", "ลา", "leave.total", 16),
            ];
            return {
                id: "daily-summary",
                name: "สรุปตามห้องเรียน",
                dataSource: "daily.classes",
                showHeader: true,
                showTotals: true,
                columns,
                headerRowCount: 1,
                headerCells: this.defaultHeaderCells(columns),
            };
        }
        const columns = [
            this.column("class", "ห้อง", "class.name", 12),
            this.column("number", "เลขที่", "student.number", 8),
            this.column("name", "ชื่อ-สกุล", "student.fullName", 28, "left"),
            this.column("present", "มา", "present.count", 13),
            this.column("absent", "ขาด", "absent.count", 13),
            this.column("late", "สาย", "late.count", 13),
            this.column("leave", "ลา", "leave.count", 13),
        ];
        return {
            id: "detailed-students",
            name: "สถิติรายบุคคล",
            dataSource: "detailed.students",
            showHeader: true,
            showTotals: false,
            columns,
            headerRowCount: 1,
            headerCells: this.defaultHeaderCells(columns),
        };
    }

    private static column(
        id: string,
        header: string,
        valueToken: string,
        widthPercent: number,
        align: "left" | "center" | "right" = "center",
    ) {
        return {
            id,
            header,
            valueToken,
            widthPercent,
            align,
            mergeRepeatingValues: false,
        };
    }

    private static defaultHeaderCells(
        columns: ReportTableDefinition["columns"],
        rowCount = 1,
    ): ReportTableHeaderCell[] {
        return Array.from({ length: rowCount }).flatMap((_, rowIndex) =>
            columns.map((column, columnIndex) => ({
                id: `head-${rowIndex}-${column.id}`,
                text: rowIndex === rowCount - 1 ? column.header : "",
                rowIndex,
                columnIndex,
                rowSpan: 1,
                columnSpan: 1,
            })),
        );
    }

    private static normalizeHeaderCells(
        input: ReportTableHeaderCell[] | undefined,
        rowCount: number,
        columns: ReportTableDefinition["columns"],
    ): ReportTableHeaderCell[] {
        if (!Array.isArray(input) || input.length === 0) {
            return this.defaultHeaderCells(columns, rowCount);
        }
        const grid = Array.from({ length: rowCount }, () =>
            Array.from({ length: columns.length }, () => false),
        );
        const ids = new Set<string>();
        const cells = input.map((cell) => {
            const id =
                ServerUtils.normalizeText(cell.id) ||
                ServerUtils.createShortId("head");
            const text = ServerUtils.normalizeText(cell.text);
            const rowIndex = Math.trunc(Number(cell.rowIndex));
            const columnIndex = Math.trunc(Number(cell.columnIndex));
            const rowSpan = Math.trunc(Number(cell.rowSpan));
            const columnSpan = Math.trunc(Number(cell.columnSpan));
            ServerUtils.assert(
                !ids.has(id) && /^[a-zA-Z0-9_-]+$/.test(id),
                "รหัสเซลล์หัวตารางไม่ถูกต้องหรือซ้ำกัน",
            );
            ids.add(id);
            ServerUtils.assert(
                text.length <= 100,
                "ข้อความเซลล์หัวตารางห้ามเกิน 100 ตัวอักษร",
            );
            ServerUtils.assert(
                rowIndex >= 0 &&
                    columnIndex >= 0 &&
                    rowSpan >= 1 &&
                    columnSpan >= 1 &&
                    rowIndex + rowSpan <= rowCount &&
                    columnIndex + columnSpan <= columns.length,
                "ขอบเขตเซลล์หัวตารางไม่ถูกต้อง",
            );
            for (let row = rowIndex; row < rowIndex + rowSpan; row += 1) {
                for (
                    let column = columnIndex;
                    column < columnIndex + columnSpan;
                    column += 1
                ) {
                    ServerUtils.assert(
                        !grid[row][column],
                        "เซลล์หัวตารางซ้อนทับกัน",
                    );
                    grid[row][column] = true;
                }
            }
            return {
                id,
                text,
                rowIndex,
                columnIndex,
                rowSpan,
                columnSpan,
            };
        });
        ServerUtils.assert(
            grid.every((row) => row.every(Boolean)),
            "โครงสร้างหัวตารางมีช่องว่างที่ไม่ได้กำหนดเซลล์",
        );
        return cells.sort(
            (a, b) =>
                a.rowIndex - b.rowIndex || a.columnIndex - b.columnIndex,
        );
    }

    private static normalizeTables(
        tables: ReportTableDefinition[],
        reportType: ReportType,
    ): ReportTableDefinition[] {
        ServerUtils.assert(
            Array.isArray(tables),
            "ข้อมูลตารางในเทมเพลตไม่ถูกต้อง",
        );
        ServerUtils.assert(
            tables.length <= ServerConstant.LIMITS.reportTemplateTables,
            `มีตารางได้ไม่เกิน ${ServerConstant.LIMITS.reportTemplateTables} ตารางต่อเทมเพลต`,
        );
        const ids = new Set<string>();
        return tables.map((table) => {
            ServerUtils.assert(
                table !== null && typeof table === "object",
                "ข้อมูลตารางในเทมเพลตไม่ถูกต้อง",
            );
            const id = ServerUtils.normalizeText(table.id);
            const name = ServerUtils.normalizeText(table.name);
            ServerUtils.assert(/^[a-zA-Z0-9_-]+$/.test(id), "รหัสตารางไม่ถูกต้อง");
            ServerUtils.assert(!ids.has(id), "รหัสตารางซ้ำในเทมเพลต");
            ids.add(id);
            ServerUtils.assert(name.length > 0, "ต้องระบุชื่อตาราง");
            ServerUtils.assert(name.length <= 100, "ชื่อตารางห้ามเกิน 100 ตัวอักษร");
            ServerUtils.assert(
                Array.isArray(table.columns) &&
                    table.columns.length > 0 &&
                    table.columns.length <=
                        ServerConstant.LIMITS.reportTemplateTableColumns,
                `ตารางต้องมี 1-${ServerConstant.LIMITS.reportTemplateTableColumns} คอลัมน์`,
            );
            const dataSource = this.tableDataSource(table.dataSource);
            ServerUtils.assert(
                this.isDataSourceCompatible(dataSource, reportType),
                reportType === "daily"
                    ? "รายงานรายวันต้องใช้แหล่งข้อมูลภาพรวมรายวัน"
                    : "รายงานสถิติละเอียดต้องใช้แหล่งข้อมูลสถิติรายบุคคล",
            );
            const allowedTokens = new Set(this.allowedTableTokens(dataSource));
            const columnIds = new Set<string>();
            const columns: ReportTableDefinition["columns"] = table.columns.map((column) => {
                const columnId =
                    ServerUtils.normalizeText(column.id) ||
                    ServerUtils.createShortId("col");
                const header = ServerUtils.normalizeText(column.header);
                const valueToken = ServerUtils.normalizeText(
                    column.valueToken,
                );
                ServerUtils.assert(
                    /^[a-zA-Z0-9_-]+$/.test(columnId) &&
                        !columnIds.has(columnId),
                    "รหัสคอลัมน์ไม่ถูกต้องหรือซ้ำกัน",
                );
                columnIds.add(columnId);
                ServerUtils.assert(
                    header.length > 0 && header.length <= 100,
                    "หัวคอลัมน์ต้องมี 1-100 ตัวอักษร",
                );
                ServerUtils.assert(
                    allowedTokens.has(valueToken),
                    `ข้อมูลคอลัมน์ ${valueToken || "-"} ไม่รองรับแหล่งข้อมูลที่เลือก`,
                );
                return {
                    id: columnId,
                    header,
                    valueToken,
                    widthPercent: this.numberInRange(
                        column.widthPercent,
                        1,
                        100,
                        10,
                    ),
                    align:
                        column.align === "left" || column.align === "right"
                            ? column.align
                            : "center",
                    mergeRepeatingValues: Boolean(
                        column.mergeRepeatingValues,
                    ),
                };
            });
            const headerRowCount = Math.trunc(
                this.numberInRange(
                    table.headerRowCount,
                    1,
                    ServerConstant.LIMITS.reportTemplateHeaderRows,
                    1,
                ),
            );
            const headerCells = this.normalizeHeaderCells(
                table.headerCells,
                headerRowCount,
                columns,
            );
            return {
                id,
                name,
                dataSource,
                showHeader: Boolean(table.showHeader),
                showTotals: Boolean(table.showTotals),
                columns,
                headerRowCount,
                headerCells,
            };
        });
    }

    private static tableDataSource(value: unknown): ReportTableDataSource {
        const normalized = ServerUtils.normalizeText(value);
        ServerUtils.assert(
            normalized === "daily.school" ||
                normalized === "daily.classes" ||
                normalized === "daily.statusStudents" ||
                normalized === "detailed.students",
            "แหล่งข้อมูลตารางไม่ถูกต้อง",
        );
        return normalized;
    }

    private static allowedTableTokens(
        dataSource: ReportTableDataSource,
    ): string[] {
        if (dataSource === "daily.school") {
            return [
                "students.male",
                "students.female",
                "students.total",
                "present.male",
                "present.female",
                "present.total",
                "present.percent",
                "absent.male",
                "absent.female",
                "absent.total",
                "absent.percent",
                "late.male",
                "late.female",
                "late.total",
                "late.percent",
                "leave.male",
                "leave.female",
                "leave.total",
                "leave.percent",
            ];
        }
        if (dataSource === "daily.classes") {
            return [
                "class.name",
                "students.male",
                "students.female",
                "students.total",
                "present.male",
                "present.female",
                "present.total",
                "present.percent",
                "absent.male",
                "absent.female",
                "absent.total",
                "absent.percent",
                "late.male",
                "late.female",
                "late.total",
                "late.percent",
                "leave.male",
                "leave.female",
                "leave.total",
                "leave.percent",
            ];
        }
        if (dataSource === "daily.statusStudents") {
            return [
                "class.name",
                "student.number",
                "student.code",
                "student.fullName",
                "student.gender",
                "attendance.status",
            ];
        }
        return [
            "class.name",
            "student.number",
            "student.code",
            "student.fullName",
            "student.gender",
            "present.count",
            "present.percent",
            "absent.count",
            "absent.percent",
            "late.count",
            "late.percent",
            "leave.count",
            "leave.percent",
            "attendance.total",
        ];
    }

    private static isDataSourceCompatible(
        dataSource: unknown,
        reportType: ReportType,
    ): boolean {
        if (reportType === "detailed") {
            return dataSource === "detailed.students";
        }
        return (
            dataSource === "daily.school" ||
            dataSource === "daily.classes" ||
            dataSource === "daily.statusStudents"
        );
    }

    private static migrateStoredTables(
        tables: ReportTableDefinition[],
        reportType: ReportType,
    ): ReportTableDefinition[] {
        if (!Array.isArray(tables)) {
            return [this.defaultTable(reportType)];
        }
        return tables.map((table) => {
            if (
                table &&
                typeof table === "object" &&
                this.isDataSourceCompatible(table.dataSource, reportType)
            ) {
                return table;
            }
            const fallback = this.defaultTable(reportType);
            return {
                ...fallback,
                id: ServerUtils.normalizeText(table?.id) || fallback.id,
                name: ServerUtils.normalizeText(table?.name) || fallback.name,
                showHeader: Boolean(table?.showHeader),
                showTotals: Boolean(table?.showTotals),
            };
        });
    }

    private static templateHtml(value: unknown): string {
        const html = String(value ?? "").trim();
        ServerUtils.assert(
            html.length <= ServerConstant.LIMITS.reportTemplateSectionLength,
            `เนื้อหาแต่ละส่วนห้ามเกิน ${ServerConstant.LIMITS.reportTemplateSectionLength} ตัวอักษร`,
        );
        ServerUtils.assert(
            !/<\s*(script|iframe|object|embed|link|meta|style)\b/i.test(html) &&
                !/\bon\w+\s*=/i.test(html) &&
                !/javascript\s*:/i.test(html),
            "เนื้อหาเทมเพลตมี HTML ที่ไม่อนุญาต",
        );
        const allowedTags = new Set([
            "p",
            "div",
            "span",
            "br",
            "h1",
            "h2",
            "h3",
            "h4",
            "strong",
            "b",
            "em",
            "i",
            "u",
            "s",
            "ul",
            "ol",
            "li",
            "blockquote",
            "table",
            "thead",
            "tbody",
            "tfoot",
            "tr",
            "th",
            "td",
            "a",
            "font",
        ]);
        const tagPattern = /<\/?\s*([a-z][a-z0-9-]*)\b[^>]*>/gi;
        let tagMatch: RegExpExecArray | null;
        while ((tagMatch = tagPattern.exec(html)) !== null) {
            ServerUtils.assert(
                allowedTags.has(tagMatch[1].toLowerCase()),
                "เนื้อหาเทมเพลตมีแท็ก HTML ที่ไม่อนุญาต",
            );
        }
        return html;
    }

    private static safeStoredTemplateHtml(
        value: unknown,
        fallback: string,
    ): string {
        if (typeof value !== "string") {
            return fallback;
        }
        try {
            return this.templateHtml(this.migrateLegacyTokens(value));
        } catch {
            return fallback;
        }
    }

    private static recordValue(value: unknown): Record<string, unknown> {
        return value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};
    }

    private static storedBoolean(value: unknown, fallback: boolean): boolean {
        return typeof value === "boolean" ? value : fallback;
    }

    private static migrateLegacyTokens(html: string): string {
        return html
            .replace(/{{\s*school\.affiliation\s*}}/g, "")
            .replace(
                /{{\s*signer\.(dutyTeacherName|deputyName|directorName|directorPosition)\s*}}/g,
                "................................................",
            );
    }

    private static fontFamily(value: unknown): string {
        const normalized = ServerUtils.normalizeText(value);
        const allowed = [
            "Sarabun, sans-serif",
            '"Noto Sans Thai", sans-serif',
        ];
        const legacyAliases: Record<string, string> = {
            "Arial, sans-serif": allowed[1],
            "Tahoma, sans-serif": allowed[1],
            serif: allowed[1],
            monospace: allowed[1],
            'Arial, Arimo, "Noto Sans Thai", sans-serif': allowed[1],
            'Tahoma, "Noto Sans Thai", sans-serif': allowed[1],
            '"Noto Serif Thai", serif': allowed[1],
            '"Noto Sans Mono", "Noto Sans Thai", monospace': allowed[1],
        };
        const migrated = legacyAliases[normalized] ?? normalized;
        return allowed.includes(migrated) ? migrated : allowed[0];
    }

    private static numberInRange(
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

    private static nameKey(reportType: ReportType, name: string): string {
        return `${reportType}:${name.trim().toLocaleLowerCase("th")}`;
    }

    private static sortTemplates(rows: ReportTemplate[]): ReportTemplate[] {
        return [...rows].sort((a, b) =>
            a.reportType === b.reportType
                ? a.name.localeCompare(b.name, "th")
                : a.reportType.localeCompare(b.reportType),
        );
    }

    private static copiedName(
        originalName: string,
        reportType: ReportType,
        sourceLabel: string,
        usedNames: Set<string>,
    ): string {
        const suffix = ` (คัดลอกจาก ${sourceLabel})`;
        const maxBaseLength = Math.max(
            ServerConstant.LIMITS.reportTemplateNameLength - suffix.length,
            1,
        );
        const base = `${originalName.slice(0, maxBaseLength).trim()}${suffix}`;
        let candidate = base;
        let index = 2;
        while (usedNames.has(this.nameKey(reportType, candidate))) {
            const numberedSuffix = ` ${index}`;
            candidate = `${base.slice(0, ServerConstant.LIMITS.reportTemplateNameLength - numberedSuffix.length).trim()}${numberedSuffix}`;
            index += 1;
        }
        usedNames.add(this.nameKey(reportType, candidate));
        return candidate;
    }
}
