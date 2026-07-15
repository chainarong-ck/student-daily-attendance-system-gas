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

const MAX_STUDENT_ID_LENGTH = 100;
const MAX_CLASS_ID_LENGTH = 100;
const MAX_STUDENT_NUMBER_LENGTH = 20;
const MAX_STUDENT_CODE_LENGTH = 100;
const MAX_STUDENT_NAME_LENGTH = 200;

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
            .sort((a, b) => this.compareStudentNumbers(a, b));
    }

    static saveStudentsForClass(
        classId: string,
        rows: Student[],
        database: SheetDatabase = AcademicYearService.ensureCurrentSheet(),
    ): Student[] {
        ServerUtils.assert(Array.isArray(rows), "ข้อมูลนักเรียนไม่ถูกต้อง");
        const targetClassId = ServerUtils.normalizeText(classId);
        const classIds = new Set(
            ClassService.listClasses(database).map((classRoom) => classRoom.id),
        );
        ServerUtils.assert(classIds.has(targetClassId), "ไม่พบห้องเรียน");
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
        return this.saveStudents(
            merged,
            database,
            classIds,
            currentStudents,
        );
    }

    private static saveStudents(
        rows: Student[],
        database: SheetDatabase,
        classIds: Set<string>,
        existingStudents: Student[],
    ): Student[] {
        const existingClassByStudent = new Map(
            existingStudents.map((student) => [student.id, student.classId]),
        );
        const normalized = rows
            .map((row) => {
                const statusText = ServerUtils.normalizeText(row.status);
                ServerUtils.assert(
                    ServerConstant.STUDENT_STATUSES.includes(
                        statusText as StudentStatus,
                    ),
                    "สถานะนักเรียนไม่ถูกต้อง",
                );
                const genderText = ServerUtils.normalizeText(row.gender);
                ServerUtils.assert(
                    ServerConstant.STUDENT_GENDERS.includes(
                        genderText as StudentGender,
                    ),
                    "เพศนักเรียนไม่ถูกต้อง",
                );
                return {
                    id:
                        ServerUtils.normalizeText(row.id) ||
                        ServerUtils.createShortId("s"),
                    classId: ServerUtils.normalizeText(row.classId),
                    number: ServerUtils.normalizeText(row.number),
                    studentCode: ServerUtils.normalizeText(row.studentCode),
                    fullName: ServerUtils.normalizeText(row.fullName),
                    status: statusText as StudentStatus,
                    gender: genderText as StudentGender,
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
            ServerUtils.assert(
                row.id.length <= MAX_STUDENT_ID_LENGTH,
                `รหัสภายในนักเรียนห้ามเกิน ${MAX_STUDENT_ID_LENGTH} ตัวอักษร`,
            );
            ServerUtils.assert(!ids.has(row.id), "รหัสนักเรียนซ้ำ");
            ids.add(row.id);
            ServerUtils.assert(
                row.classId.length <= MAX_CLASS_ID_LENGTH,
                `รหัสห้องเรียนห้ามเกิน ${MAX_CLASS_ID_LENGTH} ตัวอักษร`,
            );
            ServerUtils.assert(
                classIds.has(row.classId),
                "ห้องเรียนของนักเรียนไม่ถูกต้อง",
            );
            ServerUtils.assert(row.number.length > 0, "ต้องระบุเลขที่นักเรียน");
            ServerUtils.assert(
                row.number.length <= MAX_STUDENT_NUMBER_LENGTH,
                `เลขที่นักเรียนห้ามเกิน ${MAX_STUDENT_NUMBER_LENGTH} ตัวอักษร`,
            );
            ServerUtils.assert(
                row.studentCode.length <= MAX_STUDENT_CODE_LENGTH,
                `รหัสนักเรียนห้ามเกิน ${MAX_STUDENT_CODE_LENGTH} ตัวอักษร`,
            );
            ServerUtils.assert(
                row.fullName.length > 0,
                "ต้องระบุชื่อ-สกุลนักเรียน",
            );
            ServerUtils.assert(
                row.fullName.length <= MAX_STUDENT_NAME_LENGTH,
                `ชื่อ-สกุลนักเรียนห้ามเกิน ${MAX_STUDENT_NAME_LENGTH} ตัวอักษร`,
            );
            const numberKey = JSON.stringify([row.classId, row.number]);
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
        }
        const newStudentIds = new Set(normalized.map((row) => row.id));
        const newClassByStudent = new Map(
            normalized.map((row) => [row.id, row.classId]),
        );
        const needsAttendanceCheck = existingStudents.some(
            (student) =>
                !newStudentIds.has(student.id) ||
                newClassByStudent.get(student.id) !== student.classId,
        );
        const attendanceStudentIds = needsAttendanceCheck
            ? new Set(
                  database
                      .readObjects("Attendance")
                      .map((row) => row.studentId)
                      .filter((studentId) => studentId.length > 0),
              )
            : new Set<string>();
        normalized.forEach((row) => {
            const existingClassId = existingClassByStudent.get(row.id);
            ServerUtils.assert(
                !(
                    existingClassId &&
                    existingClassId !== row.classId &&
                    attendanceStudentIds.has(row.id)
                ),
                "ไม่สามารถย้ายห้องนักเรียนที่มีประวัติเช็คชื่อแล้วได้",
            );
        });
        const deletedAttendanceStudentId = [...attendanceStudentIds].find(
            (studentId) => !newStudentIds.has(studentId),
        );
        ServerUtils.assert(
            !deletedAttendanceStudentId,
            "ไม่สามารถลบนักเรียนที่มีประวัติเช็คชื่อแล้วได้ กรุณาเปลี่ยนสถานะเป็นออก/พักเรียนแทน",
        );
        database.writeObjects("Students", normalized);
        return normalized.sort((a, b) => this.compareStudentNumbers(a, b));
    }

    static forceDeleteStudents(
        payload: ForceDeleteStudentsPayload,
        database: SheetDatabase = AcademicYearService.ensureCurrentSheet(),
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

        const deletedAttendanceRows = database
            .readObjectsWithRowNumbers("Attendance")
            .filter((row) => deleteIds.has(row.value.studentId));
        const deletedAttendanceRecords = deletedAttendanceRows.length;

        try {
            database.clearObjectRows(
                "Attendance",
                deletedAttendanceRows.map((row) => row.rowNumber),
            );
            database.writeObjects("Students", remainingStudents);
            // Surface queued Sheets errors here so the targeted rollback below
            // still has the original rows and their physical positions.
            SpreadsheetApp.flush();
        } catch (error) {
            try {
                database.writeObjects("Students", students);
                database.writeObjectRows("Attendance", deletedAttendanceRows);
                SpreadsheetApp.flush();
            } catch (rollbackError) {
                console.error(
                    "ไม่สามารถย้อนคืนข้อมูลหลังบังคับลบนักเรียนล้มเหลว",
                    rollbackError,
                );
            }
            throw error;
        }

        return {
            deletedStudents,
            deletedAttendanceRecords,
        };
    }

    private static compareStudentNumbers(a: Student, b: Student): number {
        return a.number.localeCompare(b.number, "th", {
            numeric: true,
            sensitivity: "base",
        });
    }
}
