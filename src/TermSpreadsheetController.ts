type SheetRecordData = {
  rowNumber: number;
  data: { [key: string]: string };
};

class TermSpreadsheetController {
  public static ATTENDANCE_STATUSES = ["มา", "ขาด", "ลา", "ป่วย", "สาย"];
  private static CLASSES_SHEET_NAME = "Classes";
  private static STUDENTS_SHEET_NAME = "Students";
  private static ATTENDANCE_SHEET_NAME = "Attendance";
  private static CLASS_HEADERS = [
    "classId",
    "level",
    "room",
    "displayName",
    "status",
    "sortOrder",
    "createdAt",
    "updatedAt",
  ];
  private static STUDENT_HEADERS = [
    "studentId",
    "classId",
    "studentCode",
    "prefix",
    "firstName",
    "lastName",
    "gender",
    "status",
    "sortOrder",
    "createdAt",
    "updatedAt",
  ];
  private static ATTENDANCE_HEADERS = [
    "attendanceId",
    "attendanceDate",
    "classId",
    "studentId",
    "status",
    "note",
    "recordedAt",
    "updatedAt",
  ];

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

  public static create(
    termKey: string,
    folderId: string,
  ): TermSpreadsheetController {
    let folder: GoogleAppsScript.Drive.Folder;
    try {
      folder = DriveApp.getFolderById(folderId);
      folder.getName();
    } catch (error) {
      throw new Error("ไม่สามารถเปิดโฟลเดอร์สำหรับสร้างไฟล์เทอมได้");
    }

    const spreadsheet = SpreadsheetApp.create(
      `ระบบเช็คชื่อรายวัน ${String(termKey || "").trim()}`,
    );
    const file = DriveApp.getFileById(spreadsheet.getId());
    file.moveTo(folder);

    TermSpreadsheetController.ensureSpreadsheetStructure(spreadsheet);

    return new TermSpreadsheetController(spreadsheet);
  }

  public static ensureSpreadsheetStructure(
    spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  ): void {
    SpreadsheetController.ensureSheet(
      spreadsheet,
      TermSpreadsheetController.CLASSES_SHEET_NAME,
      TermSpreadsheetController.CLASS_HEADERS,
    );
    SpreadsheetController.ensureSheet(
      spreadsheet,
      TermSpreadsheetController.STUDENTS_SHEET_NAME,
      TermSpreadsheetController.STUDENT_HEADERS,
    );
    SpreadsheetController.ensureSheet(
      spreadsheet,
      TermSpreadsheetController.ATTENDANCE_SHEET_NAME,
      TermSpreadsheetController.ATTENDANCE_HEADERS,
    );
  }

  public getSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
    return this.spreadsheet;
  }

  public getSpreadsheetName(): string {
    return this.spreadsheet.getName();
  }

  public ensureStructure(): void {
    TermSpreadsheetController.ensureSpreadsheetStructure(this.spreadsheet);
  }

  public listClasses(includeInactive = false): ClassRecord[] {
    const records = this.readRecords(
      this.getClassesSheet(),
      TermSpreadsheetController.CLASS_HEADERS,
    );

    return records
      .map((record) => this.toClassRecord(record.data))
      .filter((record) => includeInactive || record.status === "active")
      .sort((first, second) => this.compareBySortOrder(first, second));
  }

  public saveClass(input: SaveClassInput): ClassRecord {
    const level = String(input.level || "").trim();
    const room = String(input.room || "").trim();

    if (!level) {
      throw new Error("กรุณากรอกระดับชั้น");
    }

    if (!room) {
      throw new Error("กรุณากรอกห้องเรียน");
    }

    const sheet = this.getClassesSheet();
    const records = this.readRecords(
      sheet,
      TermSpreadsheetController.CLASS_HEADERS,
    );
    const existingRecord =
      records.find((record) => record.data.classId === input.classId) || null;
    const classId = existingRecord
      ? existingRecord.data.classId
      : TermSpreadsheetController.createId("class");
    const duplicate = records
      .map((record) => this.toClassRecord(record.data))
      .some(
        (record) =>
          record.status === "active" &&
          record.classId !== classId &&
          record.level === level &&
          record.room === room,
      );

    if (duplicate) {
      throw new Error(`มีห้องเรียน ${level}/${room} อยู่แล้ว`);
    }

    const now = AppSpreadsheetController.getTimestamp();
    const sortOrder = this.resolveSortOrder(
      input.sortOrder,
      existingRecord ? existingRecord.data.sortOrder : "",
      records,
    );
    const record: ClassRecord = {
      classId,
      level,
      room,
      displayName: `${level}/${room}`,
      status: "active",
      sortOrder,
      createdAt: existingRecord ? existingRecord.data.createdAt : now,
      updatedAt: now,
    };

    if (existingRecord) {
      this.writeRecord(
        sheet,
        existingRecord.rowNumber,
        TermSpreadsheetController.CLASS_HEADERS,
        record,
      );
      return record;
    }

    this.appendRecord(sheet, TermSpreadsheetController.CLASS_HEADERS, record);
    return record;
  }

  public archiveClass(classId: string): { ok: boolean } {
    const sheet = this.getClassesSheet();
    const records = this.readRecords(
      sheet,
      TermSpreadsheetController.CLASS_HEADERS,
    );
    const existingRecord =
      records.find((record) => record.data.classId === classId) || null;

    if (!existingRecord) {
      throw new Error("ไม่พบห้องเรียนที่ต้องการปิดใช้งาน");
    }

    const archivedRecord = this.toClassRecord(existingRecord.data);
    archivedRecord.status = "inactive";
    archivedRecord.updatedAt = AppSpreadsheetController.getTimestamp();
    this.writeRecord(
      sheet,
      existingRecord.rowNumber,
      TermSpreadsheetController.CLASS_HEADERS,
      archivedRecord,
    );

    return { ok: true };
  }

  public listStudents(
    classId = "",
    includeInactive = false,
  ): StudentRecord[] {
    const normalizedClassId = String(classId || "").trim();
    const activeClassIds = new Set(
      this.listClasses(false).map((record) => record.classId),
    );
    const records = this.readRecords(
      this.getStudentsSheet(),
      TermSpreadsheetController.STUDENT_HEADERS,
    );

    return records
      .map((record) => this.toStudentRecord(record.data))
      .filter(
        (record) =>
          (includeInactive ||
            (record.status === "active" && activeClassIds.has(record.classId))) &&
          (!normalizedClassId || record.classId === normalizedClassId),
      )
      .sort((first, second) => this.compareBySortOrder(first, second));
  }

  public saveStudent(input: SaveStudentInput): StudentRecord {
    const classId = String(input.classId || "").trim();
    const studentCode = String(input.studentCode || "").trim();
    const firstName = String(input.firstName || "").trim();
    const lastName = String(input.lastName || "").trim();

    if (!this.listClasses(false).some((record) => record.classId === classId)) {
      throw new Error("กรุณาเลือกห้องเรียนที่พร้อมใช้งาน");
    }

    if (!studentCode) {
      throw new Error("กรุณากรอกรหัสนักศึกษา");
    }

    if (!firstName) {
      throw new Error("กรุณากรอกชื่อ");
    }

    if (!lastName) {
      throw new Error("กรุณากรอกนามสกุล");
    }

    const sheet = this.getStudentsSheet();
    const records = this.readRecords(
      sheet,
      TermSpreadsheetController.STUDENT_HEADERS,
    );
    const existingRecord =
      records.find((record) => record.data.studentId === input.studentId) ||
      null;
    const studentId = existingRecord
      ? existingRecord.data.studentId
      : TermSpreadsheetController.createId("student");
    const duplicate = records
      .map((record) => this.toStudentRecord(record.data))
      .some(
        (record) =>
          record.status === "active" &&
          record.studentId !== studentId &&
          record.studentCode === studentCode,
      );

    if (duplicate) {
      throw new Error(`มีรหัสนักศึกษา ${studentCode} อยู่แล้ว`);
    }

    const now = AppSpreadsheetController.getTimestamp();
    const sortOrder = this.resolveSortOrder(
      input.sortOrder,
      existingRecord ? existingRecord.data.sortOrder : "",
      records,
    );
    const record: StudentRecord = {
      studentId,
      classId,
      studentCode,
      prefix: String(input.prefix || "").trim(),
      firstName,
      lastName,
      gender: String(input.gender || "ไม่ระบุ").trim(),
      status: "active",
      sortOrder,
      createdAt: existingRecord ? existingRecord.data.createdAt : now,
      updatedAt: now,
    };

    if (existingRecord) {
      this.writeRecord(
        sheet,
        existingRecord.rowNumber,
        TermSpreadsheetController.STUDENT_HEADERS,
        record,
      );
      return record;
    }

    this.appendRecord(sheet, TermSpreadsheetController.STUDENT_HEADERS, record);
    return record;
  }

  public archiveStudent(studentId: string): { ok: boolean } {
    const sheet = this.getStudentsSheet();
    const records = this.readRecords(
      sheet,
      TermSpreadsheetController.STUDENT_HEADERS,
    );
    const existingRecord =
      records.find((record) => record.data.studentId === studentId) || null;

    if (!existingRecord) {
      throw new Error("ไม่พบนักเรียนที่ต้องการปิดใช้งาน");
    }

    const archivedRecord = this.toStudentRecord(existingRecord.data);
    archivedRecord.status = "inactive";
    archivedRecord.updatedAt = AppSpreadsheetController.getTimestamp();
    this.writeRecord(
      sheet,
      existingRecord.rowNumber,
      TermSpreadsheetController.STUDENT_HEADERS,
      archivedRecord,
    );

    return { ok: true };
  }

  public getAttendanceSession(
    date: string,
    classId: string,
  ): AttendanceSession {
    const normalizedDate = this.normalizeDate(date);
    const classRecord = this.requireActiveClass(classId);
    const students = this.listStudents(classRecord.classId, false);
    const attendanceRecords = this.listAttendanceRecords(
      normalizedDate,
      classRecord.classId,
    );
    const attendanceByStudentId = new Map<string, AttendanceRecord>();

    attendanceRecords.forEach((record) => {
      attendanceByStudentId.set(record.studentId, record);
    });

    const statusCounts = this.createStatusCounts();
    let recordedStudents = 0;
    const attendanceStudents = students.map((student) => {
      const attendanceRecord = attendanceByStudentId.get(student.studentId);
      const saved = Boolean(attendanceRecord);
      const attendanceStatus = attendanceRecord
        ? attendanceRecord.status
        : TermSpreadsheetController.ATTENDANCE_STATUSES[0];

      if (saved) {
        recordedStudents += 1;
        statusCounts[attendanceStatus] = (statusCounts[attendanceStatus] || 0) + 1;
      }

      return {
        ...student,
        attendanceId: attendanceRecord ? attendanceRecord.attendanceId : "",
        attendanceStatus,
        note: attendanceRecord ? attendanceRecord.note : "",
        saved,
      };
    });

    return {
      date: normalizedDate,
      classId: classRecord.classId,
      classRecord,
      students: attendanceStudents,
      summary: {
        date: normalizedDate,
        totalStudents: students.length,
        recordedStudents,
        pendingStudents: Math.max(students.length - recordedStudents, 0),
        complete: students.length > 0 && recordedStudents >= students.length,
        statusCounts,
      },
    };
  }

  public saveAttendance(
    date: string,
    classId: string,
    records: SaveAttendanceInput[],
  ): AttendanceSession {
    const normalizedDate = this.normalizeDate(date);
    const classRecord = this.requireActiveClass(classId);
    const activeStudents = this.listStudents(classRecord.classId, false);
    const activeStudentIds = new Set(
      activeStudents.map((student) => student.studentId),
    );
    const sheet = this.getAttendanceSheet();
    const existingRecords = this.readRecords(
      sheet,
      TermSpreadsheetController.ATTENDANCE_HEADERS,
    );
    const now = AppSpreadsheetController.getTimestamp();
    const existingByStudentId = new Map<string, SheetRecordData>();

    existingRecords.forEach((record) => {
      if (
        record.data.attendanceDate === normalizedDate &&
        record.data.classId === classRecord.classId
      ) {
        existingByStudentId.set(record.data.studentId, record);
      }
    });

    const normalizedRecords = Array.isArray(records) ? records : [];

    normalizedRecords.forEach((input) => {
      const studentId = String(input.studentId || "").trim();
      const status = String(input.status || "").trim();
      const note = String(input.note || "").trim();

      if (!activeStudentIds.has(studentId)) {
        throw new Error("พบรายชื่อนักเรียนที่ไม่ได้อยู่ในห้องเรียนนี้");
      }

      if (
        !TermSpreadsheetController.ATTENDANCE_STATUSES.some(
          (allowedStatus) => allowedStatus === status,
        )
      ) {
        throw new Error("พบสถานะการเช็คชื่อที่ไม่ถูกต้อง");
      }

      const existingRecord = existingByStudentId.get(studentId) || null;
      const attendanceRecord: AttendanceRecord = {
        attendanceId: existingRecord
          ? existingRecord.data.attendanceId
          : TermSpreadsheetController.createId("attendance"),
        attendanceDate: normalizedDate,
        classId: classRecord.classId,
        studentId,
        status,
        note,
        recordedAt: existingRecord ? existingRecord.data.recordedAt : now,
        updatedAt: now,
      };

      if (existingRecord) {
        this.writeRecord(
          sheet,
          existingRecord.rowNumber,
          TermSpreadsheetController.ATTENDANCE_HEADERS,
          attendanceRecord,
        );
        return;
      }

      this.appendRecord(
        sheet,
        TermSpreadsheetController.ATTENDANCE_HEADERS,
        attendanceRecord,
      );
    });

    return this.getAttendanceSession(normalizedDate, classRecord.classId);
  }

  public getAttendanceOverview(date: string): AttendanceOverview {
    const normalizedDate = this.normalizeDate(date);
    const classes = this.listClasses(false);
    const students = this.listStudents("", false);
    const activeStudentIds = new Set(
      students.map((student) => student.studentId),
    );
    const classStudentCounts = new Map<string, number>();
    const classRecordedStudentIds = new Map<string, Set<string>>();
    const attendanceRecords = this.listAttendanceRecords(normalizedDate, "");

    classes.forEach((record) => {
      classStudentCounts.set(record.classId, 0);
      classRecordedStudentIds.set(record.classId, new Set<string>());
    });

    students.forEach((student) => {
      classStudentCounts.set(
        student.classId,
        (classStudentCounts.get(student.classId) || 0) + 1,
      );
    });

    attendanceRecords.forEach((record) => {
      if (!activeStudentIds.has(record.studentId)) {
        return;
      }

      const classSet = classRecordedStudentIds.get(record.classId);
      if (classSet) {
        classSet.add(record.studentId);
      }
    });

    let recordedStudents = 0;
    let completedClasses = 0;
    classRecordedStudentIds.forEach((studentIds, currentClassId) => {
      const totalStudents = classStudentCounts.get(currentClassId) || 0;
      recordedStudents += studentIds.size;

      if (totalStudents > 0 && studentIds.size >= totalStudents) {
        completedClasses += 1;
      }
    });

    return {
      date: normalizedDate,
      totalClasses: classes.length,
      totalStudents: students.length,
      recordedStudents,
      pendingStudents: Math.max(students.length - recordedStudents, 0),
      completedClasses,
    };
  }

  private getClassesSheet(): GoogleAppsScript.Spreadsheet.Sheet {
    return SpreadsheetController.ensureSheet(
      this.spreadsheet,
      TermSpreadsheetController.CLASSES_SHEET_NAME,
      TermSpreadsheetController.CLASS_HEADERS,
    );
  }

  private getStudentsSheet(): GoogleAppsScript.Spreadsheet.Sheet {
    return SpreadsheetController.ensureSheet(
      this.spreadsheet,
      TermSpreadsheetController.STUDENTS_SHEET_NAME,
      TermSpreadsheetController.STUDENT_HEADERS,
    );
  }

  private getAttendanceSheet(): GoogleAppsScript.Spreadsheet.Sheet {
    return SpreadsheetController.ensureSheet(
      this.spreadsheet,
      TermSpreadsheetController.ATTENDANCE_SHEET_NAME,
      TermSpreadsheetController.ATTENDANCE_HEADERS,
    );
  }

  private readRecords(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    headers: string[],
  ): SheetRecordData[] {
    const values = sheet.getDataRange().getValues();
    const records: SheetRecordData[] = [];

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      const data: { [key: string]: string } = {};
      headers.forEach((header, columnIndex) => {
        data[header] = TermSpreadsheetController.toCellString(
          values[rowIndex][columnIndex],
        );
      });

      if (headers.some((header) => data[header])) {
        records.push({
          rowNumber: rowIndex + 1,
          data,
        });
      }
    }

    return records;
  }

  private appendRecord(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    headers: string[],
    record: { [key: string]: string },
  ): void {
    sheet
      .getRange(sheet.getLastRow() + 1, 1, 1, headers.length)
      .setValues([headers.map((header) => record[header] || "")]);
  }

  private writeRecord(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    rowNumber: number,
    headers: string[],
    record: { [key: string]: string },
  ): void {
    sheet
      .getRange(rowNumber, 1, 1, headers.length)
      .setValues([headers.map((header) => record[header] || "")]);
  }

  private toClassRecord(data: { [key: string]: string }): ClassRecord {
    const level = data.level || "";
    const room = data.room || "";

    return {
      classId: data.classId || "",
      level,
      room,
      displayName: data.displayName || `${level}/${room}`,
      status: data.status || "active",
      sortOrder: data.sortOrder || "0",
      createdAt: data.createdAt || "",
      updatedAt: data.updatedAt || "",
    };
  }

  private toStudentRecord(data: { [key: string]: string }): StudentRecord {
    return {
      studentId: data.studentId || "",
      classId: data.classId || "",
      studentCode: data.studentCode || "",
      prefix: data.prefix || "",
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      gender: data.gender || "ไม่ระบุ",
      status: data.status || "active",
      sortOrder: data.sortOrder || "0",
      createdAt: data.createdAt || "",
      updatedAt: data.updatedAt || "",
    };
  }

  private toAttendanceRecord(data: { [key: string]: string }): AttendanceRecord {
    return {
      attendanceId: data.attendanceId || "",
      attendanceDate: data.attendanceDate || "",
      classId: data.classId || "",
      studentId: data.studentId || "",
      status: data.status || "",
      note: data.note || "",
      recordedAt: data.recordedAt || "",
      updatedAt: data.updatedAt || "",
    };
  }

  private listAttendanceRecords(
    date: string,
    classId: string,
  ): AttendanceRecord[] {
    const normalizedDate = String(date || "").trim();
    const normalizedClassId = String(classId || "").trim();

    return this.readRecords(
      this.getAttendanceSheet(),
      TermSpreadsheetController.ATTENDANCE_HEADERS,
    )
      .map((record) => this.toAttendanceRecord(record.data))
      .filter(
        (record) =>
          (!normalizedDate || record.attendanceDate === normalizedDate) &&
          (!normalizedClassId || record.classId === normalizedClassId),
      );
  }

  private requireActiveClass(classId: string): ClassRecord {
    const normalizedClassId = String(classId || "").trim();
    const classRecord =
      this.listClasses(false).find(
        (record) => record.classId === normalizedClassId,
      ) || null;

    if (!classRecord) {
      throw new Error("ไม่พบห้องเรียนที่พร้อมใช้งาน");
    }

    return classRecord;
  }

  private normalizeDate(date: string): string {
    const normalizedDate = String(date || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      throw new Error("รูปแบบวันที่ไม่ถูกต้อง");
    }

    return normalizedDate;
  }

  private resolveSortOrder(
    inputSortOrder: string | number | undefined,
    existingSortOrder: string,
    records: SheetRecordData[],
  ): string {
    const normalizedInput = String(inputSortOrder || "").trim();

    if (normalizedInput && /^\d+$/.test(normalizedInput)) {
      return normalizedInput;
    }

    if (existingSortOrder) {
      return existingSortOrder;
    }

    const maxSortOrder = records.reduce((maxValue, record) => {
      const currentValue = Number(record.data.sortOrder || 0);
      return Number.isFinite(currentValue)
        ? Math.max(maxValue, currentValue)
        : maxValue;
    }, 0);

    return String(maxSortOrder + 1);
  }

  private compareBySortOrder(
    first: { sortOrder: string; createdAt: string },
    second: { sortOrder: string; createdAt: string },
  ): number {
    const firstSortOrder = Number(first.sortOrder || 0);
    const secondSortOrder = Number(second.sortOrder || 0);

    if (firstSortOrder !== secondSortOrder) {
      return firstSortOrder - secondSortOrder;
    }

    return first.createdAt.localeCompare(second.createdAt, "th");
  }

  private createStatusCounts(): { [status: string]: number } {
    const counts: { [status: string]: number } = {};
    TermSpreadsheetController.ATTENDANCE_STATUSES.forEach((status) => {
      counts[status] = 0;
    });
    return counts;
  }

  private static createId(prefix: string): string {
    return `${prefix}_${Utilities.getUuid().replace(/-/g, "").slice(0, 16)}`;
  }

  private static toCellString(value: unknown): string {
    if (value instanceof Date) {
      return Utilities.formatDate(
        value,
        Session.getScriptTimeZone(),
        "yyyy-MM-dd HH:mm:ss",
      );
    }

    return String(value || "").trim();
  }
}
