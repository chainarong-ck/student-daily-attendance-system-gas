/**
 * Shared application types. Prefer `type` over `interface` so server and
 * client contracts stay compact and consistent.
 */
export type AppPages = "Index" | "Setup" | "Login" | "Admin";

export type AuthRole = "app" | "admin";

export type StudentStatus = "active" | "leave";

export type AttendanceStatus = "present" | "absent" | "late" | "leave";

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
    currentYear: AcademicYear | null;
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
    date: string;
    classRoom: ClassRoom;
    checked: boolean;
    rows: AttendanceStudentRow[];
};

export type AttendanceSummary = Record<AttendanceStatus, number>;

export type AttendanceOverview = {
    date: string;
    classes: Array<{
        classRoom: ClassRoom;
        checked: boolean;
        summary: AttendanceSummary;
    }>;
    total: AttendanceSummary;
};

export type AttendanceStatsFilters = {
    dateFrom?: string;
    dateTo?: string;
    classId?: string;
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
    system: PublicSystemState;
    classes: ClassRoom[];
};

export type AdminBootstrap = {
    config: SystemConfig;
    classes: ClassRoom[];
    students: Student[];
};

export type SaveSystemSettingsPayload = {
    schoolName: string;
    appPassword?: string;
    adminPassword?: string;
};

export type SaveAcademicYearsPayload = {
    academicYears: AcademicYear[];
    currentYearKey: string;
};

export type SaveAttendancePayload = {
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
