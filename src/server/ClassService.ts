import type { ClassRoom } from "../shared/types";
import { AcademicYearService } from "./AcademicYearService";
import { ServerConstant } from "./ServerConstant";
import { ServerUtils } from "./ServerUtils";
import { SheetDatabase } from "./SheetDatabase";

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
                ),
            );
    }

    static saveClasses(rows: ClassRoom[]): ClassRoom[] {
        const database = AcademicYearService.ensureCurrentSheet();
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
            ServerUtils.assert(row.grade.length > 0, "ต้องระบุระดับชั้น");
            ServerUtils.assert(row.room.length > 0, "ต้องระบุเลขห้อง");
            ServerUtils.assert(!ids.has(row.id), "รหัสห้องเรียนซ้ำ");
            ids.add(row.id);
            const key = `${row.grade}:${row.room}`;
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
            `${a.grade}/${a.room}`.localeCompare(`${b.grade}/${b.room}`, "th"),
        );
    }
}
