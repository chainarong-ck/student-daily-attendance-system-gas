class AppSpreadsheetController {
  private static instance: AppSpreadsheetController;
  private static ACADEMIC_TERMS_SHEET_NAME = "Academic_Terms";
  private static APP_SETTINGS_SHEET_NAME = "App_Settings";
  private static ACADEMIC_TERM_HEADERS = [
    "academicYear",
    "term",
    "spreadsheetId",
    "status",
    "createdAt",
    "updatedAt",
  ];
  private static APP_SETTINGS_HEADERS = ["key", "value"];

  private spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet;

  private constructor() {
    const spreadsheetId = AppPropertiesSetting.getInstance().getSpreadsheetId();
    if (!spreadsheetId) {
      throw new Error("SPREADSHEET_ID ยังไม่ได้ตั้งค่า");
    }

    this.spreadsheet = SpreadsheetController.openSpreadsheetById(
      spreadsheetId,
      "ไม่สามารถเปิดสเปรดชีตหลักของระบบได้ กรุณาตรวจสอบ SPREADSHEET_ID ใน Script Properties",
    );
  }

  public static getInstance(): AppSpreadsheetController {
    if (!AppSpreadsheetController.instance) {
      AppSpreadsheetController.instance = new AppSpreadsheetController();
    }
    return AppSpreadsheetController.instance;
  }

  public static ensureSpreadsheetStructure(
    spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  ): void {
    SpreadsheetController.ensureSheet(
      spreadsheet,
      AppSpreadsheetController.ACADEMIC_TERMS_SHEET_NAME,
      AppSpreadsheetController.ACADEMIC_TERM_HEADERS,
    );
    SpreadsheetController.ensureSheet(
      spreadsheet,
      AppSpreadsheetController.APP_SETTINGS_SHEET_NAME,
      AppSpreadsheetController.APP_SETTINGS_HEADERS,
    );
  }

  public getSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
    return this.spreadsheet;
  }

  public getSpreadsheetName(): string {
    return this.spreadsheet.getName();
  }

  public getAcademicTermsSheet(): GoogleAppsScript.Spreadsheet.Sheet {
    return SpreadsheetController.ensureSheet(
      this.spreadsheet,
      AppSpreadsheetController.ACADEMIC_TERMS_SHEET_NAME,
      AppSpreadsheetController.ACADEMIC_TERM_HEADERS,
    );
  }

  public getAppSettingsSheet(): GoogleAppsScript.Spreadsheet.Sheet {
    return SpreadsheetController.ensureSheet(
      this.spreadsheet,
      AppSpreadsheetController.APP_SETTINGS_SHEET_NAME,
      AppSpreadsheetController.APP_SETTINGS_HEADERS,
    );
  }

  public ensureStructure(): void {
    AppSpreadsheetController.ensureSpreadsheetStructure(this.spreadsheet);
  }
}
