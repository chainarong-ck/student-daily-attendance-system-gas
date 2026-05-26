class SpreadsheetController {
  public static getSpreadsheetById(
    spreadsheetId: string,
  ): GoogleAppsScript.Spreadsheet.Spreadsheet | null {
    try {
      return SpreadsheetApp.openById(spreadsheetId);
    } catch (error) {
      return null;
    }
  }

  public static getActiveSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet | null {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) {
        return null;
      }
      return ss;
    } catch (error) {
      return null;
    }
  }

  public static openSpreadsheetById(
    spreadsheetId: string,
    errorMessage = "ไม่สามารถเปิดสเปรดชีตได้ กรุณาตรวจสอบ Spreadsheet ID อีกครั้ง",
  ): GoogleAppsScript.Spreadsheet.Spreadsheet {
    const spreadsheet = SpreadsheetController.getSpreadsheetById(spreadsheetId);
    if (!spreadsheet) {
      throw new Error(errorMessage);
    }
    return spreadsheet;
  }

  public static ensureSheet(
    spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
    sheetName: string,
    headers: string[],
  ): GoogleAppsScript.Spreadsheet.Sheet {
    const sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      const createdSheet = spreadsheet.insertSheet(sheetName);
      SpreadsheetController.setHeaderRow(createdSheet, headers);
      return createdSheet;
    }

    if (SpreadsheetController.isSheetEmpty(sheet)) {
      SpreadsheetController.setHeaderRow(sheet, headers);
      return sheet;
    }

    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    const currentHeaders = headerRange.getValues()[0];
    const headerMismatch = headers.some((header, index) => {
      return currentHeaders[index] !== header;
    });

    if (headerMismatch) {
      throw new Error(
        [
          `ชีต "${sheetName}" มีหัวตารางไม่ตรงกับโครงสร้างที่ระบบต้องการ`,
          `ต้องการ: ${headers.join(", ")}`,
          `พบ: ${currentHeaders.map((header) => String(header || "")).join(", ")}`,
        ].join("\n"),
      );
    }

    sheet.setFrozenRows(1);
    return sheet;
  }

  private static isSheetEmpty(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
  ): boolean {
    return sheet.getLastRow() === 0 && sheet.getLastColumn() === 0;
  }

  private static setHeaderRow(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    headers: string[],
  ): void {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}
