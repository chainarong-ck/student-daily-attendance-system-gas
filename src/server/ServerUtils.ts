import type {
    AcademicYear,
    AttendanceStatus,
    CurrentYearRef,
    GenderAttendanceSummary,
    GenderCounts,
    StudentGender,
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

    static withScriptLock<T>(callback: () => T): T {
        const lock = LockService.getScriptLock();
        lock.waitLock(10_000);
        try {
            let result: T;
            try {
                result = callback();
            } catch (error) {
                try {
                    SpreadsheetApp.flush();
                } catch (flushError) {
                    console.error(
                        "ไม่สามารถ flush การเปลี่ยนแปลงหลังเกิดข้อผิดพลาด",
                        flushError,
                    );
                }
                throw error;
            }
            SpreadsheetApp.flush();
            return result;
        } finally {
            lock.releaseLock();
        }
    }

    static normalizeText(value: unknown): string {
        return String(value ?? "").trim();
    }

    static toNumber(value: unknown, fieldName: string): number {
        const numberValue = Number(value);
        this.assert(
            Number.isSafeInteger(numberValue),
            `${fieldName} ต้องเป็นตัวเลขจำนวนเต็ม`,
        );
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
        return `${prefix}_${Utilities.getUuid().replace(/-/g, "")}`;
    }

    static isDateText(value: string): boolean {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!match) {
            return false;
        }
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        return (
            date.getUTCFullYear() === year &&
            date.getUTCMonth() === month - 1 &&
            date.getUTCDate() === day
        );
    }

    static assertDateText(value: string): void {
        this.assert(
            this.isDateText(value),
            "วันที่ต้องอยู่ในรูปแบบ yyyy-MM-dd",
        );
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

    static emptyGenderCounts(): GenderCounts {
        return {
            male: 0,
            female: 0,
            unknown: 0,
        };
    }

    static emptyGenderAttendanceSummary(): GenderAttendanceSummary {
        return {
            male: this.emptySummary(),
            female: this.emptySummary(),
            unknown: this.emptySummary(),
        };
    }

    static assertAttendanceStatus(
        status: string,
    ): asserts status is AttendanceStatus {
        this.assert(
            ServerConstant.ATTENDANCE_STATUSES.includes(
                status as AttendanceStatus,
            ),
            "สถานะการเช็คชื่อไม่ถูกต้อง",
        );
    }

    static normalizeStudentGender(value: unknown): StudentGender {
        const clean = this.normalizeText(value);
        if (clean === "male" || clean === "ชาย") {
            return "male";
        }
        if (clean === "female" || clean === "หญิง") {
            return "female";
        }
        return "unknown";
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
