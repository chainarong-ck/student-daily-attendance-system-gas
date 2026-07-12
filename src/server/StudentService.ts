import type {
    ForceDeleteStudentsPayload,
    ForceDeleteStudentsResult,
    Student,
    StudentGender,
    StudentStatus,
} from "../shared/types";
import { AcademicYearService } from "./AcademicYearService";
import { ClassService } from "./ClassService";
import { ServerConstant } from "./ServerConstant";
import { ServerUtils } from "./ServerUtils";
import { SheetDatabase } from "./SheetDatabase";

export class StudentService {
    static listStudents(
        classId?: string,
        database: SheetDatabase = AcademicYearService.ensureCurrentSheet(),
    ): Student[] {
        const filterClassId = ServerUtils.normalizeText(classId);
        return database
            .readObjects("Students")
            .map((row) => {
                const status: StudentStatus =
                    row.status === "leave" ? "leave" : "active";
                const gender = ServerUtils.normalizeStudentGender(row.gender);
                return {
                    id: row.id,
                    classId: row.classId,
                    number: row.number,
                    studentCode: row.studentCode,
                    fullName: row.fullName,
                    status,
                    gender,
                };
            })
            .filter(
                (student) =>
                    !filterClassId || student.classId === filterClassId,
            )
            .sort((a, b) => Number(a.number) - Number(b.number));
    }

    static saveStudentsForClass(classId: string, rows: Student[]): Student[] {
        const targetClassId = ServerUtils.normalizeText(classId);
        const database = AcademicYearService.ensureCurrentSheet();
        const classExists = ClassService.listClasses(database).some(
            (classRoom) => classRoom.id === targetClassId,
        );
        ServerUtils.assert(classExists, "ไม่พบห้องเรียน");
        const currentStudents = this.listStudents(undefined, database);
        const merged = [
            ...currentStudents.filter(
                (student) => student.classId !== targetClassId,
            ),
            ...rows.map((student) => ({
                ...student,
                classId: targetClassId,
            })),
        ];
        return this.saveStudents(merged, database);
    }

    private static saveStudents(
        rows: Student[],
        database: SheetDatabase,
    ): Student[] {
        const classIds = new Set(
            ClassService.listClasses(database).map((row) => row.id),
        );
        const existingStudents = database.readObjects("Students");
        const existingClassByStudent = new Map(
            existingStudents.map((row) => [row.id, row.classId]),
        );
        const attendanceStudentIds = new Set(
            database
                .readObjects("Attendance")
                .map((row) => row.studentId)
                .filter((studentId) => studentId.length > 0),
        );
        const normalized = rows
            .map((row) => {
                const status: StudentStatus =
                    row.status === "leave" ? "leave" : "active";
                const gender: StudentGender =
                    ServerUtils.normalizeStudentGender(row.gender);
                return {
                    id:
                        ServerUtils.normalizeText(row.id) ||
                        ServerUtils.createShortId("s"),
                    classId: ServerUtils.normalizeText(row.classId),
                    number: ServerUtils.normalizeText(row.number),
                    studentCode: ServerUtils.normalizeText(row.studentCode),
                    fullName: ServerUtils.normalizeText(row.fullName),
                    status,
                    gender,
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
            ServerUtils.assert(
                classIds.has(row.classId),
                "ห้องเรียนของนักเรียนไม่ถูกต้อง",
            );
            ServerUtils.assert(row.number.length > 0, "ต้องระบุเลขที่นักเรียน");
            ServerUtils.assert(
                row.fullName.length > 0,
                "ต้องระบุชื่อ-สกุลนักเรียน",
            );
            ServerUtils.assert(
                ServerConstant.STUDENT_STATUSES.includes(row.status),
                "สถานะนักเรียนไม่ถูกต้อง",
            );
            ServerUtils.assert(
                ServerConstant.STUDENT_GENDERS.includes(row.gender),
                "เพศนักเรียนไม่ถูกต้อง",
            );
            const numberKey = `${row.classId}:${row.number}`;
            ServerUtils.assert(
                !numbers.has(numberKey),
                "เลขที่นักเรียนในห้องเดียวกันห้ามซ้ำ",
            );
            numbers.add(numberKey);
            if (row.studentCode) {
                ServerUtils.assert(
                    !codes.has(row.studentCode),
                    "รหัสนักเรียนห้ามซ้ำ",
                );
                codes.add(row.studentCode);
            }
            const existingClassId = existingClassByStudent.get(row.id);
            ServerUtils.assert(
                !(
                    existingClassId &&
                    existingClassId !== row.classId &&
                    attendanceStudentIds.has(row.id)
                ),
                "ไม่สามารถย้ายห้องนักเรียนที่มีประวัติเช็คชื่อแล้วได้",
            );
        }
        const newStudentIds = new Set(normalized.map((row) => row.id));
        const deletedAttendanceStudentId = [...attendanceStudentIds].find(
            (studentId) => !newStudentIds.has(studentId),
        );
        ServerUtils.assert(
            !deletedAttendanceStudentId,
            "ไม่สามารถลบนักเรียนที่มีประวัติเช็คชื่อแล้วได้ กรุณาเปลี่ยนสถานะเป็นออก/พักเรียนแทน",
        );
        database.writeObjects("Students", normalized);
        return normalized.sort((a, b) => Number(a.number) - Number(b.number));
    }

    static forceDeleteStudents(
        payload: ForceDeleteStudentsPayload,
    ): ForceDeleteStudentsResult {
        const studentIds = [
            ...new Set(
                (payload?.studentIds ?? [])
                    .map((studentId) => ServerUtils.normalizeText(studentId))
                    .filter((studentId) => studentId.length > 0),
            ),
        ];
        ServerUtils.assert(
            ServerUtils.normalizeText(payload?.confirmText) === "ลบถาวร",
            "กรุณาพิมพ์คำยืนยันให้ถูกต้องก่อนบังคับลบ",
        );
        ServerUtils.assert(
            studentIds.length > 0,
            "กรุณาเลือกนักเรียนที่ต้องการลบ",
        );
        ServerUtils.assert(
            studentIds.length <= 50,
            "บังคับลบนักเรียนได้ครั้งละไม่เกิน 50 คน",
        );

        const database = AcademicYearService.ensureCurrentSheet();
        const deleteIds = new Set(studentIds);
        const students = database.readObjects("Students");
        const existingStudentIds = new Set(
            students.map((student) => student.id),
        );
        const missingStudentId = studentIds.find(
            (studentId) => !existingStudentIds.has(studentId),
        );
        ServerUtils.assert(
            !missingStudentId,
            "พบนักเรียนที่ไม่มีอยู่ในระบบแล้ว",
        );

        const remainingStudents = students.filter(
            (student) => !deleteIds.has(student.id),
        );
        const deletedStudents = students.length - remainingStudents.length;
        ServerUtils.assert(deletedStudents > 0, "ไม่พบนักเรียนที่ต้องการลบ");

        const attendance = database.readObjects("Attendance");
        const remainingAttendance = attendance.filter(
            (record) => !deleteIds.has(record.studentId),
        );
        const deletedAttendanceRecords =
            attendance.length - remainingAttendance.length;

        database.writeObjects("Students", remainingStudents);
        database.writeObjects("Attendance", remainingAttendance);

        return {
            deletedStudents,
            deletedAttendanceRecords,
        };
    }
}
