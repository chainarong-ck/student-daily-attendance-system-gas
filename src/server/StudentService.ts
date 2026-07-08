import type { Student, StudentStatus } from "../shared/types";
import { AcademicYearService } from "./AcademicYearService";
import { ClassService } from "./ClassService";
import { ServerConstant } from "./ServerConstant";
import { ServerUtils } from "./ServerUtils";

export class StudentService {
    static listStudents(classId?: string): Student[] {
        const filterClassId = ServerUtils.normalizeText(classId);
        return AcademicYearService.ensureCurrentSheet()
            .readObjects("Students")
            .map((row) => {
                const status: StudentStatus =
                    row.status === "leave" ? "leave" : "active";
                return {
                    id: row.id,
                    classId: row.classId,
                    number: row.number,
                    studentCode: row.studentCode,
                    fullName: row.fullName,
                    status,
                };
            })
            .filter((student) => !filterClassId || student.classId === filterClassId)
            .sort((a, b) => Number(a.number) - Number(b.number));
    }

    static saveStudents(rows: Student[]): Student[] {
        const classIds = new Set(ClassService.listClasses().map((row) => row.id));
        const normalized = rows
            .map((row) => {
                const status: StudentStatus =
                    row.status === "leave" ? "leave" : "active";
                return {
                    id:
                        ServerUtils.normalizeText(row.id) ||
                        ServerUtils.createShortId("s"),
                    classId: ServerUtils.normalizeText(row.classId),
                    number: ServerUtils.normalizeText(row.number),
                    studentCode: ServerUtils.normalizeText(row.studentCode),
                    fullName: ServerUtils.normalizeText(row.fullName),
                    status,
                };
            })
            .filter(
                (row) =>
                    row.classId.length > 0 ||
                    row.number.length > 0 ||
                    row.studentCode.length > 0 ||
                    row.fullName.length > 0,
            );
        ServerUtils.assert(
            normalized.length <= ServerConstant.LIMITS.students,
            "เพิ่มนักเรียนได้ไม่เกิน 500 คน",
        );
        const ids = new Set<string>();
        const numbers = new Set<string>();
        const codes = new Set<string>();
        for (const row of normalized) {
            ServerUtils.assert(!ids.has(row.id), "รหัสนักเรียนซ้ำ");
            ids.add(row.id);
            ServerUtils.assert(classIds.has(row.classId), "ห้องเรียนของนักเรียนไม่ถูกต้อง");
            ServerUtils.assert(row.number.length > 0, "ต้องระบุเลขที่นักเรียน");
            ServerUtils.assert(row.fullName.length > 0, "ต้องระบุชื่อ-สกุลนักเรียน");
            ServerUtils.assert(
                ServerConstant.STUDENT_STATUSES.includes(row.status),
                "สถานะนักเรียนไม่ถูกต้อง",
            );
            const numberKey = `${row.classId}:${row.number}`;
            ServerUtils.assert(!numbers.has(numberKey), "เลขที่นักเรียนในห้องเดียวกันห้ามซ้ำ");
            numbers.add(numberKey);
            if (row.studentCode) {
                ServerUtils.assert(!codes.has(row.studentCode), "รหัสนักเรียนห้ามซ้ำ");
                codes.add(row.studentCode);
            }
        }
        AcademicYearService.ensureCurrentSheet().writeObjects("Students", normalized);
        return this.listStudents();
    }
}
