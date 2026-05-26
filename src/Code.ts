function doGet(
  event: GoogleAppsScript.Events.DoGet,
): GoogleAppsScript.HTML.HtmlOutput {
  return AppController.getInstance().doGet(event);
}

function _login(password: string): { redirectUrl: string } {
  const token = AuthController.getInstance().verifyLoginPassword(password);
  if (!token) {
    throw new Error("รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง");
  }
  const webUrl = AppController.getWebAppUrl();
  const separator = webUrl.indexOf("?") >= 0 ? "&" : "?";

  return {
    redirectUrl:
      webUrl + separator + AuthController.AUTH_QUERY_PARAM + "=" + token,
  };
}

function _saveSetupConfig(
  spreadsheetId: string,
  password: string,
): {
  ok: boolean;
  appSpreadsheetName: string;
  passwordConfigured: boolean;
} {
  const scriptProperties = AppPropertiesSetting.getInstance();
  const currentSpreadsheetId = scriptProperties.getSpreadsheetId();
  const needsSpreadsheetId = !currentSpreadsheetId;
  const needsPassword = !scriptProperties.getPassword();

  if (!needsSpreadsheetId && !needsPassword) {
    throw new Error(
      "ระบบตั้งค่าครบแล้ว หากต้องการเปลี่ยนค่ากรุณาแก้ใน Script Properties โดยตรง",
    );
  }

  let normalizedId: string | null = null;
  let normalizedPassword: string | null = null;
  let targetSpreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet | null = null;

  if (needsSpreadsheetId) {
    const spreadsheetIdTrimmed = String(spreadsheetId || "").trim();
    const match = spreadsheetIdTrimmed.match(
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
    );
    normalizedId = match ? match[1] : spreadsheetIdTrimmed;

    if (!normalizedId) {
      throw new Error("กรุณากรอก SPREADSHEET_ID");
    }

    targetSpreadsheet = SpreadsheetController.getSpreadsheetById(normalizedId);
    if (!targetSpreadsheet) {
      throw new Error(
        "ไม่สามารถเปิดสเปรดชีตได้ กรุณาตรวจสอบ SPREADSHEET_ID อีกครั้ง",
      );
    }
  }

  if (needsPassword) {
    normalizedPassword = String(password || "");

    if (normalizedPassword.length < 6) {
      throw new Error("กรุณาตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร");
    }
  }

  const appSpreadsheet =
    needsSpreadsheetId && targetSpreadsheet
      ? targetSpreadsheet
      : AppSpreadsheetController.getInstance().getSpreadsheet();

  AppSpreadsheetController.ensureSpreadsheetStructure(appSpreadsheet);

  scriptProperties.setMultipleProperties({
    ...(needsSpreadsheetId &&
      normalizedId && {
        [AppPropertiesSetting.FIELDS.APP_SPREADSHEET_ID]: normalizedId,
      }),
    ...(needsPassword &&
      normalizedPassword && {
        [AppPropertiesSetting.FIELDS.APP_PASSWORD]: normalizedPassword,
      }),
  });

  return {
    ok: true,
    appSpreadsheetName: appSpreadsheet.getName(),
    passwordConfigured: true,
  };
}
