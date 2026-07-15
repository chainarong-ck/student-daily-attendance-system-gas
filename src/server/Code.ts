import type {
    AdminBootstrap,
    AppPages,
    AttendanceClassSession,
    AttendanceOverview,
    AttendanceStats,
    AttendanceStatsFilters,
    ClassRoom,
    CopyReportTemplatesPayload,
    ForceDeleteStudentsPayload,
    ForceDeleteStudentsResult,
    IndexBootstrap,
    LoginResult,
    PublicSystemState,
    ReportTemplate,
    SaveAttendancePayload,
    SaveAttendanceResult,
    SaveAcademicYearsPayload,
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
import { ReportTemplateService } from "./ReportTemplateService";
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
    const webAppUrl = ServerUtils.getWebAppUrl();
    template.WebAppUrl = webAppUrl;
    template.PageTitle =
        ServerConstant.APP_PAGES_TITLE[page] ??
        ServerConstant.APP_PAGES_TITLE.Index;
    template.AppContextJsonEncoded = encodeURIComponent(
        JSON.stringify({
            page,
            role: event?.parameter?.role === "admin" ? "admin" : "app",
            webAppUrl,
        }),
    );
    return template
        .evaluate()
        .setTitle(template.PageTitle)
        .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

export function getPublicSystemState(): PublicSystemState {
    return MainConfig.getPublicState();
}

export function setupSystem(payload: SetupPayload): PublicSystemState {
    return ServerUtils.withScriptLock(() => {
        ServerUtils.assert(!MainConfig.isInitialized(), "ระบบถูกตั้งค่าแล้ว");
        const normalizedYear = MainConfig.normalizeAcademicYear(
            payload.firstAcademicYear,
        );
        const appPasswordHash = AuthService.hashPassword(payload.appPassword);
        const adminPasswordHash = AuthService.hashPassword(
            payload.adminPassword,
        );
        new SheetDatabase(normalizedYear).ensureSchema();
        MainConfig.setup(
            { ...payload, firstAcademicYear: normalizedYear },
            appPasswordHash,
            adminPasswordHash,
        );
        return MainConfig.getPublicState();
    });
}

export function loginApp(password: string): LoginResult {
    return AuthService.login("app", password);
}

export function loginAdmin(password: string): LoginResult {
    return AuthService.login("admin", password);
}

export function getIndexBootstrap(token: string): IndexBootstrap {
    AuthService.requireApp(token);
    const context = AcademicYearService.currentContext();
    const { academicYear, academicYearKey, config, database } = context;
    database.ensureSchema();
    return {
        academicYearKey,
        system: {
            initialized: true,
            schoolName: config.schoolName,
            currentYear: { y: academicYear.y, t: academicYear.t },
        },
        classes: ClassService.listClasses(database),
        reportTemplates: ReportTemplateService.listEnabled(database),
    };
}

export function getAdminBootstrap(adminToken: string): AdminBootstrap {
    AuthService.requireAdmin(adminToken);
    return buildAdminBootstrap();
}

function buildAdminBootstrap(): AdminBootstrap {
    const { academicYearKey, academicYearsRevision, config, database } =
        AcademicYearService.currentContext();
    database.ensureSchema();
    return {
        academicYearKey,
        academicYearsRevision,
        config,
        classes: ClassService.listClasses(database),
        students: StudentService.listStudents(undefined, database),
        reportTemplates: ReportTemplateService.list(database),
    };
}

export function saveSystemSettings(
    adminToken: string,
    payload: SaveSystemSettingsPayload,
): SystemConfig {
    AuthService.requireAdmin(adminToken);
    return ServerUtils.withScriptLock(() =>
        MainConfig.saveSettings(
            payload,
            payload.appPassword
                ? AuthService.hashPassword(payload.appPassword)
                : undefined,
            payload.adminPassword
                ? AuthService.hashPassword(payload.adminPassword)
                : undefined,
        ),
    );
}

export function saveAcademicYears(
    adminToken: string,
    payload: SaveAcademicYearsPayload,
): AdminBootstrap {
    AuthService.requireAdmin(adminToken);
    return ServerUtils.withScriptLock(() => {
        AcademicYearService.saveAcademicYears(payload);
        return buildAdminBootstrap();
    });
}

export function saveClasses(
    adminToken: string,
    rows: ClassRoom[],
    academicYearKey: string,
): ClassRoom[] {
    AuthService.requireAdmin(adminToken);
    return ServerUtils.withScriptLock(() => {
        const { database } = AcademicYearService.requireCurrentContext(
            academicYearKey,
        );
        return ClassService.saveClasses(rows, database);
    });
}

export function saveStudents(
    adminToken: string,
    classId: string,
    rows: Student[],
    academicYearKey: string,
): Student[] {
    AuthService.requireAdmin(adminToken);
    return ServerUtils.withScriptLock(() => {
        const { database } = AcademicYearService.requireCurrentContext(
            academicYearKey,
        );
        return StudentService.saveStudentsForClass(classId, rows, database);
    });
}

export function forceDeleteStudents(
    adminToken: string,
    payload: ForceDeleteStudentsPayload,
): ForceDeleteStudentsResult {
    AuthService.requireAdmin(adminToken);
    return ServerUtils.withScriptLock(() => {
        const { database } = AcademicYearService.requireCurrentContext(
            payload.academicYearKey,
        );
        return StudentService.forceDeleteStudents(payload, database);
    });
}

export function getReportTemplates(
    token: string,
    academicYearKey: string,
): ReportTemplate[] {
    AuthService.requireApp(token);
    const { database } = AcademicYearService.requireCurrentContext(
        academicYearKey,
    );
    return ReportTemplateService.listEnabled(database);
}

export function getReportTemplatesForAcademicYear(
    adminToken: string,
    academicYearKey: string,
): ReportTemplate[] {
    AuthService.requireAdmin(adminToken);
    return ReportTemplateService.listForAcademicYear(academicYearKey);
}

export function saveReportTemplates(
    adminToken: string,
    rows: ReportTemplate[],
    academicYearKey: string,
): ReportTemplate[] {
    AuthService.requireAdmin(adminToken);
    return ServerUtils.withScriptLock(() => {
        const { database } = AcademicYearService.requireCurrentContext(
            academicYearKey,
        );
        return ReportTemplateService.save(rows, database);
    });
}

export function copyReportTemplates(
    adminToken: string,
    payload: CopyReportTemplatesPayload,
): ReportTemplate[] {
    AuthService.requireAdmin(adminToken);
    return ServerUtils.withScriptLock(() =>
        ReportTemplateService.copyFromAcademicYear(payload),
    );
}

export function getAttendanceClassSession(
    token: string,
    classId: string,
    date: string,
    academicYearKey: string,
): AttendanceClassSession {
    AuthService.requireApp(token);
    return AttendanceService.getClassSession(
        classId,
        date,
        AcademicYearService.requireCurrentContext(academicYearKey),
    );
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
    academicYearKey: string,
): AttendanceOverview {
    AuthService.requireApp(token);
    return AttendanceService.getOverview(
        date,
        AcademicYearService.requireCurrentContext(academicYearKey),
    );
}

export function getAttendanceStats(
    token: string,
    filters: AttendanceStatsFilters,
    academicYearKey: string,
): AttendanceStats {
    AuthService.requireApp(token);
    return AttendanceService.getStats(
        filters,
        AcademicYearService.requireCurrentContext(academicYearKey),
    );
}
