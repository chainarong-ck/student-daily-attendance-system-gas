import { googleScriptRun } from "../../shared/gas-client";
import type {
    AttendanceClassSession,
    AttendanceStatus,
    AttendanceStats,
    ClassRoom,
    IndexBootstrap,
} from "../../shared/types";
import {
    APP_TOKEN_KEY,
    escapeHtml,
    messageText,
    navigateTo,
    noticeHtml,
    setBusy,
    shellHtml,
    showNotice,
    todayText,
} from "./client-utils";

const statusLabels: Record<AttendanceStatus, string> = {
    present: "มา",
    absent: "ขาด",
    late: "สาย",
    leave: "ลา",
};

let token = "";
let bootstrap: IndexBootstrap;
let currentSession: AttendanceClassSession | null = null;

async function main(): Promise<void> {
    token = localStorage.getItem(APP_TOKEN_KEY) ?? "";
    if (!token) {
        navigateTo("Login");
        return;
    }
    try {
        bootstrap = await googleScriptRun("getIndexBootstrap", token);
    } catch {
        localStorage.removeItem(APP_TOKEN_KEY);
        navigateTo("Login");
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
        <div class="mb-4 flex flex-wrap gap-2">
            ${tabButton("overview", "ภาพรวม", true)}
            ${tabButton("attendance", "เช็คชื่อรายห้อง", false)}
            ${tabButton("stats", "สถิติละเอียด", false)}
        </div>
        <section id="overviewPanel" class="rounded-lg bg-white p-5 shadow-sm">
            <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 class="text-xl font-semibold">ภาพรวมรายวัน</h2>
                    <p class="text-sm text-slate-600">${currentYearText()}</p>
                </div>
                <div class="flex gap-2">
                    <input id="overviewDate" type="date" value="${todayText()}" class="rounded-md border border-slate-300 px-3 py-2" />
                    <button id="loadOverviewButton" class="rounded-md bg-orange-600 px-4 py-2 font-semibold text-white">โหลด</button>
                </div>
            </div>
            <div id="overviewContent" class="text-sm text-slate-600">กำลังโหลด...</div>
        </section>
        <section id="attendancePanel" class="hidden rounded-lg bg-white p-5 shadow-sm">
            <div class="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <select id="classSelect" class="rounded-md border border-slate-300 px-3 py-2">${classOptions(bootstrap.classes)}</select>
                <input id="attendanceDate" type="date" value="${todayText()}" class="rounded-md border border-slate-300 px-3 py-2" />
                <button id="loadSessionButton" class="rounded-md bg-orange-600 px-4 py-2 font-semibold text-white">โหลดรายชื่อ</button>
            </div>
            <div id="attendanceContent" class="text-sm text-slate-600">เลือกห้องและวันที่เพื่อเริ่มเช็คชื่อ</div>
        </section>
        <section id="statsPanel" class="hidden rounded-lg bg-white p-5 shadow-sm">
            <div class="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input id="statsFrom" type="date" class="rounded-md border border-slate-300 px-3 py-2" />
                <input id="statsTo" type="date" value="${todayText()}" class="rounded-md border border-slate-300 px-3 py-2" />
                <select id="statsClass" class="rounded-md border border-slate-300 px-3 py-2"><option value="">ทุกห้อง</option>${classOptions(bootstrap.classes, false)}</select>
                <button id="loadStatsButton" class="rounded-md bg-orange-600 px-4 py-2 font-semibold text-white">ดูสถิติ</button>
            </div>
            <div id="statsContent" class="text-sm text-slate-600">เลือกช่วงวันที่แล้วกดดูสถิติ</div>
        </section>`,
    );

    document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
        button.addEventListener("click", () => activateTab(button.dataset.tab ?? "overview"));
    });
    document.getElementById("loadOverviewButton")?.addEventListener("click", () => {
        void loadOverview();
    });
    document.getElementById("loadSessionButton")?.addEventListener("click", () => {
        void loadSession();
    });
    document.getElementById("loadStatsButton")?.addEventListener("click", () => {
        void loadStats();
    });
}

function tabButton(id: string, label: string, active: boolean): string {
    return `<button data-tab="${id}" class="rounded-md px-4 py-2 text-sm font-semibold ${active ? "bg-orange-600 text-white" : "bg-white text-slate-700"}">${label}</button>`;
}

function activateTab(id: string): void {
    ["overview", "attendance", "stats"].forEach((tab) => {
        document.getElementById(`${tab}Panel`)?.classList.toggle("hidden", tab !== id);
        const button = document.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`);
        button?.classList.toggle("bg-orange-600", tab === id);
        button?.classList.toggle("text-white", tab === id);
        button?.classList.toggle("bg-white", tab !== id);
        button?.classList.toggle("text-slate-700", tab !== id);
    });
}

function currentYearText(): string {
    const year = bootstrap.system.currentYear;
    return year ? `ปีการศึกษา ${year.y} เทอม ${year.t}` : "ยังไม่ได้ตั้งค่าปีการศึกษาปัจจุบัน";
}

function classOptions(classes: ClassRoom[], placeholder = true): string {
    return `${placeholder ? '<option value="">เลือกห้องเรียน</option>' : ""}${classes
        .map(
            (row) =>
                `<option value="${escapeHtml(row.id)}">ม.${escapeHtml(row.grade)}/${escapeHtml(row.room)}</option>`,
        )
        .join("")}`;
}

async function loadOverview(): Promise<void> {
    const button = document.getElementById("loadOverviewButton") as HTMLButtonElement | null;
    if (button) {
        setBusy(button, true, "กำลังโหลด...");
    }
    try {
        const date = (document.getElementById("overviewDate") as HTMLInputElement).value;
        const overview = await googleScriptRun("getAttendanceOverview", token, date);
        const content = document.getElementById("overviewContent");
        if (!content) {
            return;
        }
        content.innerHTML = `
            <div class="mb-4 grid gap-3 sm:grid-cols-4">${summaryCards(overview.total)}</div>
            <div class="overflow-x-auto">
                <table class="w-full min-w-[640px] text-left text-sm">
                    <thead class="bg-slate-100"><tr><th class="p-2">ห้อง</th><th class="p-2">สถานะ</th><th class="p-2">มา</th><th class="p-2">ขาด</th><th class="p-2">สาย</th><th class="p-2">ลา</th></tr></thead>
                    <tbody>${overview.classes
                        .map(
                            (row) =>
                                `<tr class="border-b border-slate-100"><td class="p-2">ม.${escapeHtml(row.classRoom.grade)}/${escapeHtml(row.classRoom.room)}</td><td class="p-2">${row.checked ? "เช็คแล้ว" : "ยังไม่เช็ค"}</td><td class="p-2">${row.summary.present}</td><td class="p-2">${row.summary.absent}</td><td class="p-2">${row.summary.late}</td><td class="p-2">${row.summary.leave}</td></tr>`,
                        )
                        .join("")}</tbody>
                </table>
            </div>`;
    } catch (error) {
        showNotice("indexNotice", messageText(error), "error");
    } finally {
        if (button) {
            setBusy(button, false);
        }
    }
}

function summaryCards(summary: Record<AttendanceStatus, number>): string {
    return (Object.keys(statusLabels) as AttendanceStatus[])
        .map(
            (status) =>
                `<div class="rounded-lg border border-slate-200 p-4"><p class="text-sm text-slate-500">${statusLabels[status]}</p><p class="text-3xl font-bold text-orange-700">${summary[status]}</p></div>`,
        )
        .join("");
}

async function loadSession(): Promise<void> {
    const classId = (document.getElementById("classSelect") as HTMLSelectElement).value;
    const date = (document.getElementById("attendanceDate") as HTMLInputElement).value;
    if (!classId) {
        showNotice("indexNotice", "กรุณาเลือกห้องเรียน", "error");
        return;
    }
    const button = document.getElementById("loadSessionButton") as HTMLButtonElement;
    setBusy(button, true, "กำลังโหลด...");
    try {
        currentSession = await googleScriptRun("getAttendanceClassSession", token, classId, date);
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
    content.innerHTML = `
        <div class="mb-3 rounded-md ${currentSession.checked ? "bg-orange-50 text-orange-800" : "bg-slate-50 text-slate-700"} px-4 py-3">
            ${currentSession.checked ? "ห้องนี้เช็คชื่อวันนี้แล้ว หากต้องการเปลี่ยนให้กดบันทึกการแก้ไข" : "ยังไม่เคยเช็คชื่อ สามารถบันทึกได้ทันที"}
        </div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-[720px] text-left text-sm">
                <thead class="bg-slate-100"><tr><th class="p-2">เลขที่</th><th class="p-2">รหัส</th><th class="p-2">ชื่อ-สกุล</th><th class="p-2">สถานะ</th></tr></thead>
                <tbody>${currentSession.rows
                    .map(
                        (row) =>
                            `<tr class="border-b border-slate-100"><td class="p-2">${escapeHtml(row.student.number)}</td><td class="p-2">${escapeHtml(row.student.studentCode)}</td><td class="p-2">${escapeHtml(row.student.fullName)}</td><td class="p-2"><select data-student-id="${escapeHtml(row.student.id)}" class="rounded-md border border-slate-300 px-2 py-1">${statusSelect(row.record?.status ?? "present")}</select></td></tr>`,
                    )
                    .join("")}</tbody>
            </table>
        </div>
        <button id="saveAttendanceButton" class="mt-4 rounded-md bg-orange-600 px-4 py-2 font-semibold text-white">${currentSession.checked ? "บันทึกการแก้ไข" : "บันทึกการเช็คชื่อ"}</button>`;
    document.getElementById("saveAttendanceButton")?.addEventListener("click", () => {
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
    const button = document.getElementById("saveAttendanceButton") as HTMLButtonElement;
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
        await loadSession();
        await loadOverview();
    } catch (error) {
        showNotice("indexNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

async function loadStats(): Promise<void> {
    const button = document.getElementById("loadStatsButton") as HTMLButtonElement;
    setBusy(button, true, "กำลังโหลด...");
    try {
        const stats = await googleScriptRun("getAttendanceStats", token, {
            dateFrom: (document.getElementById("statsFrom") as HTMLInputElement).value,
            dateTo: (document.getElementById("statsTo") as HTMLInputElement).value,
            classId: (document.getElementById("statsClass") as HTMLSelectElement).value,
        });
        renderStats(stats);
    } catch (error) {
        showNotice("indexNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

function renderStats(stats: AttendanceStats): void {
    const content = document.getElementById("statsContent");
    if (!content) {
        return;
    }
    content.innerHTML = `<div class="overflow-x-auto"><table class="w-full min-w-[760px] text-left text-sm">
        <thead class="bg-slate-100"><tr><th class="p-2">ห้อง</th><th class="p-2">เลขที่</th><th class="p-2">ชื่อ-สกุล</th><th class="p-2">มา</th><th class="p-2">ขาด</th><th class="p-2">สาย</th><th class="p-2">ลา</th><th class="p-2">รวม</th></tr></thead>
        <tbody>${stats.rows
            .map(
                (row) =>
                    `<tr class="border-b border-slate-100"><td class="p-2">${row.classRoom ? `ม.${escapeHtml(row.classRoom.grade)}/${escapeHtml(row.classRoom.room)}` : "-"}</td><td class="p-2">${escapeHtml(row.student.number)}</td><td class="p-2">${escapeHtml(row.student.fullName)}</td><td class="p-2">${row.summary.present}</td><td class="p-2">${row.summary.absent}</td><td class="p-2">${row.summary.late}</td><td class="p-2">${row.summary.leave}</td><td class="p-2">${row.total}</td></tr>`,
            )
            .join("")}</tbody>
    </table></div>`;
}

void main().catch((error) => {
    document.body.textContent = messageText(error);
});
