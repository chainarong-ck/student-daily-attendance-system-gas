import type { SaveAcademicYearsPayload, SystemConfig } from "../shared/types";
import { MainConfig } from "./MainConfig";
import { ServerUtils } from "./ServerUtils";
import { SheetDatabase } from "./SheetDatabase";

export class AcademicYearService {
    static saveAcademicYears(payload: SaveAcademicYearsPayload): SystemConfig {
        MainConfig.requireInitialized();
        const previousSheetIds = new Set(
            MainConfig.getConfig().academicYears.map((year) => year.id),
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
        const year = MainConfig.getCurrentAcademicYear();
        return new SheetDatabase(year);
    }

    private static parseAcademicYearKey(key: string): { y: number; t: number } {
        const [yearText, termText] = key.split("-");
        return {
            y: ServerUtils.toNumber(yearText, "ปีการศึกษา"),
            t: ServerUtils.toNumber(termText, "เทอม"),
        };
    }
}
