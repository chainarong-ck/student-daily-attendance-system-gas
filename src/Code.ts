function doGet(
  event: GoogleAppsScript.Events.DoGet,
): GoogleAppsScript.HTML.HtmlOutput {
  return AppController.getInstance().doGet(event);
}

function _login(
  password: string,
  redirectParams: { [key: string]: string } = {},
): { redirectUrl: string } {
  const token = AuthController.getInstance().verifyLoginPassword(password);
  if (!token) {
    throw new Error("รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง");
  }

  return {
    redirectUrl: AppController.buildWebAppUrlWithParams({
      ...redirectParams,
      [AuthController.AUTH_QUERY_PARAM]: token,
    }),
  };
}

function _logout(token: string): { ok: boolean; redirectUrl: string } {
  return {
    ok: AuthController.getInstance().logout(token),
    redirectUrl: AppController.getWebAppUrl(),
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
  const scriptProperties = AppPropertiesController.getInstance();
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
        [AppPropertiesController.FIELDS.APP_SPREADSHEET_ID]: normalizedId,
      }),
    ...(needsPassword &&
      normalizedPassword && {
        [AppPropertiesController.FIELDS.APP_PASSWORD]: normalizedPassword,
      }),
  });

  return {
    ok: true,
    appSpreadsheetName: appSpreadsheet.getName(),
    passwordConfigured: true,
  };
}

function _getAppState(authToken: string): AppStateResponse {
  requireAuthorizedSession_(authToken);

  const appSpreadsheet = AppSpreadsheetController.getInstance();
  appSpreadsheet.ensureStructure();

  const terms = appSpreadsheet.listAcademicTerms();
  const activeTermKey = appSpreadsheet.getActiveTermKey();
  const activeTerm = appSpreadsheet.getActiveTerm();
  const today = AppSpreadsheetController.getTodayDate();
  let classes: ClassRecord[] = [];
  let students: StudentRecord[] = [];
  let todaySummary = getEmptyAttendanceOverview_(today);

  if (activeTerm && activeTerm.spreadsheetId) {
    const termSpreadsheet = TermSpreadsheetController.open(
      activeTerm.spreadsheetId,
    );
    termSpreadsheet.ensureStructure();
    classes = termSpreadsheet.listClasses(false);
    students = termSpreadsheet.listStudents("", false);
    todaySummary = termSpreadsheet.getAttendanceOverview(today);
  }

  return {
    appSpreadsheetName: appSpreadsheet.getSpreadsheetName(),
    termFolderId: appSpreadsheet.getTermFolderId(),
    suggestedTermFolder: appSpreadsheet.getSuggestedTermFolder(),
    activeTermKey,
    activeTerm,
    terms,
    classes,
    students,
    todaySummary,
    attendanceStatuses: TermSpreadsheetController.ATTENDANCE_STATUSES,
  };
}

function _saveTermFolderId(
  authToken: string,
  folderId: string,
): TermFolderResult {
  requireAuthorizedSession_(authToken);
  return AppSpreadsheetController.getInstance().saveTermFolderId(folderId);
}

function _createAcademicTerm(
  authToken: string,
  academicYear: string,
  term: string,
): AcademicTermRecord {
  requireAuthorizedSession_(authToken);
  return AppSpreadsheetController.getInstance().createAcademicTerm(
    academicYear,
    term,
  );
}

function _setActiveTerm(
  authToken: string,
  termKey: string,
): AcademicTermRecord {
  requireAuthorizedSession_(authToken);
  return AppSpreadsheetController.getInstance().setActiveTerm(termKey);
}

function _listClasses(authToken: string): ClassRecord[] {
  requireAuthorizedSession_(authToken);
  return getActiveTermSpreadsheet_().listClasses(false);
}

function _saveClass(
  authToken: string,
  input: SaveClassInput,
): ClassRecord {
  requireAuthorizedSession_(authToken);
  return getActiveTermSpreadsheet_().saveClass(input || {});
}

function _archiveClass(
  authToken: string,
  classId: string,
): { ok: boolean } {
  requireAuthorizedSession_(authToken);
  return getActiveTermSpreadsheet_().archiveClass(classId);
}

function _listStudents(
  authToken: string,
  classId = "",
): StudentRecord[] {
  requireAuthorizedSession_(authToken);
  return getActiveTermSpreadsheet_().listStudents(classId, false);
}

function _saveStudent(
  authToken: string,
  input: SaveStudentInput,
): StudentRecord {
  requireAuthorizedSession_(authToken);
  return getActiveTermSpreadsheet_().saveStudent(input || {});
}

function _archiveStudent(
  authToken: string,
  studentId: string,
): { ok: boolean } {
  requireAuthorizedSession_(authToken);
  return getActiveTermSpreadsheet_().archiveStudent(studentId);
}

function _getAttendanceSession(
  authToken: string,
  date: string,
  classId: string,
): AttendanceSession {
  requireAuthorizedSession_(authToken);
  return getActiveTermSpreadsheet_().getAttendanceSession(date, classId);
}

function _saveAttendance(
  authToken: string,
  date: string,
  classId: string,
  records: SaveAttendanceInput[],
): AttendanceSession {
  requireAuthorizedSession_(authToken);
  return getActiveTermSpreadsheet_().saveAttendance(date, classId, records);
}

function requireAuthorizedSession_(authToken: string): void {
  if (
    !AuthController.getInstance().isAuthorizedSession(String(authToken || ""))
  ) {
    throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
  }
}

function getActiveTermSpreadsheet_(): TermSpreadsheetController {
  const activeTerm = AppSpreadsheetController.getInstance().getActiveTerm();

  if (!activeTerm || !activeTerm.spreadsheetId) {
    throw new Error("กรุณาเลือกเทอมการศึกษาที่ต้องการใช้งานก่อน");
  }

  const termSpreadsheet = TermSpreadsheetController.open(
    activeTerm.spreadsheetId,
  );
  termSpreadsheet.ensureStructure();

  return termSpreadsheet;
}

function getEmptyAttendanceOverview_(date: string): AttendanceOverview {
  return {
    date,
    totalClasses: 0,
    totalStudents: 0,
    recordedStudents: 0,
    pendingStudents: 0,
    completedClasses: 0,
  };
}
