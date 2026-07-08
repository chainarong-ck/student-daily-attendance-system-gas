import type {
    AcademicYear,
    AttendanceStatus,
    CurrentYearRef,
} from "../shared/types";
import { ServerConstant } from "./ServerConstant";

export class ServerUtils {
    static getWebAppUrl(): string {
        try {
            return ScriptApp.getService().getUrl();
        } catch {
            return "";
        }
    }

    static assert(condition: boolean, message: string): asserts condition {
        if (!condition) {
            throw new Error(message);
        }
    }

    static normalizeText(value: unknown): string {
        return String(value ?? "").trim();
    }

    static toNumber(value: unknown, fieldName: string): number {
        const numberValue = Number(value);
        this.assert(Number.isInteger(numberValue), `${fieldName} ต้องเป็นตัวเลขจำนวนเต็ม`);
        return numberValue;
    }

    static parseJson<T>(raw: string | null, fallback: T): T {
        if (!raw) {
            return fallback;
        }
        try {
            return JSON.parse(raw) as T;
        } catch {
            return fallback;
        }
    }

    static stringifyJson(value: unknown): string {
        return JSON.stringify(value);
    }

    static extractSpreadsheetId(input: string): string {
        const value = this.normalizeText(input);
        const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        return match?.[1] ?? value;
    }

    static createShortId(prefix: string): string {
        const time = Date.now().toString(36).slice(-5);
        const random = Math.floor(Math.random() * 1679616)
            .toString(36)
            .padStart(4, "0");
        return `${prefix}_${time}${random}`;
    }

    static todayText(): string {
        return Utilities.formatDate(
            new Date(),
            Session.getScriptTimeZone(),
            "yyyy-MM-dd",
        );
    }

    static isDateText(value: string): boolean {
        return /^\d{4}-\d{2}-\d{2}$/.test(value);
    }

    static assertDateText(value: string): void {
        this.assert(this.isDateText(value), "วันที่ต้องอยู่ในรูปแบบ yyyy-MM-dd");
    }

    static academicYearKey(value: AcademicYear | CurrentYearRef): string {
        return `${value.y}-${value.t}`;
    }

    static findAcademicYear(
        years: AcademicYear[],
        ref: CurrentYearRef | null,
    ): AcademicYear | null {
        if (!ref) {
            return null;
        }
        return (
            years.find((year) => year.y === ref.y && year.t === ref.t) ?? null
        );
    }

    static emptySummary(): Record<AttendanceStatus, number> {
        return {
            present: 0,
            absent: 0,
            late: 0,
            leave: 0,
        };
    }

    static assertAttendanceStatus(status: string): asserts status is AttendanceStatus {
        this.assert(
            ServerConstant.ATTENDANCE_STATUSES.includes(status as AttendanceStatus),
            "สถานะการเช็คชื่อไม่ถูกต้อง",
        );
    }

    static hashText(value: string): string {
        const bytes = Utilities.computeDigest(
            Utilities.DigestAlgorithm.SHA_256,
            value,
            Utilities.Charset.UTF_8,
        );
        return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
    }
}
