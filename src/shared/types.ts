/**
 * Shared application types. Prefer `type` over `interface` so server and
 * client contracts stay compact and consistent.
 */
export type AppPages = "Index" | "Setup" | "Login" | "Admin";

export type AuthRole = "app" | "admin";

export type StudentStatus = "active" | "leave";

export type StudentGender = "male" | "female" | "unknown";

export type AttendanceStatus = "present" | "absent" | "late" | "leave";

export type ReportType = "daily" | "detailed";

export type ReportPageOrientation = "portrait" | "landscape";

export type ReportTableDataSource =
    | "daily.school"
    | "daily.classes"
    | "daily.statusStudents"
    | "detailed.students";

export type ReportTableColumn = {
    id: string;
    header: string;
    valueToken: string;
    widthPercent: number;
    align: "left" | "center" | "right";
    mergeRepeatingValues: boolean;
};

export type ReportTableHeaderCell = {
    id: string;
    text: string;
    rowIndex: number;
    columnIndex: number;
    rowSpan: number;
    columnSpan: number;
};

export type ReportTableDefinition = {
    id: string;
    name: string;
    dataSource: ReportTableDataSource;
    showHeader: boolean;
    showTotals: boolean;
    columns: ReportTableColumn[];
    headerRowCount: number;
    headerCells: ReportTableHeaderCell[];
};

export type ReportTemplateSections = {
    headerHtml: string;
    contentHtml: string;
    footerHtml: string;
};

export type ReportTemplateConfig = {
    orientation: ReportPageOrientation;
    pageMarginMm: number;
    fontFamily: string;
    fontSizePt: number;
    title: string;
    subtitle: string;
    showLogo: boolean;
    showStatusDetails: boolean;
    showDutyNotes: boolean;
    showSignatures: boolean;
    showDraftWatermark: boolean;
    sections: ReportTemplateSections;
    tables: ReportTableDefinition[];
};

export type ReportTemplate = {
    id: string;
    name: string;
    reportType: ReportType;
    isDefault: boolean;
    enabled: boolean;
    config: ReportTemplateConfig;
    updatedAt: string;
};

export type AcademicYear = {
    id: string;
    y: number;
    t: number;
};

export type CurrentYearRef = {
    y: number;
    t: number;
};

export type SystemConfig = {
    schoolName: string;
    academicYears: AcademicYear[];
    currentYear: CurrentYearRef | null;
};

export type PublicSystemState = {
    initialized: boolean;
    schoolName: string;
    currentYear: CurrentYearRef | null;
};

export type ClassRoom = {
    id: string;
    grade: string;
    room: string;
};

export type Student = {
    id: string;
    classId: string;
    number: string;
    studentCode: string;
    fullName: string;
    status: StudentStatus;
    gender: StudentGender;
};

export type AttendanceRecord = {
    id: string;
    date: string;
    classId: string;
    studentId: string;
    status: AttendanceStatus;
};

export type AttendanceStudentRow = {
    student: Student;
    record: AttendanceRecord | null;
};

export type AttendanceClassSession = {
    academicYearKey: string;
    revision: string;
    date: string;
    classRoom: ClassRoom;
    checked: boolean;
    rows: AttendanceStudentRow[];
};

export type AttendanceSummary = Record<AttendanceStatus, number>;

export type GenderCounts = Record<StudentGender, number>;

export type GenderAttendanceSummary = Record<StudentGender, AttendanceSummary>;

export type AttendanceOverview = {
    date: string;
    studentCounts: {
        total: number;
        checked: number;
        unchecked: number;
        byGender: GenderCounts;
        checkedByGender: GenderCounts;
        uncheckedByGender: GenderCounts;
    };
    classes: Array<{
        classRoom: ClassRoom;
        studentCount: number;
        studentCountByGender: GenderCounts;
        checked: boolean;
        summary: AttendanceSummary;
        summaryByGender: GenderAttendanceSummary;
    }>;
    total: AttendanceSummary;
    totalByGender: GenderAttendanceSummary;
    attendanceRows: Array<{
        student: Student;
        classRoom: ClassRoom | null;
        status: AttendanceStatus;
    }>;
};

export type AttendanceStatsFilters = {
    dateFrom?: string;
    dateTo?: string;
    classId?: string;
    gender?: StudentGender | "";
};

export type StudentAttendanceStats = {
    student: Student;
    classRoom: ClassRoom | null;
    summary: AttendanceSummary;
    total: number;
};

export type AttendanceStats = {
    filters: AttendanceStatsFilters;
    rows: StudentAttendanceStats[];
};

export type SetupPayload = {
    schoolName: string;
    appPassword: string;
    adminPassword: string;
    firstAcademicYear: AcademicYear;
};

export type LoginResult = {
    token: string;
    role: AuthRole;
    expiresAt: number;
};

export type IndexBootstrap = {
    academicYearKey: string;
    system: PublicSystemState;
    classes: ClassRoom[];
    reportTemplates: ReportTemplate[];
};

export type AdminBootstrap = {
    academicYearKey: string;
    academicYearsRevision: string;
    config: SystemConfig;
    classes: ClassRoom[];
    students: Student[];
    reportTemplates: ReportTemplate[];
};

export type CopyReportTemplatesPayload = {
    sourceAcademicYearKey: string;
    targetAcademicYearKey: string;
    templateIds: string[];
};

export type SaveSystemSettingsPayload = {
    schoolName: string;
    appPassword?: string;
    adminPassword?: string;
};

export type SaveAcademicYearsPayload = {
    academicYears: AcademicYear[];
    currentYearKey: string;
    expectedAcademicYearsRevision: string;
};

export type ForceDeleteStudentsPayload = {
    academicYearKey: string;
    studentIds: string[];
    confirmText: string;
};

export type ForceDeleteStudentsResult = {
    deletedStudents: number;
    deletedAttendanceRecords: number;
};

export type SaveAttendancePayload = {
    academicYearKey: string;
    expectedSessionRevision: string;
    date: string;
    classId: string;
    records: Array<{
        studentId: string;
        status: AttendanceStatus;
    }>;
};

export type SaveAttendanceResult = {
    mode: "created" | "updated";
    records: AttendanceRecord[];
};
