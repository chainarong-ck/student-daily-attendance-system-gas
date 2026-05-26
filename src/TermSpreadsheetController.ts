class TermSpreadsheetController {
  private spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet;

  private constructor(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.spreadsheet = spreadsheet;
  }

  public static open(spreadsheetId: string): TermSpreadsheetController {
    const spreadsheet = SpreadsheetController.openSpreadsheetById(
      spreadsheetId,
      "ไม่สามารถเปิดสเปรดชีตของเทอมการศึกษาได้ กรุณาตรวจสอบ Spreadsheet ID อีกครั้ง",
    );

    return new TermSpreadsheetController(spreadsheet);
  }

  public getSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
    return this.spreadsheet;
  }

  public getSpreadsheetName(): string {
    return this.spreadsheet.getName();
  }
}
