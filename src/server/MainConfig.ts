import type {
    AcademicYear,
    CurrentYearRef,
    PublicSystemState,
    SaveSystemSettingsPayload,
    SetupPayload,
    SystemConfig,
} from "../shared/types";
import { ServerConstant } from "./ServerConstant";
import { ServerUtils } from "./ServerUtils";

export class MainConfig {
    static isInitialized(): boolean {
        return this.properties().getProperty(
            ServerConstant.PROPERTY_KEYS.initialized,
        ) === "true";
    }

    static getConfig(): SystemConfig {
        const properties = this.properties();
        const academicYears = ServerUtils.parseJson<AcademicYear[]>(
            properties.getProperty(ServerConstant.PROPERTY_KEYS.academicYears),
            [],
        );
        const currentYear = ServerUtils.parseJson<CurrentYearRef | null>(
            properties.getProperty(ServerConstant.PROPERTY_KEYS.currentYear),
            null,
        );
        return {
            schoolName:
                properties.getProperty(ServerConstant.PROPERTY_KEYS.schoolName) ?? "",
            academicYears,
            currentYear,
        };
    }

    static getPublicState(): PublicSystemState {
        const config = this.getConfig();
        return {
            initialized: this.isInitialized(),
            schoolName: config.schoolName,
            currentYear: ServerUtils.findAcademicYear(
                config.academicYears,
                config.currentYear,
            ),
        };
    }

    static setup(payload: SetupPayload, appPasswordHash: string, adminPasswordHash: string): void {
        ServerUtils.assert(!this.isInitialized(), "ระบบถูกตั้งค่าแล้ว");
        const year = this.normalizeAcademicYear(payload.firstAcademicYear);
        this.validateSchoolName(payload.schoolName);
        this.validateHash(appPasswordHash, "รหัสผ่านครู");
        this.validateHash(adminPasswordHash, "รหัสผ่านผู้ดูแล");
        this.validateAcademicYears([year]);

        this.properties().setProperties(
            {
                [ServerConstant.PROPERTY_KEYS.schoolName]: payload.schoolName.trim(),
                [ServerConstant.PROPERTY_KEYS.appPasswordHash]: appPasswordHash,
                [ServerConstant.PROPERTY_KEYS.adminPasswordHash]: adminPasswordHash,
                [ServerConstant.PROPERTY_KEYS.academicYears]: ServerUtils.stringifyJson([
                    year,
                ]),
                [ServerConstant.PROPERTY_KEYS.currentYear]: ServerUtils.stringifyJson({
                    y: year.y,
                    t: year.t,
                }),
                [ServerConstant.PROPERTY_KEYS.initialized]: "true",
            },
            true,
        );
    }

    static saveSettings(
        payload: SaveSystemSettingsPayload,
        appPasswordHash?: string,
        adminPasswordHash?: string,
    ): SystemConfig {
        this.requireInitialized();
        this.validateSchoolName(payload.schoolName);
        const values: Record<string, string> = {
            [ServerConstant.PROPERTY_KEYS.schoolName]: payload.schoolName.trim(),
        };
        if (appPasswordHash) {
            this.validateHash(appPasswordHash, "รหัสผ่านครู");
            values[ServerConstant.PROPERTY_KEYS.appPasswordHash] = appPasswordHash;
        }
        if (adminPasswordHash) {
            this.validateHash(adminPasswordHash, "รหัสผ่านผู้ดูแล");
            values[ServerConstant.PROPERTY_KEYS.adminPasswordHash] = adminPasswordHash;
        }
        this.properties().setProperties(values, false);
        return this.getConfig();
    }

    static getPasswordHash(role: "app" | "admin"): string {
        const key =
            role === "admin"
                ? ServerConstant.PROPERTY_KEYS.adminPasswordHash
                : ServerConstant.PROPERTY_KEYS.appPasswordHash;
        return this.properties().getProperty(key) ?? "";
    }

    static setAcademicYears(years: AcademicYear[]): void {
        this.validateAcademicYears(years);
        this.properties().setProperty(
            ServerConstant.PROPERTY_KEYS.academicYears,
            ServerUtils.stringifyJson(years),
        );
    }

    static setCurrentYear(ref: CurrentYearRef): SystemConfig {
        const config = this.getConfig();
        const exists = config.academicYears.some(
            (year) => year.y === ref.y && year.t === ref.t,
        );
        ServerUtils.assert(exists, "ไม่พบปีการศึกษา/เทอมที่เลือก");
        this.properties().setProperty(
            ServerConstant.PROPERTY_KEYS.currentYear,
            ServerUtils.stringifyJson(ref),
        );
        return this.getConfig();
    }

    static getCurrentAcademicYear(): AcademicYear {
        const config = this.getConfig();
        const current = ServerUtils.findAcademicYear(
            config.academicYears,
            config.currentYear,
        );
        ServerUtils.assert(current !== null, "ยังไม่ได้ตั้งค่าปีการศึกษาปัจจุบัน");
        return current;
    }

    static requireInitialized(): void {
        ServerUtils.assert(this.isInitialized(), "ระบบยังไม่ได้ตั้งค่า");
    }

    static normalizeAcademicYear(input: AcademicYear): AcademicYear {
        return {
            id: ServerUtils.extractSpreadsheetId(input.id),
            y: ServerUtils.toNumber(input.y, "ปีการศึกษา"),
            t: ServerUtils.toNumber(input.t, "เทอม"),
        };
    }

    static validateAcademicYears(years: AcademicYear[]): void {
        ServerUtils.assert(
            years.length <= ServerConstant.LIMITS.academicYears,
            "เพิ่มปีการศึกษา/เทอมได้ไม่เกิน 50 รายการ",
        );
        const sheetIds = new Set<string>();
        const yearKeys = new Set<string>();
        for (const year of years) {
            ServerUtils.assert(year.id.length > 0, "ต้องระบุ Google Sheet ID");
            ServerUtils.assert(!sheetIds.has(year.id), "Google Sheet ID ห้ามซ้ำ");
            sheetIds.add(year.id);
            const key = ServerUtils.academicYearKey(year);
            ServerUtils.assert(!yearKeys.has(key), "ปีการศึกษาและเทอมห้ามซ้ำ");
            yearKeys.add(key);
        }
    }

    private static validateSchoolName(value: string): void {
        const text = value.trim();
        ServerUtils.assert(text.length > 0, "ต้องระบุชื่อโรงเรียน");
        ServerUtils.assert(
            text.length <= ServerConstant.LIMITS.schoolNameLength,
            "ชื่อโรงเรียนห้ามเกิน 100 ตัวอักษร",
        );
    }

    private static validateHash(hash: string, label: string): void {
        ServerUtils.assert(hash.length > 0, `ต้องระบุ${label}`);
        ServerUtils.assert(
            hash.length <= ServerConstant.LIMITS.passwordHashLength,
            `${label}ยาวเกิน 100 ตัวอักษร`,
        );
    }

    private static properties(): GoogleAppsScript.Properties.Properties {
        return PropertiesService.getScriptProperties();
    }
}
