import type { AcademicYear } from "../shared/types";
import { ServerConstant } from "./ServerConstant";
import { ServerUtils } from "./ServerUtils";

type SheetName = keyof typeof ServerConstant.HEADERS;

export class SheetDatabase {
    private readonly spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet;

    constructor(academicYear: AcademicYear) {
        this.spreadsheet = SpreadsheetApp.openById(academicYear.id);
    }

    ensureSchema(): void {
        this.ensureSheet("Classes");
        this.ensureSheet("Students");
        this.ensureSheet("Attendance");
    }

    readObjects(sheetName: SheetName): Record<string, string>[] {
        const sheet = this.ensureSheet(sheetName);
        const lastRow = sheet.getLastRow();
        const headers = [...ServerConstant.HEADERS[sheetName]];
        if (lastRow < 2) {
            return [];
        }
        const values = sheet
            .getRange(2, 1, lastRow - 1, headers.length)
            .getDisplayValues();
        return values
            .filter((row) => row.some((cell) => cell.trim().length > 0))
            .map((row) => {
                const object: Record<string, string> = {};
                headers.forEach((header, index) => {
                    object[header] = row[index] ?? "";
                });
                return object;
            });
    }

    writeObjects(sheetName: SheetName, rows: Record<string, string>[]): void {
        const sheet = this.ensureSheet(sheetName);
        const headers = [...ServerConstant.HEADERS[sheetName]];
        this.ensureRowCapacity(sheet, Math.max(rows.length + 1, 2));
        const maxRows = Math.max(sheet.getMaxRows() - 1, 1);
        sheet.getRange(2, 1, maxRows, headers.length).clearContent();
        if (rows.length === 0) {
            this.formatSheet(sheet, headers.length);
            return;
        }
        const values = rows.map((row) =>
            headers.map((header) => ServerUtils.normalizeText(row[header])),
        );
        sheet.getRange(2, 1, values.length, headers.length).setValues(values);
        this.formatSheet(sheet, headers.length);
    }

    appendObjects(sheetName: SheetName, rows: Record<string, string>[]): void {
        if (rows.length === 0) {
            return;
        }
        const sheet = this.ensureSheet(sheetName);
        const headers = [...ServerConstant.HEADERS[sheetName]];
        const values = rows.map((row) =>
            headers.map((header) => ServerUtils.normalizeText(row[header])),
        );
        this.ensureRowCapacity(sheet, sheet.getLastRow() + values.length);
        sheet
            .getRange(sheet.getLastRow() + 1, 1, values.length, headers.length)
            .setValues(values);
        this.formatSheet(sheet, headers.length);
    }

    private ensureSheet(sheetName: SheetName): GoogleAppsScript.Spreadsheet.Sheet {
        const headers = [...ServerConstant.HEADERS[sheetName]];
        let sheet = this.spreadsheet.getSheetByName(sheetName);
        if (!sheet) {
            sheet = this.spreadsheet.insertSheet(sheetName);
        }
        this.ensureRowCapacity(sheet, 2);
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.setFrozenRows(1);
        this.formatSheet(sheet, headers.length);
        return sheet;
    }

    private formatSheet(
        sheet: GoogleAppsScript.Spreadsheet.Sheet,
        columns: number,
    ): void {
        const rows = Math.max(sheet.getMaxRows(), 1);
        sheet.getRange(1, 1, rows, columns).setNumberFormat("@");
        sheet.autoResizeColumns(1, columns);
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
