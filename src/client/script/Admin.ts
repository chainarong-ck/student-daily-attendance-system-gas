import { googleScriptRun } from "../../shared/gas-client";
import type {
    AcademicYear,
    AdminBootstrap,
    ClassRoom,
    Student,
    StudentStatus,
} from "../../shared/types";
import {
    ADMIN_TOKEN_KEY,
    bindShellActions,
    escapeHtml,
    messageText,
    noticeHtml,
    setBusy,
    shellHtml,
    showLoginRequired,
    showNotice,
} from "./client-utils";

type AdminTab = "settings" | "years" | "classes" | "students";

const studentCsvHeaders = [
    "number",
    "studentCode",
    "fullName",
    "status",
] as const;

let token = "";
let state: AdminBootstrap;
let activeAdminTab: AdminTab = "settings";
let selectedStudentClassId = "";

async function main(): Promise<void> {
    token = localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
    if (!token) {
        showLoginRequired("admin", "กรุณา Login ด้วยรหัส Admin ก่อนเข้าใช้งานหน้าผู้ดูแลระบบ");
        return;
    }
    try {
        state = await googleScriptRun("getAdminBootstrap", token);
    } catch (error) {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        showLoginRequired("admin", messageText(error));
        return;
    }
    render();
}

function render(): void {
    document.body.innerHTML = shellHtml(
        "Admin",
        `
        ${noticeHtml("adminNotice")}
        <div class="mb-4 flex flex-wrap gap-2">
            ${adminTabButton("settings", "ตั้งค่าระบบ")}
            ${adminTabButton("years", "ปีการศึกษา")}
            ${adminTabButton("classes", "ห้องเรียน")}
            ${adminTabButton("students", "รายชื่อนักเรียน")}
        </div>
        <div class="grid gap-5">
            <div id="settingsAdminPanel" class="${activeAdminTab === "settings" ? "" : "hidden"}">${settingsPanel()}</div>
            <div id="yearsAdminPanel" class="${activeAdminTab === "years" ? "" : "hidden"}">${academicYearPanel()}</div>
            <div id="classesAdminPanel" class="${activeAdminTab === "classes" ? "" : "hidden"}">${classesPanel()}</div>
            <div id="studentsAdminPanel" class="${activeAdminTab === "students" ? "" : "hidden"}">${studentsPanel()}</div>
        </div>`,
        {
            activePage: "Admin",
            logoutRole: "admin",
            showLoginLink: false,
        },
    );
    bindShellActions();
    bindAdminTabs();
    bindSettings();
    bindAcademicYears();
    bindClasses();
    bindStudents();
}

function adminTabButton(tab: AdminTab, label: string): string {
    return `<button type="button" data-admin-tab="${tab}" class="rounded-md px-4 py-2 text-sm font-semibold ${activeAdminTab === tab ? "bg-orange-600 text-white" : "bg-white text-slate-700"}">${label}</button>`;
}

function bindAdminTabs(): void {
    document.querySelectorAll<HTMLButtonElement>("[data-admin-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            activeAdminTab = (button.dataset.adminTab ?? "settings") as AdminTab;
            activateAdminTab();
        });
    });
}

function activateAdminTab(): void {
    (["settings", "years", "classes", "students"] as AdminTab[]).forEach((tab) => {
        document
            .getElementById(`${tab}AdminPanel`)
            ?.classList.toggle("hidden", activeAdminTab !== tab);
        const button = document.querySelector<HTMLButtonElement>(
            `[data-admin-tab="${tab}"]`,
        );
        button?.classList.toggle("bg-orange-600", activeAdminTab === tab);
        button?.classList.toggle("text-white", activeAdminTab === tab);
        button?.classList.toggle("bg-white", activeAdminTab !== tab);
        button?.classList.toggle("text-slate-700", activeAdminTab !== tab);
    });
}

function panel(title: string, content: string, subtitle?: string): string {
    return `<section class="rounded-lg bg-white p-5 shadow-sm"><h2 class="mb-4 text-xl font-semibold">${title}${subtitle ? `<span class="ml-2 text-sm font-medium text-slate-500">${escapeHtml(subtitle)}</span>` : ""}</h2>${content}</section>`;
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
        <p class="mb-3 text-sm text-slate-600">แก้ไขปีการศึกษา/เทอม และ Google Sheet ID ได้จากตารางนี้ เลือกแถวที่เป็นปีการศึกษาปัจจุบันก่อนบันทึก</p>
        <div class="mb-3 flex justify-end"><button id="addAcademicYearRowButton" class="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold">+ เพิ่มแถว</button></div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-190 text-left text-sm">
                <thead class="bg-slate-100"><tr><th class="p-2">ปัจจุบัน</th><th class="p-2">ปีการศึกษา</th><th class="p-2">เทอม</th><th class="p-2">Google Sheet URL หรือ ID</th><th class="p-2"></th></tr></thead>
                <tbody id="academicYearRows">${state.config.academicYears
                    .map((year) =>
                        academicYearRowHtml(
                            year,
                            `${year.y}-${year.t}` === currentKey,
                        ),
                    )
                    .join("")}</tbody>
            </table>
        </div>
        <button id="saveAcademicYearsButton" class="mt-4 rounded-md bg-orange-600 px-4 py-2 font-semibold text-white">บันทึกปีการศึกษา</button>`,
    );
}

function academicYearRowHtml(row?: AcademicYear, current = false): string {
    return `<tr class="border-b border-slate-100">
        <td class="p-2 text-center"><input type="radio" name="currentAcademicYear" data-current-year ${current ? "checked" : ""} /></td>
        <td class="p-2"><input data-field="year" type="number" value="${escapeHtml(row?.y ?? "")}" class="w-full rounded-md border border-slate-300 px-2 py-1" /></td>
        <td class="p-2"><input data-field="term" type="number" value="${escapeHtml(row?.t ?? "")}" class="w-full rounded-md border border-slate-300 px-2 py-1" /></td>
        <td class="p-2"><input data-field="sheetId" value="${escapeHtml(row?.id ?? "")}" class="w-full rounded-md border border-slate-300 px-2 py-1" /></td>
        <td class="p-2 text-right"><button data-remove-academic-year-row type="button" class="rounded-md bg-red-50 px-2 py-1 text-red-700">ลบ</button></td>
    </tr>`;
}

function currentAcademicYearLabel(): string {
    const currentYear = state.config.currentYear;
    return currentYear
        ? `ปีการศึกษา ${currentYear.y} เทอม ${currentYear.t}`
        : "ยังไม่ได้เลือกปีการศึกษาปัจจุบัน";
}

function classesPanel(): string {
    return panel(
        "ห้องเรียน",
        `
        <div class="mb-3 flex justify-end"><button id="addClassRowButton" class="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold">+ เพิ่มแถว</button></div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-130 text-left text-sm">
                <thead class="bg-slate-100"><tr><th class="p-2">ระดับชั้น</th><th class="p-2">ห้อง</th><th class="p-2"></th></tr></thead>
                <tbody id="classRows">${state.classes.map(classRowHtml).join("")}</tbody>
            </table>
        </div>
        <button id="saveClassesButton" class="mt-4 rounded-md bg-orange-600 px-4 py-2 font-semibold text-white">บันทึกห้องเรียน</button>`,
        currentAcademicYearLabel(),
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
    const selectedClassId = getSelectedStudentClassId();
    const selectedClass = state.classes.find((classRoom) => classRoom.id === selectedClassId);
    if (state.classes.length === 0) {
        return panel(
            "รายชื่อนักเรียน",
            `<p class="rounded-md bg-orange-50 px-4 py-3 text-sm text-orange-800">กรุณาเพิ่มห้องเรียนก่อน จึงจะเพิ่มรายชื่อนักเรียนได้</p>`,
            currentAcademicYearLabel(),
        );
    }
    return panel(
        "รายชื่อนักเรียน",
        `
        <div class="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
                <label class="mb-1 block text-sm font-medium">เลือกห้องเรียนที่ต้องการจัดการ</label>
                <select id="studentClassSelect" class="w-full rounded-md border border-slate-300 px-3 py-2">
                    ${state.classes
                        .map(
                            (classRoom) =>
                                `<option value="${escapeHtml(classRoom.id)}" ${classRoom.id === selectedClassId ? "selected" : ""}>${escapeHtml(classLabel(classRoom))}</option>`,
                        )
                        .join("")}
                </select>
            </div>
            <div class="flex items-end">
                <p class="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">กำลังจัดการห้อง ${escapeHtml(selectedClass ? classLabel(selectedClass) : "-")}</p>
            </div>
        </div>
        <p class="mb-3 text-sm text-slate-600">หน้านี้จัดการนักเรียนทีละห้องเท่านั้น เพื่อลดความเสี่ยงการแก้ไขข้อมูลห้องอื่นโดยไม่ตั้งใจ</p>
        <div class="mb-4 rounded-lg border border-slate-200 p-4">
            <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 class="font-semibold">Import CSV</h3>
                    <p class="text-sm text-slate-600">ใช้สำหรับเพิ่มนักเรียนใหม่ในห้องที่เลือก คอลัมน์ที่รองรับ: ${studentCsvHeaders.join(", ")}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button id="sampleStudentCsvButton" type="button" class="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold">ตัวอย่าง</button>
                    <button id="importStudentCsvButton" type="button" class="rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white">นำเข้า CSV</button>
                </div>
            </div>
            <textarea id="studentCsvInput" rows="8" spellcheck="false" class="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm" placeholder="number,studentCode,fullName,status"></textarea>
        </div>
        <div class="mb-3 flex justify-end"><button id="addStudentRowButton" class="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold">+ เพิ่มแถว</button></div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-180 text-left text-sm">
                <thead class="bg-slate-100"><tr><th class="p-2">เลขที่</th><th class="p-2">รหัสนักเรียน</th><th class="p-2">ชื่อ-สกุล</th><th class="p-2">สถานะ</th><th class="p-2"></th></tr></thead>
                <tbody id="studentRows">${state.students
                    .filter((student) => student.classId === selectedClassId)
                    .map(studentRowHtml)
                    .join("")}</tbody>
            </table>
        </div>
        <button id="saveStudentsButton" class="mt-4 rounded-md bg-orange-600 px-4 py-2 font-semibold text-white">บันทึกรายชื่อนักเรียนห้องนี้</button>`,
        currentAcademicYearLabel(),
    );
}

function getSelectedStudentClassId(): string {
    if (
        !selectedStudentClassId ||
        !state.classes.some((classRoom) => classRoom.id === selectedStudentClassId)
    ) {
        selectedStudentClassId = state.classes[0]?.id ?? "";
    }
    return selectedStudentClassId;
}

function studentRowHtml(row?: Student): string {
    return `<tr class="border-b border-slate-100" data-id="${escapeHtml(row?.id ?? "")}">
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
    document.getElementById("addAcademicYearRowButton")?.addEventListener("click", () => {
        const tbody = document.getElementById("academicYearRows");
        const shouldSelect = tbody?.querySelector("[data-current-year]") === null;
        tbody?.insertAdjacentHTML("beforeend", academicYearRowHtml(undefined, shouldSelect));
    });
    document.getElementById("academicYearRows")?.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        if (!target.matches("[data-remove-academic-year-row]")) {
            return;
        }
        target.closest("tr")?.remove();
        const checked = document.querySelector<HTMLInputElement>(
            '[name="currentAcademicYear"]:checked',
        );
        if (!checked) {
            document.querySelector<HTMLInputElement>("[data-current-year]")?.click();
        }
    });
    document.getElementById("saveAcademicYearsButton")?.addEventListener("click", () => {
        const button = document.getElementById("saveAcademicYearsButton") as HTMLButtonElement;
        void saveAcademicYears(button);
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
    document.getElementById("studentClassSelect")?.addEventListener("change", (event) => {
        selectedStudentClassId = (event.target as HTMLSelectElement).value;
        render();
    });
    document.getElementById("sampleStudentCsvButton")?.addEventListener("click", () => {
        loadSampleStudentCsv();
    });
    document.getElementById("importStudentCsvButton")?.addEventListener("click", () => {
        importStudentCsvToTable();
    });
    document.getElementById("addStudentRowButton")?.addEventListener("click", () => {
        document.getElementById("studentRows")?.insertAdjacentHTML(
            "beforeend",
            studentRowHtml({
                id: "",
                classId: getSelectedStudentClassId(),
                number: "",
                studentCode: "",
                fullName: "",
                status: "active",
            }),
        );
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

async function saveAcademicYears(button: HTMLButtonElement): Promise<void> {
    setBusy(button, true, "กำลังบันทึก...");
    try {
        const { academicYears, currentYearKey } = readAcademicYearRows();
        state.config = await googleScriptRun("saveAcademicYears", token, {
            academicYears,
            currentYearKey,
        });
        state = await googleScriptRun("getAdminBootstrap", token);
        render();
        showNotice("adminNotice", "บันทึกปีการศึกษาเรียบร้อย", "ok");
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
        const selectedClassId = getSelectedStudentClassId();
        const rows = [
            ...state.students.filter((student) => student.classId !== selectedClassId),
            ...readStudentRowsFromTable(selectedClassId),
        ];
        state.students = await googleScriptRun("saveStudents", token, rows);
        render();
        showNotice("adminNotice", "บันทึกรายชื่อนักเรียนห้องนี้เรียบร้อย", "ok");
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

function readAcademicYearRows(): {
    academicYears: AcademicYear[];
    currentYearKey: string;
} {
    const rows = Array.from(
        document.querySelectorAll<HTMLTableRowElement>("#academicYearRows tr"),
    );
    if (rows.length === 0) {
        throw new Error("ต้องมีปีการศึกษา/เทอมอย่างน้อย 1 รายการ");
    }
    const checkedRow = rows.find(
        (row) =>
            row.querySelector<HTMLInputElement>('[name="currentAcademicYear"]')
                ?.checked,
    );
    if (!checkedRow) {
        throw new Error("กรุณาเลือกปีการศึกษาปัจจุบัน");
    }
    const academicYears = rows.map((row) => ({
        id: fieldValue(row, "sheetId"),
        y: Number(fieldValue(row, "year")),
        t: Number(fieldValue(row, "term")),
    }));
    return {
        academicYears,
        currentYearKey: `${Number(fieldValue(checkedRow, "year"))}-${Number(
            fieldValue(checkedRow, "term"),
        )}`,
    };
}

function readStudentRowsFromTable(classId = getSelectedStudentClassId()): Student[] {
    return Array.from(
        document.querySelectorAll<HTMLTableRowElement>("#studentRows tr"),
    ).map((row) => ({
        id: row.dataset.id ?? "",
        classId,
        number: fieldValue(row, "number"),
        studentCode: fieldValue(row, "studentCode"),
        fullName: fieldValue(row, "fullName"),
        status: fieldValue(row, "status") as StudentStatus,
    }));
}

function loadSampleStudentCsv(): void {
    const textarea = document.getElementById("studentCsvInput") as HTMLTextAreaElement;
    textarea.value = [
        [...studentCsvHeaders],
        ["1", "10001", "เด็กชายตัวอย่าง นักเรียน", "active"],
        ["2", "10002", "เด็กหญิงตัวอย่าง นักเรียน", "leave"],
    ]
        .map((row) => row.map(escapeCsvCell).join(","))
        .join("\n");
    showNotice("adminNotice", "ใส่ตัวอย่าง CSV แล้ว แก้ข้อมูลแล้วกดนำเข้า CSV", "info");
}

function importStudentCsvToTable(): void {
    try {
        const textarea = document.getElementById("studentCsvInput") as HTMLTextAreaElement;
        const selectedClassId = getSelectedStudentClassId();
        const students = parseStudentsCsv(textarea.value, selectedClassId);
        validateStudentCsvImport(students, readStudentRowsFromTable(selectedClassId));
        const tbody = document.getElementById("studentRows");
        if (!tbody) {
            return;
        }
        tbody.insertAdjacentHTML("beforeend", students.map(studentRowHtml).join(""));
        textarea.value = "";
        showNotice(
            "adminNotice",
            `นำเข้า CSV เพิ่มในตารางแล้ว ${students.length} รายการ อย่าลืมกดบันทึกรายชื่อนักเรียน`,
            "ok",
        );
    } catch (error) {
        showNotice("adminNotice", messageText(error), "error");
    }
}

function parseStudentsCsv(csvText: string, classId: string): Student[] {
    const parsedRows = parseCsv(csvText).filter((row) =>
        row.some((cell) => cell.trim().length > 0),
    );
    if (parsedRows.length === 0) {
        return [];
    }
    const headerIndexes = csvHeaderIndexes(parsedRows[0]);
    return parsedRows.slice(1).map((row, index) => {
        const lineNumber = index + 2;
        const status = normalizeStudentStatus(csvCell(row, headerIndexes.status), lineNumber);
        const number = csvCell(row, headerIndexes.number);
        const studentCode = csvCell(row, headerIndexes.studentCode);
        const fullName = csvCell(row, headerIndexes.fullName);
        return {
            id: "",
            classId,
            number,
            studentCode,
            fullName,
            status,
        };
    });
}

function csvHeaderIndexes(headerRow: string[]): Record<(typeof studentCsvHeaders)[number], number> {
    const normalized = headerRow.map((cell) => cell.trim());
    const indexes = Object.fromEntries(
        studentCsvHeaders.map((header) => [header, normalized.indexOf(header)]),
    ) as Record<(typeof studentCsvHeaders)[number], number>;
    const missingHeaders = studentCsvHeaders.filter((header) => indexes[header] < 0);
    if (missingHeaders.length > 0) {
        throw new Error(`CSV ต้องมีหัวคอลัมน์: ${missingHeaders.join(", ")}`);
    }
    return indexes;
}

function validateStudentCsvImport(importRows: Student[], currentRows: Student[]): void {
    const existingClassNumbers = new Set<string>();
    const existingCodes = new Set<string>();
    currentRows.filter((student) => !isEmptyStudentRow(student)).forEach((student) => {
        existingClassNumbers.add(classNumberKey(student.classId, student.number));
        if (student.studentCode) {
            existingCodes.add(student.studentCode);
        }
    });
    const importClassNumbers = new Set<string>();
    const importCodes = new Set<string>();
    importRows.forEach((student, index) => {
        const lineNumber = index + 2;
        if (!student.number) {
            throw new Error(`ต้องระบุเลขที่นักเรียนที่บรรทัด ${lineNumber}`);
        }
        if (!student.fullName) {
            throw new Error(`ต้องระบุชื่อ-สกุลที่บรรทัด ${lineNumber}`);
        }
        const classNumber = classNumberKey(student.classId, student.number);
        if (existingClassNumbers.has(classNumber)) {
            throw new Error(
                `เลขที่ ${student.number} ในห้องนี้มีอยู่แล้ว กรุณาแก้ในตารางโดยตรง`,
            );
        }
        if (importClassNumbers.has(classNumber)) {
            throw new Error(`CSV มีเลขที่ซ้ำในห้องเดียวกันที่บรรทัด ${lineNumber}`);
        }
        importClassNumbers.add(classNumber);
        if (student.studentCode) {
            if (existingCodes.has(student.studentCode)) {
                throw new Error(
                    `รหัสนักเรียน ${student.studentCode} มีอยู่แล้ว กรุณาแก้ในตารางโดยตรง`,
                );
            }
            if (importCodes.has(student.studentCode)) {
                throw new Error(`CSV มีรหัสนักเรียนซ้ำที่บรรทัด ${lineNumber}`);
            }
            importCodes.add(student.studentCode);
        }
    });
}

function isEmptyStudentRow(student: Student): boolean {
    return (
        !student.classId &&
        !student.number &&
        !student.studentCode &&
        !student.fullName
    );
}

function classNumberKey(classId: string, number: string): string {
    return `${classId}:${number}`;
}

function normalizeStudentStatus(value: string, lineNumber: number): StudentStatus {
    const clean = value.trim();
    if (clean === "active" || clean === "กำลังศึกษา") {
        return "active";
    }
    if (clean === "leave" || clean === "ออก" || clean === "พักเรียน" || clean === "ออก/พักเรียน") {
        return "leave";
    }
    throw new Error(`สถานะนักเรียนไม่ถูกต้องที่บรรทัด ${lineNumber}: ${clean}`);
}

function classLabel(classRoom: ClassRoom): string {
    return `${classRoom.grade}/${classRoom.room}`;
}

function csvCell(row: string[], index: number): string {
    return (row[index] ?? "").trim();
}

function escapeCsvCell(value: string): string {
    if (!/[",\n\r]/.test(value)) {
        return value;
    }
    return `"${value.replace(/"/g, '""')}"`;
}

function parseCsv(csvText: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQuotes = false;
    for (let index = 0; index < csvText.length; index += 1) {
        const char = csvText[index];
        const nextChar = csvText[index + 1];
        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                cell += '"';
                index += 1;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                cell += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === ",") {
            row.push(cell);
            cell = "";
        } else if (char === "\n") {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        } else if (char !== "\r") {
            cell += char;
        }
    }
    if (inQuotes) {
        throw new Error("CSV มีเครื่องหมาย quote ไม่ครบคู่");
    }
    row.push(cell);
    rows.push(row);
    return rows;
}

void main().catch((error) => {
    document.body.textContent = messageText(error);
});
