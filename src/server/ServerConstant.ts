import type { AppPages } from "../shared/types";

export class ServerConstant {
    static readonly APP_PAGES = ["Index", "Admin", "Login", "Setup"] as const;

    static readonly APP_PAGES_TITLEL: Record<AppPages, string> = {
        Index: "ระบบเช็คชื่อนักเรียนรายวัน",
        Admin: "หน้าผู้ดูแลระบบ - ระบบเช็คชื่อนักเรียนรายวัน",
        Login: "เข้าสู่ระบบ - ระบบเช็คชื่อนักเรียนรายวัน",
        Setup: "ตั้งค่าระบบ - ระบบเช็คชื่อนักเรียนรายวัน",
    } as const;

    static readonly PROPERTY_KEYS = {
        adminPasswordHash: "ADMIN_PASSWORD_HASH",
        initialized: "SYSTEM_INITIALIZED",
    } as const;
}
