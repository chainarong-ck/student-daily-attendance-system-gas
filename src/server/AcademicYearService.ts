import type {
    AcademicYear,
    SaveAcademicYearsPayload,
    SystemConfig,
} from "../shared/types";
import { MainConfig } from "./MainConfig";
import { ServerUtils } from "./ServerUtils";
import { SheetDatabase } from "./SheetDatabase";

export type CurrentAcademicYearContext = {
    config: SystemConfig;
    academicYear: AcademicYear;
    academicYearKey: string;
    academicYearsRevision: string;
    database: SheetDatabase;
};

export class AcademicYearService {
    static saveAcademicYears(payload: SaveAcademicYearsPayload): SystemConfig {
        MainConfig.requireInitialized();
        ServerUtils.assert(
            Array.isArray(payload?.academicYears),
            "ข้อมูลปีการศึกษาไม่ถูกต้อง",
        );
        const context = this.currentContext();
        const expectedRevision = ServerUtils.normalizeText(
            payload.expectedAcademicYearsRevision,
        );
        ServerUtils.assert(
            expectedRevision.length > 0,
            "หน้าจอนี้เป็นเวอร์ชันเก่า กรุณาโหลดหน้าใหม่ก่อนบันทึกข้อมูล",
        );
        ServerUtils.assert(
            expectedRevision === context.academicYearsRevision,
            "รายการปีการศึกษาถูกเปลี่ยนแปลง กรุณาโหลดหน้าใหม่ก่อนบันทึก",
        );
        const previousSheetIds = new Set(
            context.config.academicYears.map((year) => year.id),
        );
        const years = payload.academicYears.map((year) =>
            MainConfig.normalizeAcademicYear(year),
        );
        ServerUtils.assert(
            years.length > 0,
            "ต้องมีปีการศึกษา/เทอมอย่างน้อย 1 รายการ",
        );
        MainConfig.validateAcademicYears(years);
        const currentYear = this.parseAcademicYearKey(payload.currentYearKey);
        const currentExists = years.some(
            (year) => year.y === currentYear.y && year.t === currentYear.t,
        );
        ServerUtils.assert(
            currentExists,
            "ปีการศึกษาปัจจุบันต้องเป็นรายการที่มีอยู่ในตาราง",
        );
        years
            .filter((year) => !previousSheetIds.has(year.id))
            .forEach((year) => new SheetDatabase(year).ensureSchema());
        return MainConfig.setAcademicYearsAndCurrent(years, currentYear);
    }

    static ensureCurrentSheet(): SheetDatabase {
        return this.currentContext().database;
    }

    static currentContext(): CurrentAcademicYearContext {
        MainConfig.requireInitialized();
        const config = MainConfig.getConfig();
        const academicYear = ServerUtils.findAcademicYear(
            config.academicYears,
            config.currentYear,
        );
        ServerUtils.assert(
            academicYear !== null,
            "ยังไม่ได้ตั้งค่าปีการศึกษาปัจจุบัน",
        );
        const academicYearKey = this.currentAcademicYearKey(academicYear);
        const academicYearsRevision = this.academicYearsRevision(config);
        return {
            config,
            academicYear,
            academicYearKey,
            academicYearsRevision,
            database: new SheetDatabase(academicYear),
        };
    }

    static requireCurrentContext(
        expectedAcademicYearKey: unknown,
    ): CurrentAcademicYearContext {
        const expected = ServerUtils.normalizeText(expectedAcademicYearKey);
        ServerUtils.assert(
            expected.length > 0,
            "หน้าจอนี้เป็นเวอร์ชันเก่า กรุณาโหลดหน้าใหม่ก่อนบันทึกข้อมูล",
        );
        const context = this.currentContext();
        ServerUtils.assert(
            expected === context.academicYearKey,
            "ปีการศึกษาปัจจุบันมีการเปลี่ยนแปลง กรุณาโหลดหน้าใหม่ก่อนทำรายการ",
        );
        return context;
    }

    static getSheetForAcademicYearKey(key: string): SheetDatabase {
        const ref = this.parseAcademicYearKey(key);
        const year = ServerUtils.findAcademicYear(
            MainConfig.getConfig().academicYears,
            ref,
        );
        ServerUtils.assert(year !== null, "ไม่พบปีการศึกษา/เทอมต้นทาง");
        const database = new SheetDatabase(year);
        database.ensureSchema();
        return database;
    }

    private static currentAcademicYearKey(year: AcademicYear): string {
        return ServerUtils.hashText(
            `current-academic-year:${year.y}:${year.t}:${year.id}`,
        );
    }

    private static academicYearsRevision(config: SystemConfig): string {
        const academicYears = config.academicYears
            .map((year) => ({ id: year.id, y: year.y, t: year.t }))
            .sort(
                (a, b) =>
                    a.y - b.y || a.t - b.t || a.id.localeCompare(b.id),
            );
        const currentYear = config.currentYear
            ? { y: config.currentYear.y, t: config.currentYear.t }
            : null;
        return ServerUtils.hashText(
            `academic-years:${JSON.stringify({ academicYears, currentYear })}`,
        );
    }

    private static parseAcademicYearKey(key: string): { y: number; t: number } {
        const match = /^(\d+)-([1-3])$/.exec(ServerUtils.normalizeText(key));
        ServerUtils.assert(
            match !== null,
            "รูปแบบปีการศึกษา/เทอมไม่ถูกต้อง",
        );
        return {
            y: ServerUtils.toNumber(match[1], "ปีการศึกษา"),
            t: ServerUtils.toNumber(match[2], "เทอม"),
        };
    }
}
