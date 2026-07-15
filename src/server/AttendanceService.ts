import type {
    AttendanceClassSession,
    AttendanceOverview,
    AttendanceRecord,
    AttendanceStats,
    AttendanceStatsFilters,
    AttendanceSummary,
    GenderCounts,
    StudentGender,
    SaveAttendancePayload,
    SaveAttendanceResult,
} from "../shared/types";
import {
    AcademicYearService,
    type CurrentAcademicYearContext,
} from "./AcademicYearService";
import { ClassService } from "./ClassService";
import { ServerUtils } from "./ServerUtils";
import { SheetDatabase } from "./SheetDatabase";
import { StudentService } from "./StudentService";

type AttendanceRecordRow = {
    rowNumber: number;
    record: AttendanceRecord;
};

export class AttendanceService {
    static getClassSession(
        classId: string,
        date: string,
        context: CurrentAcademicYearContext =
            AcademicYearService.currentContext(),
    ): AttendanceClassSession {
        ServerUtils.assertDateText(date);
        const { academicYearKey, database } = context;
        const classRoom = ClassService.listClasses(database).find(
            (row) => row.id === classId,
        );
        if (!classRoom) {
            throw new Error("ไม่พบห้องเรียน");
        }
        const students = StudentService.listStudents(classId, database).filter(
            (student) => student.status === "active",
        );
        const records = this.listRecords(database).filter(
            (record) => record.date === date && record.classId === classId,
        );
        const recordByStudent = new Map(
            records.map((record) => [record.studentId, record]),
        );
        return {
            academicYearKey,
            revision: this.sessionRevision(records),
            date,
            classRoom,
            checked: records.length > 0,
            rows: students.map((student) => ({
                student,
                record: recordByStudent.get(student.id) ?? null,
            })),
        };
    }

    static saveAttendance(
        payload: SaveAttendancePayload,
    ): SaveAttendanceResult {
        return this.persistAttendance(payload, false);
    }

    static updateAttendance(
        payload: SaveAttendancePayload,
    ): SaveAttendanceResult {
        return this.persistAttendance(payload, true);
    }

    static getOverview(
        date: string,
        context: CurrentAcademicYearContext =
            AcademicYearService.currentContext(),
    ): AttendanceOverview {
        ServerUtils.assertDateText(date);
        const { database } = context;
        const classes = ClassService.listClasses(database);
        const classById = new Map(classes.map((row) => [row.id, row]));
        const allStudents = StudentService.listStudents(undefined, database);
        const studentById = new Map(
            allStudents.map((student) => [student.id, student]),
        );
        const activeStudents = allStudents.filter(
            (student) => student.status === "active",
        );
        const activeStudentIds = new Set(
            activeStudents.map((student) => student.id),
        );
        const records = this.listRecords(database).filter(
            (record) =>
                record.date === date && activeStudentIds.has(record.studentId),
        );
        const studentCountByClass = new Map<string, number>();
        const studentCountByGender = ServerUtils.emptyGenderCounts();
        const studentCountByClassGender = new Map<string, GenderCounts>();
        activeStudents.forEach((student) => {
            studentCountByClass.set(
                student.classId,
                (studentCountByClass.get(student.classId) ?? 0) + 1,
            );
            studentCountByGender[student.gender] += 1;
            const classGenderCounts =
                studentCountByClassGender.get(student.classId) ??
                ServerUtils.emptyGenderCounts();
            classGenderCounts[student.gender] += 1;
            studentCountByClassGender.set(student.classId, classGenderCounts);
        });
        const checkedStudentIds = new Set(
            records
                .filter((record) => activeStudentIds.has(record.studentId))
                .map((record) => record.studentId),
        );
        const checkedByGender = ServerUtils.emptyGenderCounts();
        const uncheckedByGender = ServerUtils.emptyGenderCounts();
        activeStudents.forEach((student) => {
            const target = checkedStudentIds.has(student.id)
                ? checkedByGender
                : uncheckedByGender;
            target[student.gender] += 1;
        });
        const total = ServerUtils.emptySummary();
        const totalByGender = ServerUtils.emptyGenderAttendanceSummary();
        const recordsByClass = new Map<string, AttendanceRecord[]>();
        records.forEach((record) => {
            const classRecords = recordsByClass.get(record.classId) ?? [];
            classRecords.push(record);
            recordsByClass.set(record.classId, classRecords);
        });
        return {
            date,
            studentCounts: {
                total: activeStudents.length,
                checked: checkedStudentIds.size,
                unchecked: Math.max(
                    activeStudents.length - checkedStudentIds.size,
                    0,
                ),
                byGender: studentCountByGender,
                checkedByGender,
                uncheckedByGender,
            },
            classes: classes.map((classRoom) => {
                const summary = ServerUtils.emptySummary();
                const summaryByGender =
                    ServerUtils.emptyGenderAttendanceSummary();
                const classRecords = recordsByClass.get(classRoom.id) ?? [];
                classRecords.forEach((record) => {
                    const gender =
                        studentById.get(record.studentId)?.gender ?? "unknown";
                    summary[record.status] += 1;
                    total[record.status] += 1;
                    summaryByGender[gender][record.status] += 1;
                    totalByGender[gender][record.status] += 1;
                });
                return {
                    classRoom,
                    studentCount: studentCountByClass.get(classRoom.id) ?? 0,
                    studentCountByGender:
                        studentCountByClassGender.get(classRoom.id) ??
                        ServerUtils.emptyGenderCounts(),
                    checked: classRecords.length > 0,
                    summary,
                    summaryByGender,
                };
            }),
            total,
            totalByGender,
            attendanceRows: records.flatMap((record) => {
                const student = studentById.get(record.studentId);
                return student
                    ? [
                          {
                              student,
                              classRoom: classById.get(record.classId) ?? null,
                              status: record.status,
                          },
                      ]
                    : [];
            }),
        };
    }

    static getStats(
        filters: AttendanceStatsFilters,
        context: CurrentAcademicYearContext =
            AcademicYearService.currentContext(),
    ): AttendanceStats {
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
        const { database } = context;
        const classes = ClassService.listClasses(database);
        const classMap = new Map(
            classes.map((row) => [row.id, row]),
        );
        const classOrder = new Map(
            classes.map((classRoom, index) => [classRoom.id, index]),
        );
        const filterGenderText = ServerUtils.normalizeText(filters.gender);
        const genderFilter: StudentGender | "" = filterGenderText
            ? ServerUtils.normalizeStudentGender(filterGenderText)
            : "";
        const students = StudentService.listStudents(
            filters.classId,
            database,
        )
            .filter(
                (student) =>
                    !genderFilter || student.gender === genderFilter,
            )
            .sort(
                (a, b) =>
                    (classOrder.get(a.classId) ?? Number.MAX_SAFE_INTEGER) -
                        (classOrder.get(b.classId) ??
                            Number.MAX_SAFE_INTEGER) ||
                    a.number.localeCompare(b.number, "th", {
                        numeric: true,
                        sensitivity: "base",
                    }) ||
                    a.fullName.localeCompare(b.fullName, "th"),
            );
        const records = this.listRecords(database).filter((record) => {
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
            const summary =
                byStudent.get(record.studentId) ?? ServerUtils.emptySummary();
            summary[record.status] += 1;
            byStudent.set(record.studentId, summary);
        });
        return {
            filters,
            rows: students.map((student) => {
                const summary =
                    byStudent.get(student.id) ?? ServerUtils.emptySummary();
                return {
                    student,
                    classRoom: classMap.get(student.classId) ?? null,
                    summary,
                    total:
                        summary.present +
                        summary.absent +
                        summary.late +
                        summary.leave,
                };
            }),
        };
    }

    private static persistAttendance(
        payload: SaveAttendancePayload,
        allowUpdate: boolean,
    ): SaveAttendanceResult {
        return ServerUtils.withScriptLock(() => {
            const { database } = AcademicYearService.requireCurrentContext(
                payload.academicYearKey,
            );
            ServerUtils.assertDateText(payload.date);
            const classExists = ClassService.listClasses(database).some(
                (row) => row.id === payload.classId,
            );
            ServerUtils.assert(classExists, "ไม่พบห้องเรียน");
            const activeStudentIds = new Set(
                StudentService.listStudents(payload.classId, database)
                    .filter((student) => student.status === "active")
                    .map((student) => student.id),
            );
            ServerUtils.assert(
                activeStudentIds.size > 0,
                "ห้องเรียนนี้ไม่มีนักเรียนที่กำลังศึกษาอยู่",
            );
            const physicalRecordRows = this.readRecordRows(database);
            const recordRows = this.uniqueRecordRows(physicalRecordRows);
            const existingSessionRows = recordRows.filter(
                ({ record }) =>
                    record.date === payload.date &&
                    record.classId === payload.classId,
            );
            ServerUtils.assert(
                allowUpdate || existingSessionRows.length === 0,
                "ห้องนี้เช็คชื่อของวันที่เลือกไปแล้ว กรุณาใช้ปุ่มแก้ไข",
            );
            ServerUtils.assert(
                !allowUpdate || existingSessionRows.length > 0,
                "ยังไม่มีข้อมูลเช็คชื่อเดิม กรุณาบันทึกการเช็คชื่อก่อน",
            );
            const currentRevision = this.sessionRevision(
                existingSessionRows.map((row) => row.record),
            );
            ServerUtils.assert(
                ServerUtils.normalizeText(payload.expectedSessionRevision) ===
                    currentRevision,
                "ข้อมูลเช็คชื่อถูกแก้ไขจากหน้าจออื่น กรุณาโหลดรายชื่อใหม่ก่อนบันทึก",
            );
            ServerUtils.assert(
                Array.isArray(payload.records),
                "รายการเช็คชื่อไม่ถูกต้อง",
            );
            const recordStudentIds = new Set<string>();
            const incoming = payload.records.map((record) => {
                ServerUtils.assert(
                    activeStudentIds.has(record.studentId),
                    "รายชื่อนักเรียนไม่ถูกต้อง",
                );
                ServerUtils.assertAttendanceStatus(record.status);
                ServerUtils.assert(
                    !recordStudentIds.has(record.studentId),
                    "รายการเช็คชื่อซ้ำ",
                );
                recordStudentIds.add(record.studentId);
                return record;
            });
            ServerUtils.assert(
                incoming.length === activeStudentIds.size,
                "ต้องบันทึกสถานะนักเรียนที่กำลังศึกษาอยู่ให้ครบทุกคน",
            );
            const existingByStudent = new Map(
                existingSessionRows.map((row) => [
                    row.record.studentId,
                    row,
                ]),
            );
            const persisted = incoming.map((record) => ({
                id:
                    existingByStudent.get(record.studentId)?.record.id ??
                    ServerUtils.createShortId("a"),
                date: payload.date,
                classId: payload.classId,
                studentId: record.studentId,
                status: record.status,
            }));
            if (allowUpdate) {
                const updatedRows = persisted.flatMap((record) => {
                    const existing = existingByStudent.get(record.studentId);
                    return existing
                        ? [{ rowNumber: existing.rowNumber, value: record }]
                        : [];
                });
                const appendedRows = persisted.filter(
                    (record) => !existingByStudent.has(record.studentId),
                );
                const updatedStudentIds = new Set(
                    persisted.map((record) => record.studentId),
                );
                const duplicateRows = physicalRecordRows
                    .filter(({ rowNumber, record }) => {
                        const keptRow = existingByStudent.get(record.studentId);
                        return (
                            record.date === payload.date &&
                            record.classId === payload.classId &&
                            updatedStudentIds.has(record.studentId) &&
                            rowNumber !== keptRow?.rowNumber
                        );
                    })
                    .map((row) => row.rowNumber);
                database.writeObjectRows("Attendance", updatedRows);
                database.appendObjects("Attendance", appendedRows);
                database.clearObjectRows("Attendance", duplicateRows);
            } else {
                database.appendObjects("Attendance", persisted);
            }
            return {
                mode: allowUpdate ? "updated" : "created",
                records: persisted,
            };
        });
    }

    private static listRecords(database: SheetDatabase): AttendanceRecord[] {
        return this.uniqueRecordRows(this.readRecordRows(database)).map(
            (row) => row.record,
        );
    }

    private static readRecordRows(
        database: SheetDatabase,
    ): AttendanceRecordRow[] {
        return database
            .readObjectsWithRowNumbers("Attendance")
            .map(({ rowNumber, value }) => {
                ServerUtils.assertAttendanceStatus(value.status);
                return {
                    rowNumber,
                    record: {
                        id: value.id,
                        date: value.date,
                        classId: value.classId,
                        studentId: value.studentId,
                        status: value.status,
                    },
                };
            });
    }

    private static uniqueRecordRows(
        rows: AttendanceRecordRow[],
    ): AttendanceRecordRow[] {
        return [
            ...new Map(
                rows.map((row) => [
                    JSON.stringify([
                        row.record.date,
                        row.record.classId,
                        row.record.studentId,
                    ]),
                    row,
                ]),
            ).values(),
        ];
    }

    private static sessionRevision(records: AttendanceRecord[]): string {
        const canonical = records
            .map((record) => ({
                id: record.id,
                studentId: record.studentId,
                status: record.status,
            }))
            .sort(
                (a, b) =>
                    a.studentId.localeCompare(b.studentId) ||
                    a.id.localeCompare(b.id),
            );
        return ServerUtils.hashText(
            `attendance-session:${JSON.stringify(canonical)}`,
        );
    }
}
