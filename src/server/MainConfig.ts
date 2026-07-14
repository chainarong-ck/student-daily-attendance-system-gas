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
        return (
            this.properties().getProperty(
                ServerConstant.PROPERTY_KEYS.initialized,
            ) === "true"
        );
    }

    static getConfig(): SystemConfig {
        return this.configFromProperties(this.properties().getProperties());
    }

    static getPublicState(): PublicSystemState {
        const properties = this.properties().getProperties();
        const config = this.configFromProperties(properties);
        const currentYear = ServerUtils.findAcademicYear(
            config.academicYears,
            config.currentYear,
        );
        return {
            initialized:
                properties[ServerConstant.PROPERTY_KEYS.initialized] === "true",
            schoolName: config.schoolName,
            currentYear: currentYear
                ? { y: currentYear.y, t: currentYear.t }
                : null,
        };
    }

    private static configFromProperties(
        properties: Record<string, string>,
    ): SystemConfig {
        const academicYears = ServerUtils.parseJson<AcademicYear[]>(
            properties[ServerConstant.PROPERTY_KEYS.academicYears] ?? null,
            [],
        );
        const currentYear = ServerUtils.parseJson<CurrentYearRef | null>(
            properties[ServerConstant.PROPERTY_KEYS.currentYear] ?? null,
            null,
        );
        return {
            schoolName:
                properties[ServerConstant.PROPERTY_KEYS.schoolName] ?? "",
            academicYears,
            currentYear,
        };
    }

    static setup(
        payload: SetupPayload,
        appPasswordHash: string,
        adminPasswordHash: string,
    ): void {
        ServerUtils.assert(!this.isInitialized(), "ระบบถูกตั้งค่าแล้ว");
        const year = this.normalizeAcademicYear(payload.firstAcademicYear);
        this.validateSchoolName(payload.schoolName);
        this.validateHash(appPasswordHash, "รหัสผ่านครู");
        this.validateHash(adminPasswordHash, "รหัสผ่านผู้ดูแล");
        this.validateAcademicYears([year]);

        this.properties().setProperties(
            {
                [ServerConstant.PROPERTY_KEYS.schoolName]:
                    payload.schoolName.trim(),
                [ServerConstant.PROPERTY_KEYS.appPasswordHash]: appPasswordHash,
                [ServerConstant.PROPERTY_KEYS.adminPasswordHash]:
                    adminPasswordHash,
                [ServerConstant.PROPERTY_KEYS.academicYears]:
                    ServerUtils.stringifyJson([year]),
                [ServerConstant.PROPERTY_KEYS.currentYear]:
                    ServerUtils.stringifyJson({
                        y: year.y,
                        t: year.t,
                    }),
                [ServerConstant.PROPERTY_KEYS.initialized]: "true",
            },
            false,
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
            [ServerConstant.PROPERTY_KEYS.schoolName]:
                payload.schoolName.trim(),
        };
        if (appPasswordHash) {
            this.validateHash(appPasswordHash, "รหัสผ่านครู");
            values[ServerConstant.PROPERTY_KEYS.appPasswordHash] =
                appPasswordHash;
        }
        if (adminPasswordHash) {
            this.validateHash(adminPasswordHash, "รหัสผ่านผู้ดูแล");
            values[ServerConstant.PROPERTY_KEYS.adminPasswordHash] =
                adminPasswordHash;
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

    static getAuthHashes(): { app: string; admin: string } {
        const values = this.properties().getProperties();
        return {
            app: values[ServerConstant.PROPERTY_KEYS.appPasswordHash] ?? "",
            admin: values[ServerConstant.PROPERTY_KEYS.adminPasswordHash] ?? "",
        };
    }

    static setAcademicYearsAndCurrent(
        years: AcademicYear[],
        currentYear: CurrentYearRef,
    ): SystemConfig {
        this.validateAcademicYears(years);
        const exists = years.some(
            (year) => year.y === currentYear.y && year.t === currentYear.t,
        );
        ServerUtils.assert(exists, "ไม่พบปีการศึกษา/เทอมที่เลือก");
        this.properties().setProperties(
            {
                [ServerConstant.PROPERTY_KEYS.academicYears]:
                    ServerUtils.stringifyJson(years),
                [ServerConstant.PROPERTY_KEYS.currentYear]:
                    ServerUtils.stringifyJson(currentYear),
            },
            false,
        );
        return this.getConfig();
    }

    static getCurrentAcademicYear(): AcademicYear {
        const config = this.getConfig();
        const current = ServerUtils.findAcademicYear(
            config.academicYears,
            config.currentYear,
        );
        ServerUtils.assert(
            current !== null,
            "ยังไม่ได้ตั้งค่าปีการศึกษาปัจจุบัน",
        );
        return current;
    }

    static requireInitialized(): void {
        ServerUtils.assert(this.isInitialized(), "ระบบยังไม่ได้ตั้งค่า");
    }

    static normalizeAcademicYear(input: AcademicYear): AcademicYear {
        const year = ServerUtils.toNumber(input.y, "ปีการศึกษา");
        const term = ServerUtils.toNumber(input.t, "เทอม");
        ServerUtils.assert(year > 0, "ปีการศึกษาต้องมากกว่า 0");
        ServerUtils.assert(
            term >= 1 && term <= 3,
            "เทอมต้องอยู่ระหว่าง 1 ถึง 3",
        );
        return {
            id: ServerUtils.extractSpreadsheetId(input.id),
            y: year,
            t: term,
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
            ServerUtils.assert(
                !sheetIds.has(year.id),
                "Google Sheet ID ห้ามซ้ำ",
            );
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
