class AppSpreadsheetController {
  private static instance: AppSpreadsheetController;
  private static ACADEMIC_TERMS_SHEET_NAME = "Academic_Terms";
  private static APP_SETTINGS_SHEET_NAME = "App_Settings";
  public static SETTING_KEYS = {
    ACTIVE_TERM_KEY: "ACTIVE_TERM_KEY",
    TERM_FOLDER_ID: "TERM_FOLDER_ID",
  };
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
    const spreadsheetId = AppPropertiesController.getInstance().getSpreadsheetId();
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

  public getSettings(): AppSettingMap {
    const sheet = this.getAppSettingsSheet();
    const values = sheet.getDataRange().getValues();
    const settings: AppSettingMap = {};

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      const key = String(values[rowIndex][0] || "").trim();
      const value = String(values[rowIndex][1] || "").trim();

      if (key) {
        settings[key] = value;
      }
    }

    return settings;
  }

  public getSetting(key: string): string {
    return this.getSettings()[key] || "";
  }

  public setSetting(key: string, value: string): void {
    const normalizedKey = String(key || "").trim();

    if (!normalizedKey) {
      throw new Error("ไม่พบชื่อการตั้งค่าที่ต้องการบันทึก");
    }

    const sheet = this.getAppSettingsSheet();
    const values = sheet.getDataRange().getValues();
    const normalizedValue = String(value || "").trim();

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      if (String(values[rowIndex][0] || "").trim() === normalizedKey) {
        sheet.getRange(rowIndex + 1, 2).setValue(normalizedValue);
        return;
      }
    }

    sheet
      .getRange(sheet.getLastRow() + 1, 1, 1, 2)
      .setValues([[normalizedKey, normalizedValue]]);
  }

  public getTermFolderId(): string {
    return this.getSetting(AppSpreadsheetController.SETTING_KEYS.TERM_FOLDER_ID);
  }

  public saveTermFolderId(folderId: string): TermFolderResult {
    const normalizedFolderId = AppSpreadsheetController.normalizeDriveId(
      folderId,
      "folders",
    );

    if (!normalizedFolderId) {
      throw new Error("กรุณากรอก Folder ID หรือ URL ของ Google Drive Folder");
    }

    let folder: GoogleAppsScript.Drive.Folder;
    try {
      folder = DriveApp.getFolderById(normalizedFolderId);
      folder.getName();
    } catch (error) {
      throw new Error("ไม่สามารถเปิดโฟลเดอร์ได้ กรุณาตรวจสอบ Folder ID");
    }

    this.setSetting(
      AppSpreadsheetController.SETTING_KEYS.TERM_FOLDER_ID,
      normalizedFolderId,
    );

    return {
      folderId: normalizedFolderId,
      folderName: folder.getName(),
      folderUrl: folder.getUrl(),
    };
  }

  public getSuggestedTermFolder(): TermFolderResult | null {
    try {
      const file = DriveApp.getFileById(this.spreadsheet.getId());
      const parents = file.getParents();

      if (!parents.hasNext()) {
        return null;
      }

      const folder = parents.next();

      return {
        folderId: folder.getId(),
        folderName: folder.getName(),
        folderUrl: folder.getUrl(),
      };
    } catch (error) {
      return null;
    }
  }

  public listAcademicTerms(): AcademicTermRecord[] {
    const sheet = this.getAcademicTermsSheet();
    const values = sheet.getDataRange().getValues();
    const terms: AcademicTermRecord[] = [];

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      const academicYear = String(values[rowIndex][0] || "").trim();
      const term = String(values[rowIndex][1] || "").trim();

      if (!academicYear || !term) {
        continue;
      }

      const spreadsheetId = String(values[rowIndex][2] || "").trim();
      terms.push({
        termKey: AppSpreadsheetController.buildTermKey(academicYear, term),
        academicYear,
        term,
        spreadsheetId,
        spreadsheetUrl: spreadsheetId
          ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
          : "",
        status: String(values[rowIndex][3] || "active").trim(),
        createdAt: String(values[rowIndex][4] || "").trim(),
        updatedAt: String(values[rowIndex][5] || "").trim(),
      });
    }

    return terms.sort((first, second) =>
      first.termKey.localeCompare(second.termKey, "th"),
    );
  }

  public getTermByKey(termKey: string): AcademicTermRecord | null {
    const normalizedTermKey = String(termKey || "").trim();
    return (
      this.listAcademicTerms().find(
        (term) => term.termKey === normalizedTermKey,
      ) || null
    );
  }

  public getActiveTermKey(): string {
    return this.getSetting(
      AppSpreadsheetController.SETTING_KEYS.ACTIVE_TERM_KEY,
    );
  }

  public getActiveTerm(): AcademicTermRecord | null {
    const activeTermKey = this.getActiveTermKey();

    if (!activeTermKey) {
      return null;
    }

    return this.getTermByKey(activeTermKey);
  }

  public setActiveTerm(termKey: string): AcademicTermRecord {
    const term = this.getTermByKey(termKey);

    if (!term || term.status !== "active" || !term.spreadsheetId) {
      throw new Error("ไม่พบเทอมการศึกษาที่พร้อมใช้งาน");
    }

    this.setSetting(
      AppSpreadsheetController.SETTING_KEYS.ACTIVE_TERM_KEY,
      term.termKey,
    );

    return term;
  }

  public createAcademicTerm(
    academicYear: string,
    term: string,
  ): AcademicTermRecord {
    const normalizedAcademicYear = String(academicYear || "").trim();
    const normalizedTerm = String(term || "").trim();

    if (!/^\d{4}$/.test(normalizedAcademicYear)) {
      throw new Error("ปีการศึกษาต้องเป็นตัวเลข 4 หลัก เช่น 2569");
    }

    if (!/^[1-9][0-9]*$/.test(normalizedTerm)) {
      throw new Error("เทอมการศึกษาต้องเป็นตัวเลข เช่น 1 หรือ 2");
    }

    const termKey = AppSpreadsheetController.buildTermKey(
      normalizedAcademicYear,
      normalizedTerm,
    );

    if (this.getTermByKey(termKey)) {
      throw new Error(`มีเทอมการศึกษา ${termKey} อยู่แล้ว`);
    }

    const folderId = this.getTermFolderId();
    if (!folderId) {
      throw new Error("กรุณาตั้งค่า Folder ID ก่อนสร้างเทอมการศึกษา");
    }

    const termSpreadsheet = TermSpreadsheetController.create(termKey, folderId);
    const now = AppSpreadsheetController.getTimestamp();
    const record = {
      academicYear: normalizedAcademicYear,
      term: normalizedTerm,
      spreadsheetId: termSpreadsheet.getSpreadsheet().getId(),
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    const sheet = this.getAcademicTermsSheet();

    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        1,
        AppSpreadsheetController.ACADEMIC_TERM_HEADERS.length,
      )
      .setValues([
        AppSpreadsheetController.ACADEMIC_TERM_HEADERS.map(
          (header) => record[header as keyof typeof record] || "",
        ),
      ]);

    const createdTerm = this.getTermByKey(termKey);
    if (!createdTerm) {
      throw new Error("สร้างเทอมการศึกษาแล้ว แต่ไม่สามารถอ่านข้อมูลกลับมาได้");
    }

    if (!this.getActiveTermKey()) {
      this.setActiveTerm(createdTerm.termKey);
    }

    return createdTerm;
  }

  private static buildTermKey(academicYear: string, term: string): string {
    return `${academicYear}-${term}`;
  }

  private static normalizeDriveId(value: string, urlPathName: string): string {
    const normalizedValue = String(value || "").trim();

    if (!normalizedValue) {
      return "";
    }

    const pathMatch = normalizedValue.match(
      new RegExp(`/${urlPathName}/([a-zA-Z0-9_-]+)`),
    );
    if (pathMatch) {
      return pathMatch[1];
    }

    const queryMatch = normalizedValue.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (queryMatch) {
      return queryMatch[1];
    }

    return normalizedValue;
  }

  public static getTimestamp(): string {
    return Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss",
    );
  }

  public static getTodayDate(): string {
    return Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd",
    );
  }
}
