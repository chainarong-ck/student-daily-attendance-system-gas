import { googleScriptRun } from "../../shared/gas-client";
import type {
    AttendanceClassSession,
    AttendanceOverview,
    AttendanceStatus,
    AttendanceStats,
    AttendanceStatsFilters,
    ClassRoom,
    GenderAttendanceSummary,
    GenderCounts,
    IndexBootstrap,
    ReportTemplate,
    StudentGender,
} from "../../shared/types";
import {
    APP_TOKEN_KEY,
    bindShellActions,
    escapeHtml,
    messageText,
    noticeHtml,
    setBusy,
    shellHtml,
    showLoginRequired,
    showNotice,
    todayText,
} from "./client-utils";
import {
    buildReportCsv,
    buildReportHtmlDocument,
    downloadReportText,
    reportFileBaseName,
    type ReportExportContext,
    writeReportToPrintWindow,
} from "./report-export";

const statusLabels: Record<AttendanceStatus, string> = {
    present: "มา",
    absent: "ขาด",
    late: "สาย",
    leave: "ลา",
};

const genderLabels: Record<StudentGender, string> = {
    male: "ชาย",
    female: "หญิง",
    unknown: "ไม่ระบุ",
};

let token = "";
let bootstrap: IndexBootstrap;
let currentSession: AttendanceClassSession | null = null;
let currentOverview: AttendanceOverview | null = null;
let currentStats: AttendanceStats | null = null;
let overviewDisplayMode: "count" | "percent" = "count";

const panelClass =
    "rounded-lg border border-white/70 bg-white/95 p-5 shadow-xl shadow-slate-200/60";
const fieldClass =
    "rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100";
const primaryButtonClass =
    "rounded-md bg-orange-600 px-4 py-2 font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
    "rounded-md border border-teal-200 bg-white px-4 py-2 font-semibold text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60";
const tableHeadClass =
    "bg-gradient-to-r from-teal-50 to-orange-50 text-slate-700";

async function main(): Promise<void> {
    token = localStorage.getItem(APP_TOKEN_KEY) ?? "";
    if (!token) {
        showLoginRequired(
            "app",
            "กรุณา Login ด้วยรหัสครูก่อนเข้าใช้งานหน้าเช็คชื่อ",
        );
        return;
    }
    try {
        bootstrap = await googleScriptRun("getIndexBootstrap", token);
    } catch (error) {
        localStorage.removeItem(APP_TOKEN_KEY);
        showLoginRequired("app", messageText(error));
        return;
    }
    render();
    await loadOverview();
}

function render(): void {
    document.body.innerHTML = shellHtml(
        bootstrap.system.schoolName || "ระบบเช็คชื่อนักเรียน",
        `
        ${noticeHtml("indexNotice")}
        <div class="mb-4 flex flex-wrap gap-2 rounded-lg border border-white/70 bg-white/70 p-2 shadow-sm">
            ${tabButton("overview", "ภาพรวม", true)}
            ${tabButton("attendance", "เช็คชื่อรายห้อง", false)}
            ${tabButton("stats", "สถิติละเอียด", false)}
        </div>
        <section id="overviewPanel" class="${panelClass}">
            <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    ${sectionTitle("ภาพรวมรายวัน")}
                </div>
                <div class="flex flex-wrap gap-2">
                    <div class="flex rounded-md border border-slate-200 bg-slate-50 p-1" aria-label="รูปแบบตัวเลขภาพรวม">
                        <button type="button" data-overview-mode="count" class="${overviewModeButtonClass("count")}">จำนวน</button>
                        <button type="button" data-overview-mode="percent" class="${overviewModeButtonClass("percent")}">เปอร์เซ็นต์</button>
                    </div>
                    <input id="overviewDate" type="date" value="${todayText()}" class="${fieldClass}" />
                    <button id="loadOverviewButton" class="${primaryButtonClass}">โหลด</button>
                    <button id="exportDailyButton" class="${secondaryButtonClass}">ส่งออกข้อมูล</button>
                </div>
            </div>
            <div id="overviewContent" class="text-sm text-slate-600">กำลังโหลด...</div>
        </section>
        <section id="attendancePanel" class="hidden ${panelClass}">
            ${sectionTitle("เช็คชื่อรายห้อง")}
            <div class="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <select id="classSelect" class="${fieldClass}">${classOptions(bootstrap.classes)}</select>
                <input id="attendanceDate" type="date" value="${todayText()}" class="${fieldClass}" />
                <button id="loadSessionButton" class="${primaryButtonClass}">โหลดรายชื่อ</button>
            </div>
            <div id="attendanceContent" class="text-sm text-slate-600">เลือกห้องและวันที่เพื่อเริ่มเช็คชื่อ</div>
        </section>
        <section id="statsPanel" class="hidden ${panelClass}">
            ${sectionTitle("สถิติละเอียด")}
            <div class="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
                <input id="statsFrom" type="date" class="${fieldClass}" />
                <input id="statsTo" type="date" value="${todayText()}" class="${fieldClass}" />
                <select id="statsClass" class="${fieldClass}"><option value="">ทุกห้อง</option>${classOptions(bootstrap.classes, false)}</select>
                <select id="statsGender" class="${fieldClass}">${genderOptions()}</select>
                <button id="loadStatsButton" class="${primaryButtonClass}">ดูสถิติ</button>
                <button id="exportDetailedButton" class="${secondaryButtonClass}">ส่งออกข้อมูล</button>
            </div>
            <div id="statsContent" class="text-sm text-slate-600">เลือกช่วงวันที่แล้วกดดูสถิติ</div>
        </section>`,
        {
            activePage: "Index",
            logoutRole: "app",
            showLoginLink: false,
        },
    );
    bindShellActions();

    document
        .querySelectorAll<HTMLButtonElement>("[data-tab]")
        .forEach((button) => {
            button.addEventListener("click", () =>
                activateTab(button.dataset.tab ?? "overview"),
            );
        });
    document
        .getElementById("loadOverviewButton")
        ?.addEventListener("click", () => {
            void loadOverview();
        });
    document
        .querySelectorAll<HTMLButtonElement>("[data-overview-mode]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                overviewDisplayMode =
                    button.dataset.overviewMode === "percent"
                        ? "percent"
                        : "count";
                applyOverviewDisplayMode();
            });
        });
    document
        .getElementById("loadSessionButton")
        ?.addEventListener("click", () => {
            void loadSession();
        });
    document
        .getElementById("loadStatsButton")
        ?.addEventListener("click", () => {
            void loadStats();
        });
    document
        .getElementById("exportDailyButton")
        ?.addEventListener("click", () => openExportDialog("daily"));
    document
        .getElementById("exportDetailedButton")
        ?.addEventListener("click", () => openExportDialog("detailed"));
}

function tabButton(id: string, label: string, active: boolean): string {
    return `<button data-tab="${id}" class="${tabButtonClass(active)}">${label}</button>`;
}

function tabButtonClass(active: boolean): string {
    return `rounded-md px-4 py-2 text-sm font-semibold transition ${active ? "bg-orange-600 text-white" : "bg-white text-slate-700 shadow-sm hover:bg-teal-50 hover:text-teal-800"}`;
}

function overviewModeButtonClass(mode: "count" | "percent"): string {
    return `rounded px-3 py-1.5 text-sm font-semibold transition ${overviewDisplayMode === mode ? "bg-orange-600 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"}`;
}

function applyOverviewDisplayMode(): void {
    document
        .querySelectorAll<HTMLElement>("[data-overview-value]")
        .forEach((element) => {
            element.textContent = element.dataset[overviewDisplayMode] ?? "0";
        });
    document
        .querySelectorAll<HTMLButtonElement>("[data-overview-mode]")
        .forEach((button) => {
            const mode =
                button.dataset.overviewMode === "percent" ? "percent" : "count";
            button.className = overviewModeButtonClass(mode);
            button.setAttribute(
                "aria-pressed",
                String(mode === overviewDisplayMode),
            );
        });
}

function sectionTitle(title: string): string {
    return `<h2 class="mb-4 text-xl font-bold text-slate-950">${escapeHtml(title)}<span class="ml-2 text-sm font-semibold text-teal-700">${escapeHtml(currentYearText())}</span></h2>`;
}

function activateTab(id: string): void {
    ["overview", "attendance", "stats"].forEach((tab) => {
        document
            .getElementById(`${tab}Panel`)
            ?.classList.toggle("hidden", tab !== id);
        const button = document.querySelector<HTMLButtonElement>(
            `[data-tab="${tab}"]`,
        );
        if (button) {
            button.className = tabButtonClass(tab === id);
        }
    });
}

function currentYearText(): string {
    const year = bootstrap.system.currentYear;
    return year
        ? `ปีการศึกษา ${year.y} เทอม ${year.t}`
        : "ยังไม่ได้ตั้งค่าปีการศึกษาปัจจุบัน";
}

function classOptions(classes: ClassRoom[], placeholder = true): string {
    return `${placeholder ? '<option value="">เลือกห้องเรียน</option>' : ""}${classes
        .map(
            (row) =>
                `<option value="${escapeHtml(row.id)}">ชั้น ${escapeHtml(row.grade)}/${escapeHtml(row.room)}</option>`,
        )
        .join("")}`;
}

function genderOptions(): string {
    return `<option value="">ทุกเพศ</option><option value="male">ชาย</option><option value="female">หญิง</option><option value="unknown">ไม่ระบุ</option>`;
}

async function loadOverview(): Promise<void> {
    const button = document.getElementById(
        "loadOverviewButton",
    ) as HTMLButtonElement | null;
    if (button) {
        setBusy(button, true, "กำลังโหลด...");
    }
    try {
        const date = (
            document.getElementById("overviewDate") as HTMLInputElement
        ).value;
        const overview = await googleScriptRun(
            "getAttendanceOverview",
            token,
            date,
        );
        currentOverview = overview;
        const content = document.getElementById("overviewContent");
        if (!content) {
            return;
        }
        content.innerHTML = `
            <div class="mb-4 grid gap-3 sm:grid-cols-3">${studentCountCards(overview.studentCounts)}</div>
            <div class="mb-4 grid gap-3 sm:grid-cols-4">${summaryCards(overview.total, overview.totalByGender, overview.studentCounts.checked)}</div>
            <div class="overflow-x-auto">
                <table class="w-full min-w-160 overflow-hidden rounded-md text-left text-sm">
                    <thead class="${tableHeadClass}"><tr><th class="p-3">ห้อง</th><th class="p-3">นักเรียนทั้งหมด</th><th class="p-3">สถานะ</th><th class="p-3">มา</th><th class="p-3">ขาด</th><th class="p-3">สาย</th><th class="p-3">ลา</th></tr></thead>
                    <tbody>${overview.classes
                        .map(
                            (row) =>
                                `<tr class="border-b border-slate-100 transition hover:bg-teal-50/60"><td class="p-3 font-medium text-slate-900">ชั้น ${escapeHtml(row.classRoom.grade)}/${escapeHtml(row.classRoom.room)}</td><td class="p-3">${countCell(row.studentCount, row.studentCount, row.studentCountByGender)}</td><td class="p-3">${row.checked ? `<span class="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">เช็คแล้ว</span>` : `<span class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">ยังไม่เช็ค</span>`}</td><td class="p-3">${statusCountCell(row.summary.present, row.summaryByGender, "present", row.studentCount, "text-emerald-700")}</td><td class="p-3">${statusCountCell(row.summary.absent, row.summaryByGender, "absent", row.studentCount, "text-rose-700")}</td><td class="p-3">${statusCountCell(row.summary.late, row.summaryByGender, "late", row.studentCount, "text-amber-700")}</td><td class="p-3">${statusCountCell(row.summary.leave, row.summaryByGender, "leave", row.studentCount, "text-sky-700")}</td></tr>`,
                        )
                        .join("")}</tbody>
                </table>
            </div>`;
        applyOverviewDisplayMode();
    } catch (error) {
        showNotice("indexNotice", messageText(error), "error");
    } finally {
        if (button) {
            setBusy(button, false);
        }
    }
}

function studentCountCards(counts: {
    total: number;
    checked: number;
    unchecked: number;
    byGender: GenderCounts;
    checkedByGender: GenderCounts;
    uncheckedByGender: GenderCounts;
}): string {
    return [
        [
            "นักเรียนทั้งหมด",
            counts.total,
            counts.byGender,
            "from-sky-50 to-white border-sky-200 text-sky-700",
        ],
        [
            "เช็คแล้ว",
            counts.checked,
            counts.checkedByGender,
            "from-emerald-50 to-white border-emerald-200 text-emerald-700",
        ],
        [
            "ยังไม่ได้เช็ค",
            counts.unchecked,
            counts.uncheckedByGender,
            "from-amber-50 to-white border-amber-200 text-amber-700",
        ],
    ]
        .map(
            ([label, value, byGender, classes]) =>
                `<div class="rounded-lg border bg-linear-to-br ${classes} p-4 shadow-sm"><p class="text-sm font-semibold text-slate-600">${label}</p><p class="mt-1 text-3xl font-bold">${overviewValue(value as number, counts.total)}</p><p class="mt-1 text-xs font-semibold opacity-80">${genderBreakdownValue(byGender as GenderCounts, value as number)}</p></div>`,
        )
        .join("");
}

function summaryCards(
    summary: Record<AttendanceStatus, number>,
    summaryByGender: GenderAttendanceSummary,
    baseTotal: number,
): string {
    const statusClasses: Record<AttendanceStatus, string> = {
        present: "border-emerald-200 bg-emerald-50 text-emerald-700",
        absent: "border-rose-200 bg-rose-50 text-rose-700",
        late: "border-amber-200 bg-amber-50 text-amber-700",
        leave: "border-sky-200 bg-sky-50 text-sky-700",
    };
    return (Object.keys(statusLabels) as AttendanceStatus[])
        .map(
            (status) =>
                `<div class="rounded-lg border p-4 shadow-sm ${statusClasses[status]}"><p class="text-sm font-semibold">${statusLabels[status]}</p><p class="mt-1 text-3xl font-bold">${overviewValue(summary[status], baseTotal)}</p><p class="mt-1 text-xs font-semibold opacity-80">${statusGenderBreakdownValue(summaryByGender, status, summary[status])}</p></div>`,
        )
        .join("");
}

function countCell(
    value: number,
    total: number,
    byGender: GenderCounts,
    colorClass = "text-slate-900",
): string {
    return `<span class="font-semibold ${colorClass}">${overviewValue(value, total)}</span><div class="mt-1 text-xs text-slate-500">${genderBreakdownValue(byGender, value)}</div>`;
}

function statusCountCell(
    value: number,
    summaryByGender: GenderAttendanceSummary,
    status: AttendanceStatus,
    total: number,
    colorClass: string,
): string {
    return countCell(
        value,
        total,
        statusGenderCounts(summaryByGender, status),
        colorClass,
    );
}

function overviewValue(value: number, total: number): string {
    return `<span data-overview-value data-count="${value}" data-percent="${formatPercent(value, total)}">${value}</span>`;
}

function genderBreakdownValue(counts: GenderCounts, total: number): string {
    const parts = [
        `${genderLabels.male} ${overviewValue(counts.male, total)}`,
        `${genderLabels.female} ${overviewValue(counts.female, total)}`,
    ];
    if (counts.unknown > 0) {
        parts.push(
            `${genderLabels.unknown} ${overviewValue(counts.unknown, total)}`,
        );
    }
    return parts.join(" | ");
}

function statusGenderCounts(
    summaryByGender: GenderAttendanceSummary,
    status: AttendanceStatus,
): GenderCounts {
    return {
        male: summaryByGender.male[status],
        female: summaryByGender.female[status],
        unknown: summaryByGender.unknown[status],
    };
}

function statusGenderBreakdownValue(
    summaryByGender: GenderAttendanceSummary,
    status: AttendanceStatus,
    total: number,
): string {
    return genderBreakdownValue(
        statusGenderCounts(summaryByGender, status),
        total,
    );
}

function formatPercent(value: number, total: number): string {
    if (total <= 0) {
        return "0%";
    }
    return `${((value / total) * 100).toFixed(1)}%`;
}

async function loadSession(): Promise<void> {
    const classId = (
        document.getElementById("classSelect") as HTMLSelectElement
    ).value;
    const date = (document.getElementById("attendanceDate") as HTMLInputElement)
        .value;
    if (!classId) {
        showNotice("indexNotice", "กรุณาเลือกห้องเรียน", "error");
        return;
    }
    const button = document.getElementById(
        "loadSessionButton",
    ) as HTMLButtonElement;
    setBusy(button, true, "กำลังโหลด...");
    try {
        currentSession = await googleScriptRun(
            "getAttendanceClassSession",
            token,
            classId,
            date,
        );
        renderSession();
    } catch (error) {
        showNotice("indexNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

function renderSession(): void {
    const content = document.getElementById("attendanceContent");
    if (!content || !currentSession) {
        return;
    }
    if (currentSession.rows.length === 0) {
        content.innerHTML = `
            <div class="rounded-md border border-amber-200 bg-amber-50 px-4 py-4 text-amber-800">
                <p class="font-semibold">ห้องเรียนนี้ยังไม่มีนักเรียนที่กำลังศึกษาอยู่</p>
                <p class="mt-1 text-sm">กรุณาเพิ่มนักเรียนหรือเปลี่ยนสถานะนักเรียนเป็นกำลังศึกษาผ่านหน้า Admin ก่อนเช็คชื่อ</p>
            </div>`;
        return;
    }
    content.innerHTML = `
        <div class="mb-3 rounded-md border ${currentSession.checked ? "border-amber-200 bg-amber-50 text-amber-800" : "border-teal-200 bg-teal-50 text-teal-800"} px-4 py-3 font-medium">
            ${currentSession.checked ? "ห้องนี้เช็คชื่อวันนี้แล้ว หากต้องการเปลี่ยนให้กดบันทึกการแก้ไข" : "ยังไม่เคยเช็คชื่อ สามารถบันทึกได้ทันที"}
        </div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-180 overflow-hidden rounded-md text-left text-sm">
                <thead class="${tableHeadClass}"><tr><th class="p-3">เลขที่</th><th class="p-3">รหัส</th><th class="p-3">ชื่อ-สกุล</th><th class="p-3">สถานะ</th></tr></thead>
                <tbody>${currentSession.rows
                    .map(
                        (row) =>
                            `<tr class="border-b border-slate-100 transition hover:bg-teal-50/60"><td class="p-3">${escapeHtml(row.student.number)}</td><td class="p-3">${escapeHtml(row.student.studentCode)}</td><td class="p-3 font-medium text-slate-900">${escapeHtml(row.student.fullName)}</td><td class="p-3"><select data-student-id="${escapeHtml(row.student.id)}" class="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100">${statusSelect(row.record?.status ?? "present")}</select></td></tr>`,
                    )
                    .join("")}</tbody>
            </table>
        </div>
        <button id="saveAttendanceButton" class="mt-4 ${primaryButtonClass}">${currentSession.checked ? "บันทึกการแก้ไข" : "บันทึกการเช็คชื่อ"}</button>`;
    document
        .getElementById("saveAttendanceButton")
        ?.addEventListener("click", () => {
            void persistSession();
        });
}

function statusSelect(selected: AttendanceStatus): string {
    return (Object.keys(statusLabels) as AttendanceStatus[])
        .map(
            (status) =>
                `<option value="${status}" ${status === selected ? "selected" : ""}>${statusLabels[status]}</option>`,
        )
        .join("");
}

async function persistSession(): Promise<void> {
    if (!currentSession) {
        return;
    }
    const button = document.getElementById(
        "saveAttendanceButton",
    ) as HTMLButtonElement;
    setBusy(button, true, "กำลังบันทึก...");
    try {
        const records = Array.from(
            document.querySelectorAll<HTMLSelectElement>("[data-student-id]"),
        ).map((select) => ({
            studentId: select.dataset.studentId ?? "",
            status: select.value as AttendanceStatus,
        }));
        const payload = {
            date: currentSession.date,
            classId: currentSession.classRoom.id,
            records,
        };
        await googleScriptRun(
            currentSession.checked ? "updateAttendance" : "saveAttendance",
            token,
            payload,
        );
        showNotice("indexNotice", "บันทึกข้อมูลเรียบร้อย", "ok");
        await Promise.all([loadSession(), loadOverview()]);
    } catch (error) {
        showNotice("indexNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

async function loadStats(): Promise<void> {
    const button = document.getElementById(
        "loadStatsButton",
    ) as HTMLButtonElement;
    setBusy(button, true, "กำลังโหลด...");
    try {
        const stats = await googleScriptRun(
            "getAttendanceStats",
            token,
            statsFiltersFromForm(),
        );
        currentStats = stats;
        renderStats(stats);
    } catch (error) {
        showNotice("indexNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

function statsFiltersFromForm(): AttendanceStatsFilters {
    return {
        dateFrom: (document.getElementById("statsFrom") as HTMLInputElement)
            .value,
        dateTo: (document.getElementById("statsTo") as HTMLInputElement).value,
        classId: (document.getElementById("statsClass") as HTMLSelectElement)
            .value,
        gender: (
            document.getElementById("statsGender") as HTMLSelectElement
        ).value as StudentGender | "",
    };
}

function renderStats(stats: AttendanceStats): void {
    const content = document.getElementById("statsContent");
    if (!content) {
        return;
    }
    content.innerHTML = `<div class="overflow-x-auto"><table class="w-full min-w-220 overflow-hidden rounded-md text-left text-sm">
        <thead class="${tableHeadClass}"><tr><th class="p-3">ห้อง</th><th class="p-3">เลขที่</th><th class="p-3">ชื่อ-สกุล</th><th class="p-3">เพศ</th><th class="p-3">มา</th><th class="p-3">ขาด</th><th class="p-3">สาย</th><th class="p-3">ลา</th><th class="p-3">รวม</th></tr></thead>
        <tbody>${stats.rows
            .map(
                (row) =>
                    `<tr class="border-b border-slate-100 transition hover:bg-teal-50/60"><td class="p-3">${row.classRoom ? `ชั้น ${escapeHtml(row.classRoom.grade)}/${escapeHtml(row.classRoom.room)}` : "-"}</td><td class="p-3">${escapeHtml(row.student.number)}</td><td class="p-3 font-medium text-slate-900">${escapeHtml(row.student.fullName)}</td><td class="p-3">${escapeHtml(genderLabels[row.student.gender])}</td><td class="p-3">${statsCell(row.summary.present, row.total, "text-emerald-700")}</td><td class="p-3">${statsCell(row.summary.absent, row.total, "text-rose-700")}</td><td class="p-3">${statsCell(row.summary.late, row.total, "text-amber-700")}</td><td class="p-3">${statsCell(row.summary.leave, row.total, "text-sky-700")}</td><td class="p-3 font-semibold text-slate-900">${row.total}</td></tr>`,
            )
            .join("")}</tbody>
    </table></div>`;
}

function statsCell(
    value: number,
    total: number,
    colorClass = "text-slate-900",
): string {
    return `<span class="font-semibold ${colorClass}">${value}</span><span class="ml-2 text-slate-500">${formatPercent(value, total)}</span>`;
}

function openExportDialog(reportType: ReportTemplate["reportType"]): void {
    const templates = bootstrap.reportTemplates.filter(
        (template) => template.reportType === reportType,
    );
    if (templates.length === 0) {
        showNotice(
            "indexNotice",
            reportType === "daily"
                ? "ยังไม่มีแบบฟอร์มรายวันที่เปิดใช้งาน กรุณาให้ Admin สร้างหรือเปิดใช้งานแบบฟอร์มก่อน"
                : "ยังไม่มีแบบฟอร์มสถิติละเอียดที่เปิดใช้งาน กรุณาให้ Admin สร้างหรือเปิดใช้งานแบบฟอร์มก่อน",
            "error",
        );
        return;
    }
    document.getElementById("teacherExportDialog")?.remove();
    const defaultTemplate =
        templates.find((template) => template.isDefault) ?? templates[0];
    document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="teacherExportDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="teacherExportDialogTitle">
            <div class="w-full max-w-lg rounded-xl border border-white/70 bg-white p-5 shadow-2xl">
                <div class="mb-4 flex items-start justify-between gap-4">
                    <div><h2 id="teacherExportDialogTitle" class="text-xl font-bold text-slate-950">ส่งออก${reportType === "daily" ? "ภาพรวมรายวัน" : "สถิติละเอียด"}</h2><p class="mt-1 text-sm text-slate-600">เลือกแบบฟอร์มที่ Admin เตรียมไว้และรูปแบบไฟล์</p></div>
                    <button type="button" data-close-export-dialog class="rounded-md px-2 py-1 text-xl text-slate-500 hover:bg-slate-100" aria-label="ปิด">×</button>
                </div>
                <div class="space-y-4">
                    <label class="block text-sm font-semibold text-slate-700">แบบฟอร์ม
                        <select id="teacherExportTemplate" class="mt-1 w-full ${fieldClass}">${templates
                            .map(
                                (template) =>
                                    `<option value="${escapeHtml(template.id)}" ${template.id === defaultTemplate.id ? "selected" : ""}>${escapeHtml(template.name)}${template.isDefault ? " · ค่าเริ่มต้น" : ""}</option>`,
                            )
                            .join("")}</select>
                    </label>
                    <label class="block text-sm font-semibold text-slate-700">รูปแบบ
                        <select id="teacherExportFormat" class="mt-1 w-full ${fieldClass}">
                            <option value="print">พิมพ์ / บันทึกเป็น PDF</option>
                            <option value="html">HTML · รักษารูปแบบเอกสาร</option>
                            <option value="csv">CSV · ข้อมูลตารางสำหรับ Excel</option>
                        </select>
                    </label>
                    <div class="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">การเลือก PDF จะเปิดหน้าต่างพิมพ์ของเบราว์เซอร์ จากนั้นเลือกเครื่องพิมพ์ “บันทึกเป็น PDF” ได้ทันที</div>
                </div>
                <div class="mt-5 flex justify-end gap-2">
                    <button type="button" data-close-export-dialog class="${secondaryButtonClass}">ยกเลิก</button>
                    <button id="confirmTeacherExportButton" type="button" class="${primaryButtonClass}">ส่งออก</button>
                </div>
            </div>
        </div>`,
    );
    document
        .querySelectorAll<HTMLElement>("[data-close-export-dialog]")
        .forEach((element) =>
            element.addEventListener("click", closeExportDialog),
        );
    document
        .getElementById("confirmTeacherExportButton")
        ?.addEventListener("click", () => void exportTeacherReport(reportType));
}

function closeExportDialog(): void {
    document.getElementById("teacherExportDialog")?.remove();
}

async function exportTeacherReport(
    reportType: ReportTemplate["reportType"],
): Promise<void> {
    const templateId = (
        document.getElementById("teacherExportTemplate") as HTMLSelectElement
    ).value;
    const format = (
        document.getElementById("teacherExportFormat") as HTMLSelectElement
    ).value as "print" | "html" | "csv";
    const template = bootstrap.reportTemplates.find(
        (row) => row.id === templateId && row.reportType === reportType,
    );
    if (!template) {
        showNotice("indexNotice", "ไม่พบแบบฟอร์มที่เลือก", "error");
        return;
    }
    const printWindow = format === "print" ? window.open("", "_blank") : null;
    if (format === "print" && !printWindow) {
        showNotice(
            "indexNotice",
            "เบราว์เซอร์ปิดกั้นหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up แล้วลองอีกครั้ง",
            "error",
        );
        return;
    }
    const button = document.getElementById(
        "confirmTeacherExportButton",
    ) as HTMLButtonElement;
    setBusy(button, true, "กำลังเตรียม...");
    try {
        const context = await reportExportContext(reportType);
        const fileBaseName = reportFileBaseName(template, context);
        if (format === "csv") {
            downloadReportText(
                buildReportCsv(template, context),
                `${fileBaseName}.csv`,
                "text/csv;charset=utf-8",
            );
        } else {
            const year = bootstrap.system.currentYear;
            const html = buildReportHtmlDocument(template, context, {
                schoolName:
                    bootstrap.system.schoolName || "ยังไม่ได้ตั้งชื่อโรงเรียน",
                academicYear: year?.y ?? "-",
                academicTerm: year?.t ?? "-",
            });
            if (format === "html") {
                downloadReportText(
                    html,
                    `${fileBaseName}.html`,
                    "text/html;charset=utf-8",
                );
            } else if (printWindow) {
                writeReportToPrintWindow(printWindow, html);
            }
        }
        closeExportDialog();
        showNotice("indexNotice", "เตรียมรายงานสำหรับส่งออกเรียบร้อย", "ok");
    } catch (error) {
        printWindow?.close();
        showNotice("indexNotice", messageText(error), "error");
    } finally {
        if (button.isConnected) {
            setBusy(button, false);
        }
    }
}

async function reportExportContext(
    reportType: ReportTemplate["reportType"],
): Promise<ReportExportContext> {
    if (reportType === "daily") {
        const date = (
            document.getElementById("overviewDate") as HTMLInputElement
        ).value;
        if (!date) {
            throw new Error("กรุณาเลือกวันที่สำหรับรายงาน");
        }
        if (!currentOverview || currentOverview.date !== date) {
            currentOverview = await googleScriptRun(
                "getAttendanceOverview",
                token,
                date,
            );
        }
        return { reportType: "daily", date, overview: currentOverview };
    }
    const filters = statsFiltersFromForm();
    if (!currentStats || !sameStatsFilters(currentStats.filters, filters)) {
        currentStats = await googleScriptRun(
            "getAttendanceStats",
            token,
            filters,
        );
    }
    return { reportType: "detailed", filters, stats: currentStats };
}

function sameStatsFilters(
    left: AttendanceStatsFilters,
    right: AttendanceStatsFilters,
): boolean {
    return (
        (left.dateFrom ?? "") === (right.dateFrom ?? "") &&
        (left.dateTo ?? "") === (right.dateTo ?? "") &&
        (left.classId ?? "") === (right.classId ?? "") &&
        (left.gender ?? "") === (right.gender ?? "")
    );
}

void main().catch((error) => {
    document.body.textContent = messageText(error);
});
