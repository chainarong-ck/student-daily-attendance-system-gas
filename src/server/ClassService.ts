import type { ClassRoom } from "../shared/types";
import { AcademicYearService } from "./AcademicYearService";
import { ServerConstant } from "./ServerConstant";
import { ServerUtils } from "./ServerUtils";
import { SheetDatabase } from "./SheetDatabase";

const MAX_CLASS_ID_LENGTH = 100;
const MAX_GRADE_LENGTH = 50;
const MAX_ROOM_LENGTH = 50;

export class ClassService {
    static listClasses(
        database: SheetDatabase = AcademicYearService.ensureCurrentSheet(),
    ): ClassRoom[] {
        return database
            .readObjects("Classes")
            .map((row) => ({
                id: row.id,
                grade: row.grade,
                room: row.room,
            }))
            .sort((a, b) =>
                `${a.grade}/${a.room}`.localeCompare(
                    `${b.grade}/${b.room}`,
                    "th",
                    { numeric: true, sensitivity: "base" },
                ),
            );
    }

    static saveClasses(
        rows: ClassRoom[],
        database: SheetDatabase = AcademicYearService.ensureCurrentSheet(),
    ): ClassRoom[] {
        ServerUtils.assert(Array.isArray(rows), "ข้อมูลห้องเรียนไม่ถูกต้อง");
        const normalized = rows
            .map((row) => ({
                id:
                    ServerUtils.normalizeText(row.id) ||
                    ServerUtils.createShortId("c"),
                grade: ServerUtils.normalizeText(row.grade),
                room: ServerUtils.normalizeText(row.room),
            }))
            .filter((row) => row.grade.length > 0 || row.room.length > 0);
        ServerUtils.assert(
            normalized.length <= ServerConstant.LIMITS.classes,
            "เพิ่มห้องเรียนได้ไม่เกิน 20 ห้อง",
        );
        const ids = new Set<string>();
        const keys = new Set<string>();
        for (const row of normalized) {
            ServerUtils.assert(
                row.id.length <= MAX_CLASS_ID_LENGTH,
                `รหัสห้องเรียนห้ามเกิน ${MAX_CLASS_ID_LENGTH} ตัวอักษร`,
            );
            ServerUtils.assert(row.grade.length > 0, "ต้องระบุระดับชั้น");
            ServerUtils.assert(
                row.grade.length <= MAX_GRADE_LENGTH,
                `ระดับชั้นห้ามเกิน ${MAX_GRADE_LENGTH} ตัวอักษร`,
            );
            ServerUtils.assert(row.room.length > 0, "ต้องระบุเลขห้อง");
            ServerUtils.assert(
                row.room.length <= MAX_ROOM_LENGTH,
                `เลขห้องห้ามเกิน ${MAX_ROOM_LENGTH} ตัวอักษร`,
            );
            ServerUtils.assert(!ids.has(row.id), "รหัสห้องเรียนซ้ำ");
            ids.add(row.id);
            const key = JSON.stringify([row.grade, row.room]);
            ServerUtils.assert(!keys.has(key), "ระดับชั้นและเลขห้องห้ามซ้ำ");
            keys.add(key);
        }
        const newClassIds = new Set(normalized.map((row) => row.id));
        const blockedStudent = database
            .readObjects("Students")
            .find((row) => row.classId && !newClassIds.has(row.classId));
        ServerUtils.assert(
            !blockedStudent,
            "ไม่สามารถลบห้องเรียนที่ยังมีนักเรียนอยู่ได้ กรุณาย้ายนักเรียนหรือลบนักเรียนก่อน",
        );
        database.writeObjects("Classes", normalized);
        return this.sortClasses(normalized);
    }

    private static sortClasses(rows: ClassRoom[]): ClassRoom[] {
        return rows.sort((a, b) =>
            `${a.grade}/${a.room}`.localeCompare(
                `${b.grade}/${b.room}`,
                "th",
                { numeric: true, sensitivity: "base" },
            ),
        );
    }
}
