import type { ClassRoom } from "../shared/types";
import { AcademicYearService } from "./AcademicYearService";
import { ServerConstant } from "./ServerConstant";
import { ServerUtils } from "./ServerUtils";

export class ClassService {
    static listClasses(): ClassRoom[] {
        return AcademicYearService.ensureCurrentSheet()
            .readObjects("Classes")
            .map((row) => ({
                id: row.id,
                grade: row.grade,
                room: row.room,
            }))
            .sort((a, b) => `${a.grade}/${a.room}`.localeCompare(`${b.grade}/${b.room}`, "th"));
    }

    static saveClasses(rows: ClassRoom[]): ClassRoom[] {
        const normalized = rows
            .map((row) => ({
                id: ServerUtils.normalizeText(row.id) || ServerUtils.createShortId("c"),
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
        AcademicYearService.ensureCurrentSheet().writeObjects("Classes", normalized);
        return this.listClasses();
    }
}
