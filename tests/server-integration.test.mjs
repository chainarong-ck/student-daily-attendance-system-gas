import assert from "node:assert/strict";
import { test } from "node:test";

import { createGasRuntime } from "./helpers/gas-runtime.mjs";

const FIRST_YEAR = {
    id: "sheet-term-1",
    y: 2568,
    t: 1,
};

function initializeSystem() {
    const runtime = createGasRuntime();
    runtime.createSpreadsheet(FIRST_YEAR.id);
    const setupPayload = {
        schoolName: "โรงเรียนทดสอบ",
        appPassword: "teacher-secret",
        adminPassword: "admin-secret",
        firstAcademicYear: FIRST_YEAR,
    };
    const state = runtime.plain(runtime.api.setupSystem(setupPayload));
    return { runtime, setupPayload, state };
}

function loginBoth(runtime) {
    return {
        app: runtime.plain(runtime.api.loginApp("teacher-secret")),
        admin: runtime.plain(runtime.api.loginAdmin("admin-secret")),
    };
}

function attendanceRevision(runtime, token, yearKey, classId, date) {
    return runtime.plain(
        runtime.api.getAttendanceClassSession(
            token,
            classId,
            date,
            yearKey,
        ),
    ).revision;
}

test("setup initializes sheets and enforces authentication roles", () => {
    const runtime = createGasRuntime();
    runtime.createSpreadsheet(FIRST_YEAR.id);

    assert.deepEqual(runtime.plain(runtime.api.getPublicSystemState()), {
        initialized: false,
        schoolName: "",
        currentYear: null,
    });

    const payload = {
        schoolName: "  โรงเรียนทดสอบ  ",
        appPassword: "teacher-secret",
        adminPassword: "admin-secret",
        firstAcademicYear: FIRST_YEAR,
    };
    const state = runtime.plain(runtime.api.setupSystem(payload));
    assert.deepEqual(state, {
        initialized: true,
        schoolName: "โรงเรียนทดสอบ",
        currentYear: { y: 2568, t: 1 },
    });
    assert.deepEqual(runtime.getSheetNames(FIRST_YEAR.id), [
        "Classes",
        "Students",
        "Attendance",
        "ReportTemplates",
    ]);
    const properties = runtime.getProperties();
    assert.match(properties.authSigningSecret, /^[a-f0-9]{64}$/);
    assert.notEqual(
        properties.authSigningSecret,
        properties.appPasswordHash,
    );
    assert.throws(() => runtime.api.setupSystem(payload), /ระบบถูกตั้งค่าแล้ว/);
    assert.throws(
        () => runtime.api.loginApp("wrong-password"),
        /รหัสผ่านไม่ถูกต้อง/,
    );

    const { app, admin } = loginBoth(runtime);
    assert.equal(app.role, "app");
    assert.equal(admin.role, "admin");
    const appBootstrap = runtime.plain(
        runtime.api.getIndexBootstrap(app.token),
    );
    const adminBootstrap = runtime.plain(
        runtime.api.getAdminBootstrap(admin.token),
    );
    assert.ok(appBootstrap.academicYearKey);
    assert.equal(adminBootstrap.academicYearKey, appBootstrap.academicYearKey);
    assert.ok(adminBootstrap.academicYearsRevision);
    assert.throws(
        () => runtime.api.getAdminBootstrap(app.token),
        /กรุณาเข้าสู่ระบบใหม่/,
    );
    assert.throws(
        () => runtime.api.getIndexBootstrap(admin.token),
        /กรุณาเข้าสู่ระบบใหม่/,
    );
    assert.ok(runtime.getFlushCount() >= 1);
    assert.deepEqual(
        runtime.getLockEvents().slice(0, 2).map((event) => event.type),
        ["wait", "release"],
    );
});

test("academic-year writes reject stale screen state before mutating data", () => {
    const { runtime } = initializeSystem();
    runtime.createSpreadsheet("sheet-term-2");
    const { admin } = loginBoth(runtime);
    const years = [FIRST_YEAR, { id: "sheet-term-2", y: 2568, t: 2 }];
    const initialBootstrap = runtime.plain(
        runtime.api.getAdminBootstrap(admin.token),
    );
    const initialYearKey = initialBootstrap.academicYearKey;
    const initialRevision = initialBootstrap.academicYearsRevision;

    assert.throws(
        () =>
            runtime.api.saveAcademicYears(admin.token, {
                academicYears: years,
                currentYearKey: "2568-2",
                expectedAcademicYearsRevision: "stale-revision",
            }),
        /รายการปีการศึกษาถูกเปลี่ยนแปลง/,
    );
    assert.deepEqual(
        runtime.plain(runtime.api.getPublicSystemState()).currentYear,
        { y: 2568, t: 1 },
    );
    assert.deepEqual(runtime.getSheetNames("sheet-term-2"), []);

    const expandedBootstrap = runtime.plain(
        runtime.api.saveAcademicYears(admin.token, {
            academicYears: years,
            currentYearKey: "2568-1",
            expectedAcademicYearsRevision: initialRevision,
        }),
    );
    assert.equal(expandedBootstrap.academicYearKey, initialYearKey);
    assert.notEqual(
        expandedBootstrap.academicYearsRevision,
        initialRevision,
    );
    assert.deepEqual(expandedBootstrap.config.currentYear, { y: 2568, t: 1 });
    assert.deepEqual(runtime.getSheetNames("sheet-term-2"), [
        "Classes",
        "Students",
        "Attendance",
        "ReportTemplates",
    ]);

    assert.throws(
        () =>
            runtime.api.saveAcademicYears(admin.token, {
                academicYears: years,
                currentYearKey: "2568-2",
                expectedAcademicYearsRevision: initialRevision,
            }),
        /รายการปีการศึกษาถูกเปลี่ยนแปลง/,
    );
    const switchedBootstrap = runtime.plain(
        runtime.api.saveAcademicYears(admin.token, {
            academicYears: years,
            currentYearKey: "2568-2",
            expectedAcademicYearsRevision:
                expandedBootstrap.academicYearsRevision,
        }),
    );
    assert.notEqual(switchedBootstrap.academicYearKey, initialYearKey);
    assert.deepEqual(switchedBootstrap.config.currentYear, { y: 2568, t: 2 });

    assert.throws(
        () =>
            runtime.api.saveClasses(
                admin.token,
                [{ id: "stale-class", grade: "ม.1", room: "1" }],
                initialYearKey,
            ),
        /ปีการศึกษาปัจจุบันมีการเปลี่ยนแปลง/,
    );
    assert.deepEqual(
        runtime.getSheetObjects("sheet-term-2", "Classes"),
        [],
    );
});

test("attendance update preserves unrelated class and date history", () => {
    const { runtime } = initializeSystem();
    const { app, admin } = loginBoth(runtime);
    const yearKey = runtime.plain(
        runtime.api.getIndexBootstrap(app.token),
    ).academicYearKey;

    runtime.api.saveClasses(
        admin.token,
        [
            { id: "c1", grade: "ม.1", room: "1" },
            { id: "c2", grade: "ม.1", room: "=2+2" },
        ],
        yearKey,
    );
    assert.equal(
        runtime
            .getSheetObjects(FIRST_YEAR.id, "Classes")
            .find((row) => row.id === "c2")?.room,
        "=2+2",
    );
    assert.ok(
        runtime
            .getSheetOperations(FIRST_YEAR.id, "Classes")
            .some((operation) =>
                operation.values?.some((row) => row.includes("'=2+2")),
            ),
        "formula-like class data must be written with a literal-text prefix",
    );
    runtime.api.saveStudents(
        admin.token,
        "c1",
        [
            {
                id: "s1",
                classId: "c1",
                number: "1",
                studentCode: "1001",
                fullName: "นักเรียน หนึ่ง",
                status: "active",
                gender: "male",
            },
            {
                id: "s2",
                classId: "c1",
                number: "2",
                studentCode: "1002",
                fullName: "นักเรียน สอง",
                status: "active",
                gender: "female",
            },
        ],
        yearKey,
    );
    runtime.api.saveStudents(
        admin.token,
        "c2",
        [
            {
                id: "s3",
                classId: "c2",
                number: "1",
                studentCode: "2001",
                fullName: "นักเรียน สาม",
                status: "active",
                gender: "female",
            },
        ],
        yearKey,
    );

    const firstSession = runtime.plain(
        runtime.api.saveAttendance(app.token, {
            academicYearKey: yearKey,
            expectedSessionRevision: attendanceRevision(
                runtime,
                app.token,
                yearKey,
                "c1",
                "2026-07-14",
            ),
            date: "2026-07-14",
            classId: "c1",
            records: [
                { studentId: "s1", status: "present" },
                { studentId: "s2", status: "absent" },
            ],
        }),
    );
    runtime.api.saveAttendance(app.token, {
        academicYearKey: yearKey,
        expectedSessionRevision: attendanceRevision(
            runtime,
            app.token,
            yearKey,
            "c2",
            "2026-07-14",
        ),
        date: "2026-07-14",
        classId: "c2",
        records: [{ studentId: "s3", status: "late" }],
    });
    runtime.api.saveAttendance(app.token, {
        academicYearKey: yearKey,
        expectedSessionRevision: attendanceRevision(
            runtime,
            app.token,
            yearKey,
            "c1",
            "2026-07-15",
        ),
        date: "2026-07-15",
        classId: "c1",
        records: [
            { studentId: "s1", status: "leave" },
            { studentId: "s2", status: "present" },
        ],
    });

    const before = runtime.getSheetObjects(FIRST_YEAR.id, "Attendance");
    const unrelatedBefore = before.filter(
        (row) => !(row.date === "2026-07-14" && row.classId === "c1"),
    );
    const firstIds = new Map(
        firstSession.records.map((record) => [record.studentId, record.id]),
    );

    const updateRevision = attendanceRevision(
        runtime,
        app.token,
        yearKey,
        "c1",
        "2026-07-14",
    );
    const updatePayload = {
        academicYearKey: yearKey,
        expectedSessionRevision: updateRevision,
        date: "2026-07-14",
        classId: "c1",
        records: [
            { studentId: "s1", status: "late" },
            { studentId: "s2", status: "present" },
        ],
    };
    const updated = runtime.plain(
        runtime.api.updateAttendance(app.token, {
            ...updatePayload,
        }),
    );
    assert.equal(updated.mode, "updated");
    assert.deepEqual(
        new Map(updated.records.map((record) => [record.studentId, record.id])),
        firstIds,
    );

    const after = runtime.getSheetObjects(FIRST_YEAR.id, "Attendance");
    const unrelatedAfter = after.filter(
        (row) => !(row.date === "2026-07-14" && row.classId === "c1"),
    );
    assert.equal(after.length, 5);
    assert.deepEqual(unrelatedAfter, unrelatedBefore);
    assert.throws(
        () => runtime.api.updateAttendance(app.token, updatePayload),
        /ข้อมูลเช็คชื่อถูกแก้ไขจากหน้าจออื่น/,
    );

    const overview = runtime.plain(
        runtime.api.getAttendanceOverview(
            app.token,
            "2026-07-14",
            yearKey,
        ),
    );
    assert.deepEqual(overview.total, {
        present: 1,
        absent: 0,
        late: 2,
        leave: 0,
    });
    assert.equal(overview.studentCounts.checked, 3);

    const classTwoStats = runtime.plain(
        runtime.api.getAttendanceStats(
            app.token,
            {
                dateFrom: "2026-07-14",
                dateTo: "2026-07-15",
                classId: "c2",
            },
            yearKey,
        ),
    );
    assert.equal(classTwoStats.rows.length, 1);
    assert.equal(classTwoStats.rows[0].student.id, "s3");
    assert.deepEqual(classTwoStats.rows[0].summary, {
        present: 0,
        absent: 0,
        late: 1,
        leave: 0,
    });
    assert.throws(
        () =>
            runtime.api.saveAttendance(app.token, {
                academicYearKey: yearKey,
                expectedSessionRevision: attendanceRevision(
                    runtime,
                    app.token,
                    yearKey,
                    "c1",
                    "2026-07-14",
                ),
                date: "2026-07-14",
                classId: "c1",
                records: [
                    { studentId: "s1", status: "late" },
                    { studentId: "s2", status: "present" },
                ],
            }),
        /กรุณาใช้ปุ่มแก้ไข/,
    );

    const beforeForceDelete = runtime.getSheetObjects(
        FIRST_YEAR.id,
        "Attendance",
    );
    const unaffectedRows = beforeForceDelete.filter(
        (row) => row.studentId !== "s2",
    );
    const forceDeleteResult = runtime.plain(
        runtime.api.forceDeleteStudents(admin.token, {
            academicYearKey: yearKey,
            studentIds: ["s2"],
            confirmText: "ลบถาวร",
        }),
    );
    assert.deepEqual(forceDeleteResult, {
        deletedStudents: 1,
        deletedAttendanceRecords: 2,
    });
    assert.deepEqual(
        runtime.getSheetObjects(FIRST_YEAR.id, "Attendance"),
        unaffectedRows,
    );
    assert.equal(
        runtime
            .getSheetObjects(FIRST_YEAR.id, "Students")
            .some((row) => row.id === "s2"),
        false,
    );
});

test("report templates reject executable HTML and persist valid config", () => {
    const { runtime } = initializeSystem();
    const { app, admin } = loginBoth(runtime);
    const yearKey = runtime.plain(
        runtime.api.getAdminBootstrap(admin.token),
    ).academicYearKey;
    const config = {
        orientation: "portrait",
        pageMarginMm: 12,
        fontFamily: "Sarabun, sans-serif",
        fontSizePt: 11,
        title: "รายงานทดสอบ",
        subtitle: "",
        showLogo: true,
        showStatusDetails: true,
        showDutyNotes: true,
        showSignatures: true,
        showDraftWatermark: false,
        sections: {
            headerHtml: "<p>{{school.name}}</p>",
            contentHtml: "<p>เนื้อหา</p>",
            footerHtml: "<p>ท้ายรายงาน</p>",
        },
        tables: [],
    };
    const template = {
        id: "",
        name: "แบบทดสอบ",
        reportType: "daily",
        isDefault: true,
        enabled: true,
        config,
        updatedAt: "",
    };

    assert.throws(
        () =>
            runtime.api.saveReportTemplates(
                admin.token,
                [
                    {
                        ...template,
                        config: {
                            ...config,
                            sections: {
                                ...config.sections,
                                contentHtml:
                                    '<img src="x" onerror="alert(1)">',
                            },
                        },
                    },
                ],
                yearKey,
            ),
        /HTML ที่ไม่อนุญาต|แท็ก HTML ที่ไม่อนุญาต/,
    );

    const saved = runtime.plain(
        runtime.api.saveReportTemplates(
            admin.token,
            [template],
            yearKey,
        ),
    );
    assert.equal(saved.length, 1);
    assert.match(saved[0].id, /^rpt_[a-f0-9]+$/);
    assert.deepEqual(
        runtime.plain(runtime.api.getReportTemplates(app.token, yearKey)),
        saved,
    );
});

test("changing one role password invalidates only that role's tokens", () => {
    const { runtime } = initializeSystem();
    const { app, admin } = loginBoth(runtime);
    const initialRevision = runtime.plain(
        runtime.api.getIndexBootstrap(app.token),
    ).academicYearKey;

    runtime.api.saveSystemSettings(admin.token, {
        schoolName: "โรงเรียนทดสอบ",
        appPassword: "teacher-new",
    });
    assert.throws(
        () => runtime.api.getIndexBootstrap(app.token),
        /กรุณาเข้าสู่ระบบใหม่/,
    );
    assert.equal(
        runtime.plain(runtime.api.getAdminBootstrap(admin.token))
            .academicYearKey,
        initialRevision,
    );
    assert.throws(
        () => runtime.api.loginApp("teacher-secret"),
        /รหัสผ่านไม่ถูกต้อง/,
    );
    const newApp = runtime.plain(runtime.api.loginApp("teacher-new"));

    runtime.api.saveSystemSettings(admin.token, {
        schoolName: "โรงเรียนทดสอบ",
        adminPassword: "admin-new",
    });
    assert.throws(
        () => runtime.api.getAdminBootstrap(admin.token),
        /กรุณาเข้าสู่ระบบใหม่/,
    );
    assert.equal(
        runtime.plain(runtime.api.getIndexBootstrap(newApp.token))
            .academicYearKey,
        initialRevision,
    );
    assert.throws(
        () => runtime.api.loginAdmin("admin-secret"),
        /รหัสผ่านไม่ถูกต้อง/,
    );
    assert.equal(
        runtime.plain(runtime.api.loginAdmin("admin-new")).role,
        "admin",
    );
});
