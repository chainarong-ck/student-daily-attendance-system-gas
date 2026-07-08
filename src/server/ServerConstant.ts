import type { AppPages, AttendanceStatus, StudentStatus } from "../shared/types";

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
        tokenTtlMs: 7 * 24 * 60 * 60 * 1000,
    } as const;

    static readonly SHEETS = {
        classes: "Classes",
        students: "Students",
        attendance: "Attendance",
    } as const;

    static readonly HEADERS = {
        Classes: ["id", "grade", "room"],
        Students: ["id", "classId", "number", "studentCode", "fullName", "status"],
        Attendance: ["id", "date", "classId", "studentId", "status"],
    } as const;

    static readonly STUDENT_STATUSES: StudentStatus[] = ["active", "leave"];

    static readonly ATTENDANCE_STATUSES: AttendanceStatus[] = [
        "present",
        "absent",
        "late",
        "leave",
    ];
}
