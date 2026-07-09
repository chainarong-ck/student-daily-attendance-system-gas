import type {
    AttendanceClassSession,
    AttendanceOverview,
    AttendanceRecord,
    AttendanceStats,
    AttendanceStatsFilters,
    AttendanceSummary,
    SaveAttendancePayload,
    SaveAttendanceResult,
} from "../shared/types";
import { AcademicYearService } from "./AcademicYearService";
import { ClassService } from "./ClassService";
import { ServerUtils } from "./ServerUtils";
import { StudentService } from "./StudentService";

export class AttendanceService {
    static getClassSession(classId: string, date: string): AttendanceClassSession {
        ServerUtils.assertDateText(date);
        const classRoom = ClassService.listClasses().find((row) => row.id === classId);
        if (!classRoom) {
            throw new Error("ไม่พบห้องเรียน");
        }
        const students = StudentService.listStudents(classId).filter(
            (student) => student.status === "active",
        );
        const records = this.listRecords().filter(
            (record) => record.date === date && record.classId === classId,
        );
        const recordByStudent = new Map(records.map((record) => [record.studentId, record]));
        return {
            date,
            classRoom,
            checked: records.length > 0,
            rows: students.map((student) => ({
                student,
                record: recordByStudent.get(student.id) ?? null,
            })),
        };
    }

    static saveAttendance(payload: SaveAttendancePayload): SaveAttendanceResult {
        return this.persistAttendance(payload, false);
    }

    static updateAttendance(payload: SaveAttendancePayload): SaveAttendanceResult {
        return this.persistAttendance(payload, true);
    }

    static getOverview(date: string): AttendanceOverview {
        ServerUtils.assertDateText(date);
        const classes = ClassService.listClasses();
        const records = this.listRecords().filter((record) => record.date === date);
        const total = ServerUtils.emptySummary();
        return {
            date,
            classes: classes.map((classRoom) => {
                const summary = ServerUtils.emptySummary();
                const classRecords = records.filter(
                    (record) => record.classId === classRoom.id,
                );
                classRecords.forEach((record) => {
                    summary[record.status] += 1;
                    total[record.status] += 1;
                });
                return {
                    classRoom,
                    checked: classRecords.length > 0,
                    summary,
                };
            }),
            total,
        };
    }

    static getStats(filters: AttendanceStatsFilters): AttendanceStats {
        if (filters.dateFrom) {
            ServerUtils.assertDateText(filters.dateFrom);
        }
        if (filters.dateTo) {
            ServerUtils.assertDateText(filters.dateTo);
        }
        if (filters.dateFrom && filters.dateTo) {
            ServerUtils.assert(
                filters.dateFrom <= filters.dateTo,
                "ช่วงวันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด",
            );
        }
        const classMap = new Map(ClassService.listClasses().map((row) => [row.id, row]));
        const students = StudentService.listStudents(filters.classId);
        const records = this.listRecords().filter((record) => {
            if (filters.classId && record.classId !== filters.classId) {
                return false;
            }
            if (filters.dateFrom && record.date < filters.dateFrom) {
                return false;
            }
            if (filters.dateTo && record.date > filters.dateTo) {
                return false;
            }
            return true;
        });
        const byStudent = new Map<string, AttendanceSummary>();
        records.forEach((record) => {
            const summary = byStudent.get(record.studentId) ?? ServerUtils.emptySummary();
            summary[record.status] += 1;
            byStudent.set(record.studentId, summary);
        });
        return {
            filters,
            rows: students.map((student) => {
                const summary = byStudent.get(student.id) ?? ServerUtils.emptySummary();
                return {
                    student,
                    classRoom: classMap.get(student.classId) ?? null,
                    summary,
                    total:
                        summary.present + summary.absent + summary.late + summary.leave,
                };
            }),
        };
    }

    private static persistAttendance(
        payload: SaveAttendancePayload,
        allowUpdate: boolean,
    ): SaveAttendanceResult {
        ServerUtils.assertDateText(payload.date);
        const session = this.getClassSession(payload.classId, payload.date);
        ServerUtils.assert(
            allowUpdate || !session.checked,
            "ห้องนี้เช็คชื่อของวันที่เลือกไปแล้ว กรุณาใช้ปุ่มแก้ไข",
        );
        const activeStudentIds = new Set(session.rows.map((row) => row.student.id));
        const recordStudentIds = new Set<string>();
        const incoming = payload.records.map((record) => {
            ServerUtils.assert(activeStudentIds.has(record.studentId), "รายชื่อนักเรียนไม่ถูกต้อง");
            ServerUtils.assertAttendanceStatus(record.status);
            ServerUtils.assert(!recordStudentIds.has(record.studentId), "รายการเช็คชื่อซ้ำ");
            recordStudentIds.add(record.studentId);
            return record;
        });
        ServerUtils.assert(
            incoming.length === activeStudentIds.size,
            "ต้องบันทึกสถานะนักเรียนที่กำลังศึกษาอยู่ให้ครบทุกคน",
        );

        const database = AcademicYearService.ensureCurrentSheet();
        const allRecords = this.listRecords();
        const existingByStudent = new Map(
            allRecords
                .filter(
                    (record) =>
                        record.date === payload.date &&
                        record.classId === payload.classId,
                )
                .map((record) => [record.studentId, record]),
        );
        const persisted = incoming.map((record) => ({
            id: existingByStudent.get(record.studentId)?.id ?? ServerUtils.createShortId("a"),
            date: payload.date,
            classId: payload.classId,
            studentId: record.studentId,
            status: record.status,
        }));
        const replaceKeys = new Set(persisted.map((record) => record.studentId));
        const kept = allRecords.filter(
            (record) =>
                !(
                    record.date === payload.date &&
                    record.classId === payload.classId &&
                    replaceKeys.has(record.studentId)
                ),
        );
        database.writeObjects("Attendance", [...kept, ...persisted]);
        return {
            mode: allowUpdate ? "updated" : "created",
            records: persisted,
        };
    }

    private static listRecords(): AttendanceRecord[] {
        return AcademicYearService.ensureCurrentSheet()
            .readObjects("Attendance")
            .map((row) => {
                ServerUtils.assertAttendanceStatus(row.status);
                return {
                    id: row.id,
                    date: row.date,
                    classId: row.classId,
                    studentId: row.studentId,
                    status: row.status,
                };
            });
    }
}
