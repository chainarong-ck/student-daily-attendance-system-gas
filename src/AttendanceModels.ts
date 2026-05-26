type AppSettingMap = { [key: string]: string };

type AcademicTermRecord = {
  termKey: string;
  academicYear: string;
  term: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type TermFolderResult = {
  folderId: string;
  folderName: string;
  folderUrl: string;
};

type ClassRecord = {
  classId: string;
  level: string;
  room: string;
  displayName: string;
  status: string;
  sortOrder: string;
  createdAt: string;
  updatedAt: string;
};

type SaveClassInput = {
  classId?: string;
  level?: string;
  room?: string;
  sortOrder?: string | number;
};

type StudentRecord = {
  studentId: string;
  classId: string;
  studentCode: string;
  prefix: string;
  firstName: string;
  lastName: string;
  gender: string;
  status: string;
  sortOrder: string;
  createdAt: string;
  updatedAt: string;
};

type SaveStudentInput = {
  studentId?: string;
  classId?: string;
  studentCode?: string;
  prefix?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  sortOrder?: string | number;
};

type AttendanceRecord = {
  attendanceId: string;
  attendanceDate: string;
  classId: string;
  studentId: string;
  status: string;
  note: string;
  recordedAt: string;
  updatedAt: string;
};

type SaveAttendanceInput = {
  studentId?: string;
  status?: string;
  note?: string;
};

type AttendanceStudentRecord = StudentRecord & {
  attendanceId: string;
  attendanceStatus: string;
  note: string;
  saved: boolean;
};

type AttendanceSummary = {
  date: string;
  totalStudents: number;
  recordedStudents: number;
  pendingStudents: number;
  complete: boolean;
  statusCounts: { [status: string]: number };
};

type AttendanceSession = {
  date: string;
  classId: string;
  classRecord: ClassRecord;
  students: AttendanceStudentRecord[];
  summary: AttendanceSummary;
};

type AttendanceOverview = {
  date: string;
  totalClasses: number;
  totalStudents: number;
  recordedStudents: number;
  pendingStudents: number;
  completedClasses: number;
};

type AppStateResponse = {
  appSpreadsheetName: string;
  termFolderId: string;
  suggestedTermFolder: TermFolderResult | null;
  activeTermKey: string;
  activeTerm: AcademicTermRecord | null;
  terms: AcademicTermRecord[];
  classes: ClassRecord[];
  students: StudentRecord[];
  todaySummary: AttendanceOverview;
  attendanceStatuses: string[];
};
