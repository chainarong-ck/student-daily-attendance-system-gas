import type {
    AcademicYear,
    SaveAcademicYearsPayload,
    SystemConfig,
} from "../shared/types";
import { MainConfig } from "./MainConfig";
import { ServerUtils } from "./ServerUtils";
import { SheetDatabase } from "./SheetDatabase";

export class AcademicYearService {
    static addAcademicYear(input: AcademicYear): SystemConfig {
        MainConfig.requireInitialized();
        const year = MainConfig.normalizeAcademicYear(input);
        const config = MainConfig.getConfig();
        const years = [...config.academicYears, year];
        MainConfig.validateAcademicYears(years);
        new SheetDatabase(year).ensureSchema();
        MainConfig.setAcademicYears(years);
        return MainConfig.getConfig();
    }

    static saveAcademicYears(payload: SaveAcademicYearsPayload): SystemConfig {
        MainConfig.requireInitialized();
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
        years.forEach((year) => {
            new SheetDatabase(year).ensureSchema();
        });
        MainConfig.setAcademicYears(years);
        return MainConfig.setCurrentYear(currentYear);
    }

    static setCurrentAcademicYear(key: string): SystemConfig {
        return MainConfig.setCurrentYear(this.parseAcademicYearKey(key));
    }

    static ensureCurrentSheet(): SheetDatabase {
        const year = MainConfig.getCurrentAcademicYear();
        const database = new SheetDatabase(year);
        database.ensureSchema();
        return database;
    }

    private static parseAcademicYearKey(key: string): { y: number; t: number } {
        const [yearText, termText] = key.split("-");
        return {
            y: ServerUtils.toNumber(yearText, "ปีการศึกษา"),
            t: ServerUtils.toNumber(termText, "เทอม"),
        };
    }
}
