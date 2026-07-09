import type {
    AcademicYear,
    AdminBootstrap,
    AppPages,
    AttendanceClassSession,
    AttendanceOverview,
    AttendanceStats,
    AttendanceStatsFilters,
    ClassRoom,
    IndexBootstrap,
    LoginResult,
    PublicSystemState,
    SaveAttendancePayload,
    SaveAttendanceResult,
    SaveSystemSettingsPayload,
    SetupPayload,
    Student,
    SystemConfig,
} from "../shared/types";
import { AcademicYearService } from "./AcademicYearService";
import { AttendanceService } from "./AttendanceService";
import { AuthService } from "./AuthService";
import { ClassService } from "./ClassService";
import { MainConfig } from "./MainConfig";
import { ServerConstant } from "./ServerConstant";
import { ServerUtils } from "./ServerUtils";
import { SheetDatabase } from "./SheetDatabase";
import { StudentService } from "./StudentService";

export function doGet(
    event?: GoogleAppsScript.Events.DoGet,
): GoogleAppsScript.HTML.HtmlOutput {
    const setupState = MainConfig.isInitialized();
    const requestedPage = event?.parameter?.page ?? "";
    const page: AppPages = (
        !setupState
            ? "Setup"
            : ServerConstant.APP_PAGES.includes(requestedPage as AppPages)
              ? requestedPage
              : "Index"
    ) as AppPages;

    const template = HtmlService.createTemplateFromFile(
        page,
    ) as GoogleAppsScript.HTML.HtmlTemplate & {
        AppContextJsonEncoded: string;
        WebAppUrl: string;
        PageTitle: string;
    };
    template.WebAppUrl = ServerUtils.getWebAppUrl();
    template.PageTitle =
        ServerConstant.APP_PAGES_TITLE[page] ??
        ServerConstant.APP_PAGES_TITLE.Index;
    template.AppContextJsonEncoded = encodeURIComponent(
        JSON.stringify({
            page,
            role: event?.parameter?.role === "admin" ? "admin" : "app",
            webAppUrl: ServerUtils.getWebAppUrl(),
        }),
    );
    return template
        .evaluate()
        .setTitle("ระบบเช็คชื่อนักเรียน")
        .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

export function getPublicSystemState(): PublicSystemState {
    return MainConfig.getPublicState();
}

export function setupSystem(payload: SetupPayload): PublicSystemState {
    ServerUtils.assert(!MainConfig.isInitialized(), "ระบบถูกตั้งค่าแล้ว");
    const normalizedYear = MainConfig.normalizeAcademicYear(payload.firstAcademicYear);
    const appPasswordHash = AuthService.hashPassword(payload.appPassword);
    const adminPasswordHash = AuthService.hashPassword(payload.adminPassword);
    new SheetDatabase(normalizedYear).ensureSchema();
    MainConfig.setup(
        { ...payload, firstAcademicYear: normalizedYear },
        appPasswordHash,
        adminPasswordHash,
    );
    return MainConfig.getPublicState();
}

export function loginApp(password: string): LoginResult {
    return AuthService.login("app", password);
}

export function loginAdmin(password: string): LoginResult {
    return AuthService.login("admin", password);
}

export function getIndexBootstrap(token: string): IndexBootstrap {
    AuthService.requireApp(token);
    return {
        system: MainConfig.getPublicState(),
        classes: ClassService.listClasses(),
    };
}

export function getAdminBootstrap(adminToken: string): AdminBootstrap {
    AuthService.requireAdmin(adminToken);
    return {
        config: MainConfig.getConfig(),
        classes: ClassService.listClasses(),
        students: StudentService.listStudents(),
    };
}

export function saveSystemSettings(
    adminToken: string,
    payload: SaveSystemSettingsPayload,
): SystemConfig {
    AuthService.requireAdmin(adminToken);
    return MainConfig.saveSettings(
        payload,
        payload.appPassword ? AuthService.hashPassword(payload.appPassword) : undefined,
        payload.adminPassword
            ? AuthService.hashPassword(payload.adminPassword)
            : undefined,
    );
}

export function addAcademicYear(
    adminToken: string,
    payload: AcademicYear,
): SystemConfig {
    AuthService.requireAdmin(adminToken);
    return AcademicYearService.addAcademicYear(payload);
}

export function setCurrentAcademicYear(
    adminToken: string,
    academicYearKey: string,
): SystemConfig {
    AuthService.requireAdmin(adminToken);
    return AcademicYearService.setCurrentAcademicYear(academicYearKey);
}

export function listClasses(adminToken: string): ClassRoom[] {
    AuthService.requireAdmin(adminToken);
    return ClassService.listClasses();
}

export function saveClasses(adminToken: string, rows: ClassRoom[]): ClassRoom[] {
    AuthService.requireAdmin(adminToken);
    return ClassService.saveClasses(rows);
}

export function listStudents(adminToken: string, classId?: string): Student[] {
    AuthService.requireAdmin(adminToken);
    return StudentService.listStudents(classId);
}

export function saveStudents(adminToken: string, rows: Student[]): Student[] {
    AuthService.requireAdmin(adminToken);
    return StudentService.saveStudents(rows);
}

export function getAttendanceClassSession(
    token: string,
    classId: string,
    date: string,
): AttendanceClassSession {
    AuthService.requireApp(token);
    return AttendanceService.getClassSession(classId, date);
}

export function saveAttendance(
    token: string,
    payload: SaveAttendancePayload,
): SaveAttendanceResult {
    AuthService.requireApp(token);
    return AttendanceService.saveAttendance(payload);
}

export function updateAttendance(
    token: string,
    payload: SaveAttendancePayload,
): SaveAttendanceResult {
    AuthService.requireApp(token);
    return AttendanceService.updateAttendance(payload);
}

export function getAttendanceOverview(
    token: string,
    date: string,
): AttendanceOverview {
    AuthService.requireApp(token);
    return AttendanceService.getOverview(date);
}

export function getAttendanceStats(
    token: string,
    filters: AttendanceStatsFilters,
): AttendanceStats {
    AuthService.requireApp(token);
    return AttendanceService.getStats(filters);
}
