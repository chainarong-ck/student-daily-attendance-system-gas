import type { AcademicYear, SystemConfig } from "../shared/types";
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

    static setCurrentAcademicYear(key: string): SystemConfig {
        const [yearText, termText] = key.split("-");
        return MainConfig.setCurrentYear({
            y: ServerUtils.toNumber(yearText, "ปีการศึกษา"),
            t: ServerUtils.toNumber(termText, "เทอม"),
        });
    }

    static ensureCurrentSheet(): SheetDatabase {
        const year = MainConfig.getCurrentAcademicYear();
        const database = new SheetDatabase(year);
        database.ensureSchema();
        return database;
    }
}
