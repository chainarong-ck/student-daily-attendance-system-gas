import { googleScriptRun } from "../../shared/gas-client";
import type { AdminBootstrap, ClassRoom, Student, StudentStatus } from "../../shared/types";
import {
    ADMIN_TOKEN_KEY,
    escapeHtml,
    messageText,
    noticeHtml,
    setBusy,
    shellHtml,
    showNotice,
    webAppUrl,
} from "./client-utils";

let token = "";
let state: AdminBootstrap;

async function main(): Promise<void> {
    token = localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
    if (!token) {
        window.location.href = `${webAppUrl("Login")}&role=admin`;
        return;
    }
    try {
        state = await googleScriptRun("getAdminBootstrap", token);
    } catch {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        window.location.href = `${webAppUrl("Login")}&role=admin`;
        return;
    }
    render();
}

function render(): void {
    document.body.innerHTML = shellHtml(
        "Admin",
        `
        ${noticeHtml("adminNotice")}
        <div class="grid gap-5">
            ${settingsPanel()}
            ${academicYearPanel()}
            ${classesPanel()}
            ${studentsPanel()}
        </div>`,
    );
    bindSettings();
    bindAcademicYears();
    bindClasses();
    bindStudents();
}

function panel(title: string, content: string): string {
    return `<section class="rounded-lg bg-white p-5 shadow-sm"><h2 class="mb-4 text-xl font-semibold">${title}</h2>${content}</section>`;
}

function settingsPanel(): string {
    return panel(
        "ตั้งค่าระบบ",
        `
        <form id="settingsForm" class="grid gap-4 sm:grid-cols-3">
            <div class="sm:col-span-3">
                <label class="mb-1 block text-sm font-medium">ชื่อโรงเรียน</label>
                <input name="schoolName" maxlength="100" value="${escapeHtml(state.config.schoolName)}" class="w-full rounded-md border border-slate-300 px-3 py-2" />
            </div>
            <div>
                <label class="mb-1 block text-sm font-medium">เปลี่ยนรหัสครู</label>
                <input name="appPassword" type="password" placeholder="เว้นว่างถ้าไม่เปลี่ยน" class="w-full rounded-md border border-slate-300 px-3 py-2" />
            </div>
            <div>
                <label class="mb-1 block text-sm font-medium">เปลี่ยนรหัส Admin</label>
                <input name="adminPassword" type="password" placeholder="เว้นว่างถ้าไม่เปลี่ยน" class="w-full rounded-md border border-slate-300 px-3 py-2" />
            </div>
            <div class="flex items-end">
                <button id="saveSettingsButton" class="w-full rounded-md bg-orange-600 px-4 py-2 font-semibold text-white">บันทึกตั้งค่า</button>
            </div>
        </form>`,
    );
}

function academicYearPanel(): string {
    const currentKey = state.config.currentYear
        ? `${state.config.currentYear.y}-${state.config.currentYear.t}`
        : "";
    return panel(
        "ปีการศึกษา",
        `
        <div class="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <select id="currentYearSelect" class="rounded-md border border-slate-300 px-3 py-2">
                ${state.config.academicYears
                    .map((year) => {
                        const key = `${year.y}-${year.t}`;
                        return `<option value="${key}" ${key === currentKey ? "selected" : ""}>ปี ${year.y} เทอม ${year.t}</option>`;
                    })
                    .join("")}
            </select>
            <button id="setCurrentYearButton" class="rounded-md bg-slate-800 px-4 py-2 font-semibold text-white">ตั้งเป็นปัจจุบัน</button>
        </div>
        <form id="addYearForm" class="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-[1fr_1fr_2fr_auto]">
            <input name="year" type="number" placeholder="ปีการศึกษา" class="rounded-md border border-slate-300 px-3 py-2" />
            <input name="term" type="number" placeholder="เทอม" class="rounded-md border border-slate-300 px-3 py-2" />
            <input name="sheetId" placeholder="Google Sheet URL หรือ ID" class="rounded-md border border-slate-300 px-3 py-2" />
            <button id="addYearButton" class="rounded-md bg-orange-600 px-4 py-2 font-semibold text-white">เพิ่ม</button>
        </form>`,
    );
}

function classesPanel(): string {
    return panel(
        "ห้องเรียน",
        `
        <div class="mb-3 flex justify-end"><button id="addClassRowButton" class="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold">+ เพิ่มแถว</button></div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-[520px] text-left text-sm">
                <thead class="bg-slate-100"><tr><th class="p-2">ระดับชั้น</th><th class="p-2">ห้อง</th><th class="p-2"></th></tr></thead>
                <tbody id="classRows">${state.classes.map(classRowHtml).join("")}</tbody>
            </table>
        </div>
        <button id="saveClassesButton" class="mt-4 rounded-md bg-orange-600 px-4 py-2 font-semibold text-white">บันทึกห้องเรียน</button>`,
    );
}

function classRowHtml(row?: ClassRoom): string {
    return `<tr class="border-b border-slate-100" data-id="${escapeHtml(row?.id ?? "")}">
        <td class="p-2"><input data-field="grade" value="${escapeHtml(row?.grade ?? "")}" class="w-full rounded-md border border-slate-300 px-2 py-1" /></td>
        <td class="p-2"><input data-field="room" value="${escapeHtml(row?.room ?? "")}" class="w-full rounded-md border border-slate-300 px-2 py-1" /></td>
        <td class="p-2 text-right"><button data-remove-row type="button" class="rounded-md bg-red-50 px-2 py-1 text-red-700">ลบ</button></td>
    </tr>`;
}

function studentsPanel(): string {
    return panel(
        "รายชื่อนักเรียน",
        `
        <p class="mb-3 text-sm text-slate-600">เพิ่มได้หลายแถว เลือกห้องเรียนให้ครบก่อนบันทึก เลขที่ในห้องเดียวกันห้ามซ้ำ</p>
        <div class="mb-3 flex justify-end"><button id="addStudentRowButton" class="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold">+ เพิ่มแถว</button></div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-[900px] text-left text-sm">
                <thead class="bg-slate-100"><tr><th class="p-2">ห้อง</th><th class="p-2">เลขที่</th><th class="p-2">รหัสนักเรียน</th><th class="p-2">ชื่อ-สกุล</th><th class="p-2">สถานะ</th><th class="p-2"></th></tr></thead>
                <tbody id="studentRows">${state.students.map(studentRowHtml).join("")}</tbody>
            </table>
        </div>
        <button id="saveStudentsButton" class="mt-4 rounded-md bg-orange-600 px-4 py-2 font-semibold text-white">บันทึกรายชื่อนักเรียน</button>`,
    );
}

function studentRowHtml(row?: Student): string {
    return `<tr class="border-b border-slate-100" data-id="${escapeHtml(row?.id ?? "")}">
        <td class="p-2"><select data-field="classId" class="w-full rounded-md border border-slate-300 px-2 py-1">${state.classes
            .map(
                (classRoom) =>
                    `<option value="${escapeHtml(classRoom.id)}" ${classRoom.id === row?.classId ? "selected" : ""}>ม.${escapeHtml(classRoom.grade)}/${escapeHtml(classRoom.room)}</option>`,
            )
            .join("")}</select></td>
        <td class="p-2"><input data-field="number" value="${escapeHtml(row?.number ?? "")}" class="w-full rounded-md border border-slate-300 px-2 py-1" /></td>
        <td class="p-2"><input data-field="studentCode" value="${escapeHtml(row?.studentCode ?? "")}" class="w-full rounded-md border border-slate-300 px-2 py-1" /></td>
        <td class="p-2"><input data-field="fullName" value="${escapeHtml(row?.fullName ?? "")}" class="w-full rounded-md border border-slate-300 px-2 py-1" /></td>
        <td class="p-2"><select data-field="status" class="w-full rounded-md border border-slate-300 px-2 py-1"><option value="active" ${row?.status !== "leave" ? "selected" : ""}>กำลังศึกษา</option><option value="leave" ${row?.status === "leave" ? "selected" : ""}>ออก/พักเรียน</option></select></td>
        <td class="p-2 text-right"><button data-remove-row type="button" class="rounded-md bg-red-50 px-2 py-1 text-red-700">ลบ</button></td>
    </tr>`;
}

function bindSettings(): void {
    const form = document.getElementById("settingsForm") as HTMLFormElement;
    const button = document.getElementById("saveSettingsButton") as HTMLButtonElement;
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void saveSettings(form, button);
    });
}

function bindAcademicYears(): void {
    const addForm = document.getElementById("addYearForm") as HTMLFormElement;
    const addButton = document.getElementById("addYearButton") as HTMLButtonElement;
    addForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void addYear(addForm, addButton);
    });
    document.getElementById("setCurrentYearButton")?.addEventListener("click", () => {
        const button = document.getElementById("setCurrentYearButton") as HTMLButtonElement;
        void setCurrentYear(button);
    });
}

function bindClasses(): void {
    document.getElementById("addClassRowButton")?.addEventListener("click", () => {
        document.getElementById("classRows")?.insertAdjacentHTML("beforeend", classRowHtml());
    });
    document.getElementById("classRows")?.addEventListener("click", removeRow);
    document.getElementById("saveClassesButton")?.addEventListener("click", () => {
        const button = document.getElementById("saveClassesButton") as HTMLButtonElement;
        void saveClasses(button);
    });
}

function bindStudents(): void {
    document.getElementById("addStudentRowButton")?.addEventListener("click", () => {
        document.getElementById("studentRows")?.insertAdjacentHTML("beforeend", studentRowHtml());
    });
    document.getElementById("studentRows")?.addEventListener("click", removeRow);
    document.getElementById("saveStudentsButton")?.addEventListener("click", () => {
        const button = document.getElementById("saveStudentsButton") as HTMLButtonElement;
        void saveStudents(button);
    });
}

function removeRow(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.matches("[data-remove-row]")) {
        target.closest("tr")?.remove();
    }
}

async function saveSettings(form: HTMLFormElement, button: HTMLButtonElement): Promise<void> {
    const data = new FormData(form);
    setBusy(button, true, "กำลังบันทึก...");
    try {
        state.config = await googleScriptRun("saveSystemSettings", token, {
            schoolName: String(data.get("schoolName") ?? ""),
            appPassword: String(data.get("appPassword") ?? "") || undefined,
            adminPassword: String(data.get("adminPassword") ?? "") || undefined,
        });
        render();
        showNotice("adminNotice", "บันทึกตั้งค่าระบบเรียบร้อย", "ok");
    } catch (error) {
        showNotice("adminNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

async function addYear(form: HTMLFormElement, button: HTMLButtonElement): Promise<void> {
    const data = new FormData(form);
    setBusy(button, true, "กำลังเพิ่ม...");
    try {
        state.config = await googleScriptRun("addAcademicYear", token, {
            id: String(data.get("sheetId") ?? ""),
            y: Number(data.get("year")),
            t: Number(data.get("term")),
        });
        render();
        showNotice("adminNotice", "เพิ่มปีการศึกษาเรียบร้อย", "ok");
    } catch (error) {
        showNotice("adminNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

async function setCurrentYear(button: HTMLButtonElement): Promise<void> {
    const key = (document.getElementById("currentYearSelect") as HTMLSelectElement).value;
    setBusy(button, true, "กำลังตั้งค่า...");
    try {
        state.config = await googleScriptRun("setCurrentAcademicYear", token, key);
        state = await googleScriptRun("getAdminBootstrap", token);
        render();
        showNotice("adminNotice", "ตั้งปีการศึกษาปัจจุบันเรียบร้อย", "ok");
    } catch (error) {
        showNotice("adminNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

async function saveClasses(button: HTMLButtonElement): Promise<void> {
    setBusy(button, true, "กำลังบันทึก...");
    try {
        const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>("#classRows tr")).map(
            (row) => ({
                id: row.dataset.id ?? "",
                grade: fieldValue(row, "grade"),
                room: fieldValue(row, "room"),
            }),
        );
        state.classes = await googleScriptRun("saveClasses", token, rows);
        state.students = await googleScriptRun("listStudents", token);
        render();
        showNotice("adminNotice", "บันทึกห้องเรียนเรียบร้อย", "ok");
    } catch (error) {
        showNotice("adminNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

async function saveStudents(button: HTMLButtonElement): Promise<void> {
    setBusy(button, true, "กำลังบันทึก...");
    try {
        const rows = Array.from(
            document.querySelectorAll<HTMLTableRowElement>("#studentRows tr"),
        ).map((row) => ({
            id: row.dataset.id ?? "",
            classId: fieldValue(row, "classId"),
            number: fieldValue(row, "number"),
            studentCode: fieldValue(row, "studentCode"),
            fullName: fieldValue(row, "fullName"),
            status: fieldValue(row, "status") as StudentStatus,
        }));
        state.students = await googleScriptRun("saveStudents", token, rows);
        render();
        showNotice("adminNotice", "บันทึกรายชื่อนักเรียนเรียบร้อย", "ok");
    } catch (error) {
        showNotice("adminNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

function fieldValue(row: HTMLTableRowElement, field: string): string {
    const input = row.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[data-field="${field}"]`,
    );
    return input?.value.trim() ?? "";
}

void main().catch((error) => {
    document.body.textContent = messageText(error);
});
