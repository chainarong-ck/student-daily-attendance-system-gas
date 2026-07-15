import type { AcademicYear } from "../shared/types";
import { ServerConstant } from "./ServerConstant";
import { ServerUtils } from "./ServerUtils";

type SheetName = keyof typeof ServerConstant.HEADERS;

export type SheetObjectRow = {
    rowNumber: number;
    value: Record<string, string>;
};

export class SheetDatabase {
    private readonly spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet;

    constructor(academicYear: AcademicYear) {
        this.spreadsheet = SpreadsheetApp.openById(academicYear.id);
    }

    ensureSchema(): void {
        this.ensureSheet("Classes", true);
        this.ensureSheet("Students", true);
        this.ensureSheet("Attendance", true);
        this.ensureSheet("ReportTemplates", true);
    }

    readObjects(sheetName: SheetName): Record<string, string>[] {
        return this.readObjectsWithRowNumbers(sheetName).map(
            (row) => row.value,
        );
    }

    readObjectsWithRowNumbers(sheetName: SheetName): SheetObjectRow[] {
        const sheet = this.ensureSheet(sheetName);
        const lastRow = sheet.getLastRow();
        const headers = [...ServerConstant.HEADERS[sheetName]];
        if (lastRow < 2) {
            return [];
        }
        const values = sheet
            .getRange(2, 1, lastRow - 1, headers.length)
            .getDisplayValues();
        return values.flatMap((row, index) => {
            if (!row.some((cell) => cell.trim().length > 0)) {
                return [];
            }
            const object: Record<string, string> = {};
            headers.forEach((header, columnIndex) => {
                object[header] = row[columnIndex] ?? "";
            });
            return [{ rowNumber: index + 2, value: object }];
        });
    }

    writeObjects(sheetName: SheetName, rows: Record<string, string>[]): void {
        const sheet = this.ensureSheet(sheetName);
        const headers = [...ServerConstant.HEADERS[sheetName]];
        this.ensureRowCapacity(sheet, Math.max(rows.length + 1, 2));
        const existingRows = Math.max(sheet.getLastRow() - 1, 0);
        if (rows.length > 0) {
            const values = rows.map((row) =>
                headers.map((header) => this.toSheetText(row[header])),
            );
            sheet
                .getRange(2, 1, values.length, headers.length)
                .setNumberFormat("@")
                .setValues(values);
        }
        const staleRows = Math.max(existingRows - rows.length, 0);
        if (staleRows > 0) {
            sheet
                .getRange(rows.length + 2, 1, staleRows, headers.length)
                .clearContent();
        }
    }

    appendObjects(sheetName: SheetName, rows: Record<string, string>[]): void {
        if (rows.length === 0) {
            return;
        }
        const sheet = this.ensureSheet(sheetName);
        const headers = [...ServerConstant.HEADERS[sheetName]];
        const values = rows.map((row) =>
            headers.map((header) => this.toSheetText(row[header])),
        );
        const lastRow = sheet.getLastRow();
        this.ensureRowCapacity(sheet, lastRow + values.length);
        sheet
            .getRange(lastRow + 1, 1, values.length, headers.length)
            .setNumberFormat("@")
            .setValues(values);
    }

    writeObjectRows(sheetName: SheetName, rows: SheetObjectRow[]): void {
        if (rows.length === 0) {
            return;
        }
        const sheet = this.ensureSheet(sheetName);
        const headers = [...ServerConstant.HEADERS[sheetName]];
        const sortedRows = [...rows].sort(
            (a, b) => a.rowNumber - b.rowNumber,
        );
        this.assertValidPhysicalRows(sortedRows);
        this.ensureRowCapacity(
            sheet,
            sortedRows[sortedRows.length - 1].rowNumber,
        );
        this.contiguousGroups(sortedRows).forEach((group) => {
            const values = group.map((row) =>
                headers.map((header) => this.toSheetText(row.value[header])),
            );
            sheet
                .getRange(
                    group[0].rowNumber,
                    1,
                    group.length,
                    headers.length,
                )
                .setNumberFormat("@")
                .setValues(values);
        });
    }

    clearObjectRows(sheetName: SheetName, rowNumbers: number[]): void {
        if (rowNumbers.length === 0) {
            return;
        }
        const sheet = this.ensureSheet(sheetName);
        const headers = [...ServerConstant.HEADERS[sheetName]];
        const rows = [...new Set(rowNumbers)]
            .sort((a, b) => a - b)
            .map((rowNumber) => ({ rowNumber }));
        this.assertValidPhysicalRows(rows);
        this.contiguousGroups(rows).forEach((group) => {
            sheet
                .getRange(
                    group[0].rowNumber,
                    1,
                    group.length,
                    headers.length,
                )
                .clearContent();
        });
    }

    private toSheetText(value: unknown): string {
        const text = ServerUtils.normalizeText(value);
        // Formula-like prefixes are escaped even though the target range uses
        // plain-text formatting. A leading apostrophe is Sheets' literal-text
        // marker and is not included in display reads.
        return /^[=+\-@]/.test(text) ? `'${text}` : text;
    }

    private assertValidPhysicalRows(
        rows: Array<{ rowNumber: number }>,
    ): void {
        const seen = new Set<number>();
        rows.forEach((row) => {
            ServerUtils.assert(
                Number.isInteger(row.rowNumber) &&
                    row.rowNumber >= 2 &&
                    !seen.has(row.rowNumber),
                "ตำแหน่งแถวใน Google Sheet ไม่ถูกต้อง",
            );
            seen.add(row.rowNumber);
        });
    }

    private contiguousGroups<T extends { rowNumber: number }>(
        rows: T[],
    ): T[][] {
        return rows.reduce<T[][]>((groups, row) => {
            const lastGroup = groups[groups.length - 1];
            const previous = lastGroup?.[lastGroup.length - 1];
            if (!previous || row.rowNumber !== previous.rowNumber + 1) {
                groups.push([row]);
            } else {
                lastGroup.push(row);
            }
            return groups;
        }, []);
    }

    private ensureSheet(
        sheetName: SheetName,
        verifySchema = false,
    ): GoogleAppsScript.Spreadsheet.Sheet {
        const headers = [...ServerConstant.HEADERS[sheetName]];
        let sheet = this.spreadsheet.getSheetByName(sheetName);
        let created = false;
        if (!sheet) {
            sheet = this.spreadsheet.insertSheet(sheetName);
            created = true;
        }
        if (created || verifySchema) {
            const currentHeaders = sheet
                .getRange(1, 1, 1, headers.length)
                .getDisplayValues()[0];
            const exactSchema = headers.every(
                (header, index) => currentHeaders[index] === header,
            );
            let prefixLength = 0;
            while (
                prefixLength < currentHeaders.length &&
                currentHeaders[prefixLength].trim().length > 0
            ) {
                prefixLength += 1;
            }
            const legacyPrefix =
                prefixLength > 0 &&
                prefixLength < headers.length &&
                currentHeaders
                    .slice(0, prefixLength)
                    .every((header, index) => header === headers[index]) &&
                currentHeaders
                    .slice(prefixLength)
                    .every((header) => header.trim().length === 0);
            const emptySheet = sheet.getLastRow() === 0;
            ServerUtils.assert(
                created || exactSchema || legacyPrefix || emptySheet,
                `โครงสร้างชีต ${sheetName} ไม่ตรงกับระบบ กรุณาตรวจสอบหัวตารางก่อนใช้งาน`,
            );
            if (created || legacyPrefix || emptySheet) {
                sheet
                    .getRange(1, 1, 1, headers.length)
                    .setNumberFormat("@")
                    .setValues([headers]);
            }
            if (created) {
                sheet.setFrozenRows(1);
                sheet.autoResizeColumns(1, headers.length);
            }
        }
        return sheet;
    }

    private ensureRowCapacity(
        sheet: GoogleAppsScript.Spreadsheet.Sheet,
        requiredRows: number,
    ): void {
        const missingRows = requiredRows - sheet.getMaxRows();
        if (missingRows > 0) {
            sheet.insertRowsAfter(sheet.getMaxRows(), missingRows);
        }
    }
}
