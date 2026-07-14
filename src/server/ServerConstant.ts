import type {
    AppPages,
    AttendanceStatus,
    StudentGender,
    StudentStatus,
} from "../shared/types";

export class ServerConstant {
    static readonly APP_PAGES = ["Index", "Admin", "Login", "Setup"] as const;

    static readonly APP_PAGES_TITLE: Record<AppPages, string> = {
        Index: "ระบบเช็คชื่อนักเรียนรายวัน",
        Admin: "หน้าผู้ดูแลระบบ - ระบบเช็คชื่อนักเรียนรายวัน",
        Login: "เข้าสู่ระบบ - ระบบเช็คชื่อนักเรียนรายวัน",
        Setup: "ตั้งค่าระบบ - ระบบเช็คชื่อนักเรียนรายวัน",
    } as const;

    static readonly PROPERTY_KEYS = {
        schoolName: "schoolName",
        appPasswordHash: "appPasswordHash",
        adminPasswordHash: "adminPasswordHash",
        academicYears: "academicYears",
        currentYear: "currentYear",
        initialized: "initialized",
    } as const;

    static readonly LIMITS = {
        schoolNameLength: 100,
        passwordHashLength: 100,
        academicYears: 50,
        classes: 20,
        students: 500,
        reportTemplates: 30,
        reportTemplateNameLength: 100,
        reportTemplateTextLength: 500,
        reportTemplateConfigLength: 40_000,
        reportTemplateSectionLength: 12_000,
        reportTemplateTables: 10,
        reportTemplateTableColumns: 20,
        tokenTtlMs: 7 * 24 * 60 * 60 * 1000,
    } as const;

    static readonly HEADERS = {
        Classes: ["id", "grade", "room"],
        Students: [
            "id",
            "classId",
            "number",
            "studentCode",
            "fullName",
            "status",
            "gender",
        ],
        Attendance: ["id", "date", "classId", "studentId", "status"],
        ReportTemplates: [
            "id",
            "name",
            "reportType",
            "isDefault",
            "enabled",
            "configJson",
            "updatedAt",
            "headerHtml",
            "contentHtml",
            "footerHtml",
            "tablesJson",
        ],
    } as const;

    static readonly STUDENT_STATUSES: StudentStatus[] = ["active", "leave"];

    static readonly STUDENT_GENDERS: StudentGender[] = [
        "male",
        "female",
        "unknown",
    ];

    static readonly ATTENDANCE_STATUSES: AttendanceStatus[] = [
        "present",
        "absent",
        "late",
        "leave",
    ];
}
