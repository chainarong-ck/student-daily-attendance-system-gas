import { googleScriptRun } from "../../shared/gas-client";
import type {
    AcademicYear,
    AdminBootstrap,
    ClassRoom,
    Student,
    StudentGender,
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

type AdminTab = "settings" | "years" | "classes" | "students" | "forceDelete";

const forceDeleteConfirmText = "ลบถาวร";

const studentCsvHeaders = [
    "number",
    "studentCode",
    "fullName",
    "gender",
] as const;

let token = "";
let state: AdminBootstrap;
let activeAdminTab: AdminTab = "settings";
let selectedStudentClassId = "";

const panelClass =
    "rounded-lg border border-white/70 bg-white/95 p-5 shadow-xl shadow-slate-200/60";
const fieldClass =
    "w-full rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100";
const compactFieldClass =
    "w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 shadow-sm outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100";
const primaryButtonClass =
    "rounded-md bg-orange-600 px-4 py-2 font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
    "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800";
const tableHeadClass =
    "bg-gradient-to-r from-teal-50 to-orange-50 text-slate-700";

async function main(): Promise<void> {
    token = localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
    if (!token) {
        showLoginRequired(
            "admin",
            "กรุณา Login ด้วยรหัส Admin ก่อนเข้าใช้งานหน้าผู้ดูแลระบบ",
        );
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
        <div class="mb-4 flex flex-wrap gap-2 rounded-lg border border-white/70 bg-white/70 p-2 shadow-sm">
            ${adminTabButton("settings", "ตั้งค่าระบบ")}
            ${adminTabButton("years", "ปีการศึกษา")}
            ${adminTabButton("classes", "ห้องเรียน")}
            ${adminTabButton("students", "รายชื่อนักเรียน")}
            ${adminTabButton("forceDelete", "บังคับลบข้อมูล")}
        </div>
        <div class="grid gap-5">
            <div id="settingsAdminPanel" class="${activeAdminTab === "settings" ? "" : "hidden"}">${settingsPanel()}</div>
            <div id="yearsAdminPanel" class="${activeAdminTab === "years" ? "" : "hidden"}">${academicYearPanel()}</div>
            <div id="classesAdminPanel" class="${activeAdminTab === "classes" ? "" : "hidden"}">${classesPanel()}</div>
            <div id="studentsAdminPanel" class="${activeAdminTab === "students" ? "" : "hidden"}">${studentsPanel()}</div>
            <div id="forceDeleteAdminPanel" class="${activeAdminTab === "forceDelete" ? "" : "hidden"}">${forceDeletePanel()}</div>
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
    bindForceDelete();
}

function adminTabButton(tab: AdminTab, label: string): string {
    return `<button type="button" data-admin-tab="${tab}" class="${adminTabButtonClass(activeAdminTab === tab)}">${label}</button>`;
}

function adminTabButtonClass(active: boolean): string {
    return `rounded-md px-4 py-2 text-sm font-semibold transition ${active ? "bg-orange-600 text-white" : "bg-white text-slate-700 shadow-sm hover:bg-teal-50 hover:text-teal-800"}`;
}

function bindAdminTabs(): void {
    document
        .querySelectorAll<HTMLButtonElement>("[data-admin-tab]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                activeAdminTab = (button.dataset.adminTab ??
                    "settings") as AdminTab;
                activateAdminTab();
            });
        });
}

function activateAdminTab(): void {
    (
        [
            "settings",
            "years",
            "classes",
            "students",
            "forceDelete",
        ] as AdminTab[]
    ).forEach((tab) => {
        document
            .getElementById(`${tab}AdminPanel`)
            ?.classList.toggle("hidden", activeAdminTab !== tab);
        const button = document.querySelector<HTMLButtonElement>(
            `[data-admin-tab="${tab}"]`,
        );
        if (button) {
            button.className = adminTabButtonClass(activeAdminTab === tab);
        }
    });
}

function panel(title: string, content: string, subtitle?: string): string {
    return `<section class="${panelClass}"><h2 class="mb-4 text-xl font-bold text-slate-950">${title}${subtitle ? `<span class="ml-2 text-sm font-semibold text-teal-700">${escapeHtml(subtitle)}</span>` : ""}</h2>${content}</section>`;
}

function settingsPanel(): string {
    return panel(
        "ตั้งค่าระบบ",
        `
        <form id="settingsForm" class="grid gap-4 sm:grid-cols-3">
            <div class="sm:col-span-3">
                <label class="mb-1 block text-sm font-medium">ชื่อโรงเรียน</label>
                <input name="schoolName" maxlength="100" value="${escapeHtml(state.config.schoolName)}" class="${fieldClass}" />
            </div>
            <div>
                <label class="mb-1 block text-sm font-medium">เปลี่ยนรหัสครู</label>
                <input name="appPassword" type="password" placeholder="เว้นว่างถ้าไม่เปลี่ยน" class="${fieldClass}" />
            </div>
            <div>
                <label class="mb-1 block text-sm font-medium">เปลี่ยนรหัส Admin</label>
                <input name="adminPassword" type="password" placeholder="เว้นว่างถ้าไม่เปลี่ยน" class="${fieldClass}" />
            </div>
            <div class="flex items-end">
                <button id="saveSettingsButton" class="w-full ${primaryButtonClass}">บันทึกตั้งค่า</button>
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
        <div class="mb-3 flex justify-end"><button id="addAcademicYearRowButton" class="${secondaryButtonClass}">+ เพิ่มแถว</button></div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-190 overflow-hidden rounded-md text-left text-sm">
                <thead class="${tableHeadClass}"><tr><th class="p-3">ปัจจุบัน</th><th class="p-3">ปีการศึกษา</th><th class="p-3">เทอม</th><th class="p-3">Google Sheet URL หรือ ID</th><th class="p-3"></th></tr></thead>
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
        <button id="saveAcademicYearsButton" class="mt-4 ${primaryButtonClass}">บันทึกปีการศึกษา</button>`,
    );
}

function academicYearRowHtml(row?: AcademicYear, current = false): string {
    return `<tr class="border-b border-slate-100 transition hover:bg-teal-50/60">
        <td class="p-2 text-center"><input type="radio" name="currentAcademicYear" data-current-year ${current ? "checked" : ""} /></td>
        <td class="p-2"><input data-field="year" type="number" value="${escapeHtml(row?.y ?? "")}" class="${compactFieldClass}" /></td>
        <td class="p-2"><input data-field="term" type="number" value="${escapeHtml(row?.t ?? "")}" class="${compactFieldClass}" /></td>
        <td class="p-2"><input data-field="sheetId" value="${escapeHtml(row?.id ?? "")}" class="${compactFieldClass}" /></td>
        ${deleteActionCellHtml()}
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
        <div class="mb-3 flex justify-end"><button id="addClassRowButton" class="${secondaryButtonClass}">+ เพิ่มแถว</button></div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-130 overflow-hidden rounded-md text-left text-sm">
                <thead class="${tableHeadClass}"><tr><th class="p-3">ระดับชั้น</th><th class="p-3">ห้อง</th><th class="p-3"></th></tr></thead>
                <tbody id="classRows">${state.classes.map(classRowHtml).join("")}</tbody>
            </table>
        </div>
        <button id="saveClassesButton" class="mt-4 ${primaryButtonClass}">บันทึกห้องเรียน</button>`,
        currentAcademicYearLabel(),
    );
}

function classRowHtml(row?: ClassRoom): string {
    return `<tr class="border-b border-slate-100 transition hover:bg-teal-50/60" data-id="${escapeHtml(row?.id ?? "")}">
        <td class="p-2"><input data-field="grade" value="${escapeHtml(row?.grade ?? "")}" class="${compactFieldClass}" /></td>
        <td class="p-2"><input data-field="room" value="${escapeHtml(row?.room ?? "")}" class="${compactFieldClass}" /></td>
        ${deleteActionCellHtml()}
    </tr>`;
}

function studentsPanel(): string {
    const selectedClassId = getSelectedStudentClassId();
    const selectedClass = state.classes.find(
        (classRoom) => classRoom.id === selectedClassId,
    );
    if (state.classes.length === 0) {
        return panel(
            "รายชื่อนักเรียน",
            `<p class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">กรุณาเพิ่มห้องเรียนก่อน จึงจะเพิ่มรายชื่อนักเรียนได้</p>`,
            currentAcademicYearLabel(),
        );
    }
    return panel(
        "รายชื่อนักเรียน",
        `
        <div class="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
                <label class="mb-1 block text-sm font-medium">เลือกห้องเรียนที่ต้องการจัดการ</label>
                <select id="studentClassSelect" class="${fieldClass}">
                    ${state.classes
                        .map(
                            (classRoom) =>
                                `<option value="${escapeHtml(classRoom.id)}" ${classRoom.id === selectedClassId ? "selected" : ""}>${escapeHtml(classLabel(classRoom))}</option>`,
                        )
                        .join("")}
                </select>
            </div>
            <div class="flex items-end">
                <p class="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">กำลังจัดการห้อง ${escapeHtml(selectedClass ? classLabel(selectedClass) : "-")}</p>
            </div>
        </div>
        <p class="mb-3 text-sm text-slate-600">หน้านี้จัดการนักเรียนทีละห้องเท่านั้น เพื่อลดความเสี่ยงการแก้ไขข้อมูลห้องอื่นโดยไม่ตั้งใจ</p>
        <div class="mb-4 rounded-lg border border-sky-100 bg-sky-50/50 p-4">
            <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 class="font-semibold">Import CSV</h3>
                    <p class="text-sm text-slate-600">ใช้สำหรับเพิ่มนักเรียนใหม่ในห้องที่เลือก คอลัมน์ที่รองรับ: ${studentCsvHeaders.join(", ")} โดย gender ใช้ male/female หรือ ชาย/หญิง และระบบจะตั้งสถานะเป็นกำลังศึกษาอัตโนมัติ</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button id="sampleStudentCsvButton" type="button" class="${secondaryButtonClass}">ตัวอย่าง</button>
                    <button id="importStudentCsvButton" type="button" class="${primaryButtonClass} text-sm">นำเข้า CSV</button>
                </div>
            </div>
            <textarea id="studentCsvInput" rows="8" spellcheck="false" class="${fieldClass} font-mono text-sm" placeholder="number,studentCode,fullName,gender"></textarea>
        </div>
        <div class="mb-3 flex justify-end"><button id="addStudentRowButton" class="${secondaryButtonClass}">+ เพิ่มแถว</button></div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-220 overflow-hidden rounded-md text-left text-sm">
                <thead class="${tableHeadClass}"><tr><th class="p-3">เลขที่</th><th class="p-3">รหัสนักเรียน</th><th class="p-3">ชื่อ-สกุล</th><th class="p-3">เพศ</th><th class="p-3">สถานะ</th><th class="p-3"></th></tr></thead>
                <tbody id="studentRows">${state.students
                    .filter((student) => student.classId === selectedClassId)
                    .map(studentRowHtml)
                    .join("")}</tbody>
            </table>
        </div>
        <button id="saveStudentsButton" class="mt-4 ${primaryButtonClass}">บันทึกรายชื่อนักเรียนห้องนี้</button>`,
        currentAcademicYearLabel(),
    );
}

function forceDeletePanel(): string {
    const sortedStudents = [...state.students].sort((a, b) => {
        const classCompare = classLabelById(a.classId).localeCompare(
            classLabelById(b.classId),
            "th",
        );
        if (classCompare !== 0) {
            return classCompare;
        }
        return Number(a.number) - Number(b.number);
    });
    return panel(
        "บังคับลบข้อมูล",
        `
        <div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
            <p class="font-semibold">ใช้เฉพาะกรณีต้องการลบนักเรียนออกจากระบบถาวร</p>
            <p class="mt-1">ระบบจะลบนักเรียนที่เลือกออกจากรายชื่อ พร้อมลบประวัติการเช็คชื่อทั้งหมดของนักเรียนคนนั้นในปีการศึกษาปัจจุบัน การทำงานนี้ไม่สามารถย้อนกลับจากระบบได้</p>
        </div>
        ${
            sortedStudents.length === 0
                ? `<p class="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">ยังไม่มีรายชื่อนักเรียนในปีการศึกษานี้</p>`
                : `
                    <div class="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                        <div>
                            <label class="mb-1 block text-sm font-medium">ค้นหานักเรียน</label>
                            <input id="forceDeleteStudentSearch" placeholder="ค้นหาจากชื่อ รหัสนักเรียน เลขที่ หรือห้อง" class="${fieldClass}" />
                        </div>
                        <div class="flex items-end">
                            <p id="forceDeleteSelectedCount" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">เลือกแล้ว 0 คน</p>
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full min-w-200 overflow-hidden rounded-md text-left text-sm">
                            <thead class="${tableHeadClass}"><tr><th class="p-3">เลือก</th><th class="p-3">ห้อง</th><th class="p-3">เลขที่</th><th class="p-3">รหัสนักเรียน</th><th class="p-3">ชื่อ-สกุล</th><th class="p-3">เพศ</th><th class="p-3">สถานะ</th></tr></thead>
                            <tbody id="forceDeleteStudentRows">${sortedStudents.map(forceDeleteStudentRowHtml).join("")}</tbody>
                        </table>
                    </div>
                    <div class="mt-4 grid gap-3 rounded-lg border border-red-100 bg-red-50/40 p-4 sm:grid-cols-[1fr_auto]">
                        <div>
                            <label class="mb-1 block text-sm font-medium">ยืนยันการบังคับลบ</label>
                            <input id="forceDeleteConfirmInput" placeholder="พิมพ์ ${forceDeleteConfirmText}" class="${fieldClass}" />
                            <p class="mt-1 text-sm text-slate-600">ต้องพิมพ์คำว่า ${forceDeleteConfirmText} ให้ตรงก่อนจึงจะลบได้</p>
                        </div>
                        <div class="flex items-end">
                            <button id="forceDeleteStudentsButton" type="button" disabled class="w-full rounded-md bg-red-700 px-4 py-2 font-semibold text-white shadow-lg shadow-red-100 transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60">บังคับลบนักเรียนที่เลือก</button>
                        </div>
                    </div>
                `
        }`,
        currentAcademicYearLabel(),
    );
}

function forceDeleteStudentRowHtml(student: Student): string {
    const classText = classLabelById(student.classId);
    const searchText = normalizeSearchText(
        [
            classText,
            student.number,
            student.studentCode,
            student.fullName,
            student.gender,
            studentGenderLabel(student.gender),
            student.status,
            studentStatusLabel(student.status),
        ].join(" "),
    );
    return `<tr class="border-b border-slate-100 transition hover:bg-rose-50/60" data-force-delete-row data-search="${escapeHtml(searchText)}">
        <td class="p-3 text-center"><input type="checkbox" data-force-delete-student value="${escapeHtml(student.id)}" /></td>
        <td class="p-3">${escapeHtml(classText)}</td>
        <td class="p-3">${escapeHtml(student.number)}</td>
        <td class="p-3">${escapeHtml(student.studentCode || "-")}</td>
        <td class="p-3 font-medium text-slate-900">${escapeHtml(student.fullName)}</td>
        <td class="p-3">${escapeHtml(studentGenderLabel(student.gender))}</td>
        <td class="p-3">${escapeHtml(studentStatusLabel(student.status))}</td>
    </tr>`;
}

function getSelectedStudentClassId(): string {
    if (
        !selectedStudentClassId ||
        !state.classes.some(
            (classRoom) => classRoom.id === selectedStudentClassId,
        )
    ) {
        selectedStudentClassId = state.classes[0]?.id ?? "";
    }
    return selectedStudentClassId;
}

function studentRowHtml(row?: Student): string {
    return `<tr class="border-b border-slate-100 transition hover:bg-teal-50/60" data-id="${escapeHtml(row?.id ?? "")}">
        <td class="p-2"><input data-field="number" value="${escapeHtml(row?.number ?? "")}" class="${compactFieldClass}" /></td>
        <td class="p-2"><input data-field="studentCode" value="${escapeHtml(row?.studentCode ?? "")}" class="${compactFieldClass}" /></td>
        <td class="p-2"><input data-field="fullName" value="${escapeHtml(row?.fullName ?? "")}" class="${compactFieldClass}" /></td>
        <td class="p-2"><select data-field="gender" class="${compactFieldClass}">${studentGenderOptions(row?.gender ?? "unknown")}</select></td>
        <td class="p-2"><select data-field="status" class="${compactFieldClass}"><option value="active" ${row?.status !== "leave" ? "selected" : ""}>กำลังศึกษา</option><option value="leave" ${row?.status === "leave" ? "selected" : ""}>ออก/พักเรียน</option></select></td>
        ${deleteActionCellHtml()}
    </tr>`;
}

function studentGenderOptions(selected: StudentGender): string {
    return [
        ["unknown", "เลือกเพศ"],
        ["male", "ชาย"],
        ["female", "หญิง"],
    ]
        .map(
            ([value, label]) =>
                `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`,
        )
        .join("");
}

function deleteActionCellHtml(): string {
    return `<td class="p-2 text-right">
        <button data-toggle-delete-row type="button" class="rounded-lg bg-red-50 px-2.5 py-1.5 font-semibold text-red-700 transition hover:bg-red-100">ลบ</button>
        <span data-delete-hint class="mt-1 hidden text-xs font-medium text-red-700">จะลบเมื่อบันทึก</span>
    </td>`;
}

function bindSettings(): void {
    const form = document.getElementById("settingsForm") as HTMLFormElement;
    const button = document.getElementById(
        "saveSettingsButton",
    ) as HTMLButtonElement;
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void saveSettings(form, button);
    });
}

function bindAcademicYears(): void {
    document
        .getElementById("addAcademicYearRowButton")
        ?.addEventListener("click", () => {
            const tbody = document.getElementById("academicYearRows");
            const shouldSelect = !hasActiveCurrentAcademicYearSelection();
            tbody?.insertAdjacentHTML(
                "beforeend",
                academicYearRowHtml(undefined, shouldSelect),
            );
        });
    document
        .getElementById("academicYearRows")
        ?.addEventListener("click", toggleDeleteRow);
    document
        .getElementById("saveAcademicYearsButton")
        ?.addEventListener("click", () => {
            const button = document.getElementById(
                "saveAcademicYearsButton",
            ) as HTMLButtonElement;
            void saveAcademicYears(button);
        });
}

function bindClasses(): void {
    document
        .getElementById("addClassRowButton")
        ?.addEventListener("click", () => {
            document
                .getElementById("classRows")
                ?.insertAdjacentHTML("beforeend", classRowHtml());
        });
    document
        .getElementById("classRows")
        ?.addEventListener("click", toggleDeleteRow);
    document
        .getElementById("saveClassesButton")
        ?.addEventListener("click", () => {
            const button = document.getElementById(
                "saveClassesButton",
            ) as HTMLButtonElement;
            void saveClasses(button);
        });
}

function bindStudents(): void {
    document
        .getElementById("studentClassSelect")
        ?.addEventListener("change", (event) => {
            selectedStudentClassId = (event.target as HTMLSelectElement).value;
            render();
        });
    document
        .getElementById("sampleStudentCsvButton")
        ?.addEventListener("click", () => {
            loadSampleStudentCsv();
        });
    document
        .getElementById("importStudentCsvButton")
        ?.addEventListener("click", () => {
            importStudentCsvToTable();
        });
    document
        .getElementById("addStudentRowButton")
        ?.addEventListener("click", () => {
            document.getElementById("studentRows")?.insertAdjacentHTML(
                "beforeend",
                studentRowHtml({
                    id: "",
                    classId: getSelectedStudentClassId(),
                    number: "",
                    studentCode: "",
                    fullName: "",
                    gender: "unknown",
                    status: "active",
                }),
            );
        });
    document
        .getElementById("studentRows")
        ?.addEventListener("click", toggleDeleteRow);
    document
        .getElementById("saveStudentsButton")
        ?.addEventListener("click", () => {
            const button = document.getElementById(
                "saveStudentsButton",
            ) as HTMLButtonElement;
            void saveStudents(button);
        });
}

function bindForceDelete(): void {
    document
        .getElementById("forceDeleteStudentSearch")
        ?.addEventListener("input", () => {
            filterForceDeleteStudents();
        });
    document
        .getElementById("forceDeleteStudentRows")
        ?.addEventListener("change", () => {
            updateForceDeleteState();
        });
    document
        .getElementById("forceDeleteConfirmInput")
        ?.addEventListener("input", () => {
            updateForceDeleteState();
        });
    document
        .getElementById("forceDeleteStudentsButton")
        ?.addEventListener("click", () => {
            const button = document.getElementById(
                "forceDeleteStudentsButton",
            ) as HTMLButtonElement;
            void forceDeleteSelectedStudents(button);
        });
    updateForceDeleteState();
}

function filterForceDeleteStudents(): void {
    const query = normalizeSearchText(
        (
            document.getElementById(
                "forceDeleteStudentSearch",
            ) as HTMLInputElement | null
        )?.value ?? "",
    );
    document
        .querySelectorAll<HTMLTableRowElement>("[data-force-delete-row]")
        .forEach((row) => {
            const searchableText = row.dataset.search ?? "";
            row.classList.toggle(
                "hidden",
                query.length > 0 && !searchableText.includes(query),
            );
        });
}

function updateForceDeleteState(): void {
    const selectedCount = selectedForceDeleteStudentIds().length;
    const confirmText =
        (
            document.getElementById(
                "forceDeleteConfirmInput",
            ) as HTMLInputElement | null
        )?.value.trim() ?? "";
    const countLabel = document.getElementById("forceDeleteSelectedCount");
    if (countLabel) {
        countLabel.textContent = `เลือกแล้ว ${selectedCount} คน`;
    }
    const button = document.getElementById(
        "forceDeleteStudentsButton",
    ) as HTMLButtonElement | null;
    if (button) {
        button.disabled =
            selectedCount === 0 || confirmText !== forceDeleteConfirmText;
    }
}

async function forceDeleteSelectedStudents(
    button: HTMLButtonElement,
): Promise<void> {
    const studentIds = selectedForceDeleteStudentIds();
    const confirmText =
        (
            document.getElementById(
                "forceDeleteConfirmInput",
            ) as HTMLInputElement | null
        )?.value.trim() ?? "";
    if (studentIds.length === 0) {
        showNotice("adminNotice", "กรุณาเลือกนักเรียนที่ต้องการลบ", "error");
        return;
    }
    if (confirmText !== forceDeleteConfirmText) {
        showNotice(
            "adminNotice",
            `กรุณาพิมพ์ ${forceDeleteConfirmText} ให้ถูกต้อง`,
            "error",
        );
        return;
    }
    const confirmed = window.confirm(
        `ยืนยันบังคับลบนักเรียน ${studentIds.length} คน พร้อมประวัติการเช็คชื่อทั้งหมดใช่หรือไม่`,
    );
    if (!confirmed) {
        return;
    }
    setBusy(button, true, "กำลังลบ...");
    try {
        const result = await googleScriptRun("forceDeleteStudents", token, {
            studentIds,
            confirmText,
        });
        const deletedIds = new Set(studentIds);
        state.students = state.students.filter(
            (student) => !deletedIds.has(student.id),
        );
        render();
        showNotice(
            "adminNotice",
            `บังคับลบนักเรียน ${result.deletedStudents} คน และลบประวัติเช็คชื่อ ${result.deletedAttendanceRecords} รายการเรียบร้อย`,
            "ok",
        );
    } catch (error) {
        showNotice("adminNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
        updateForceDeleteState();
    }
}

function selectedForceDeleteStudentIds(): string[] {
    return Array.from(
        document.querySelectorAll<HTMLInputElement>(
            "[data-force-delete-student]:checked",
        ),
    ).map((input) => input.value);
}

function toggleDeleteRow(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.matches("[data-toggle-delete-row]")) {
        return;
    }
    const row = target.closest("tr") as HTMLTableRowElement | null;
    if (!row) {
        return;
    }
    const shouldMark = !isRowMarkedForDelete(row);
    if (shouldMark) {
        const currentRadio = row.querySelector<HTMLInputElement>(
            '[name="currentAcademicYear"]',
        );
        if (currentRadio?.checked) {
            currentRadio.checked = false;
        }
    }
    setRowDeleteMarked(row, shouldMark);
    if (row.closest("#academicYearRows")) {
        ensureAcademicYearSelection(shouldMark ? undefined : row);
    }
}

function setRowDeleteMarked(row: HTMLTableRowElement, marked: boolean): void {
    if (marked) {
        row.dataset.deleteMarked = "true";
    } else {
        delete row.dataset.deleteMarked;
    }
    row.classList.toggle("bg-red-50", marked);
    row.classList.toggle("text-slate-500", marked);
    row.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        "input, select",
    ).forEach((field) => {
        field.disabled = marked;
        field.classList.toggle("bg-red-50", marked);
    });
    const button = row.querySelector<HTMLButtonElement>(
        "[data-toggle-delete-row]",
    );
    if (button) {
        button.textContent = marked ? "ยกเลิก" : "ลบ";
        button.classList.toggle("bg-red-50", !marked);
        button.classList.toggle("text-red-700", !marked);
        button.classList.toggle("bg-slate-100", marked);
        button.classList.toggle("text-slate-700", marked);
    }
    row.querySelector<HTMLElement>("[data-delete-hint]")?.classList.toggle(
        "hidden",
        !marked,
    );
}

function isRowMarkedForDelete(row: HTMLTableRowElement): boolean {
    return row.dataset.deleteMarked === "true";
}

function activeTableRows(selector: string): HTMLTableRowElement[] {
    return Array.from(
        document.querySelectorAll<HTMLTableRowElement>(selector),
    ).filter((row) => !isRowMarkedForDelete(row));
}

function hasActiveCurrentAcademicYearSelection(): boolean {
    return activeTableRows("#academicYearRows tr").some(
        (row) =>
            row.querySelector<HTMLInputElement>('[name="currentAcademicYear"]')
                ?.checked,
    );
}

function ensureAcademicYearSelection(preferredRow?: HTMLTableRowElement): void {
    if (hasActiveCurrentAcademicYearSelection()) {
        return;
    }
    const preferredRadio = preferredRow?.querySelector<HTMLInputElement>(
        '[name="currentAcademicYear"]',
    );
    const fallbackRadio =
        preferredRadio ??
        activeTableRows(
            "#academicYearRows tr",
        )[0]?.querySelector<HTMLInputElement>('[name="currentAcademicYear"]');
    if (fallbackRadio) {
        fallbackRadio.checked = true;
    }
}

async function saveSettings(
    form: HTMLFormElement,
    button: HTMLButtonElement,
): Promise<void> {
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
        state = await googleScriptRun("saveAcademicYears", token, {
            academicYears,
            currentYearKey,
        });
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
        const rows = activeTableRows("#classRows tr").map((row) => ({
            id: row.dataset.id ?? "",
            grade: fieldValue(row, "grade"),
            room: fieldValue(row, "room"),
        }));
        state.classes = await googleScriptRun("saveClasses", token, rows);
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
        const selectedClassRows = readStudentRowsFromTable(selectedClassId);
        validateStudentRowsBeforeSave(selectedClassRows);
        const rows = [
            ...state.students.filter(
                (student) => student.classId !== selectedClassId,
            ),
            ...selectedClassRows,
        ];
        state.students = await googleScriptRun("saveStudents", token, rows);
        render();
        showNotice(
            "adminNotice",
            "บันทึกรายชื่อนักเรียนห้องนี้เรียบร้อย",
            "ok",
        );
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
    const rows = Array.from(activeTableRows("#academicYearRows tr"));
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

function readStudentRowsFromTable(
    classId = getSelectedStudentClassId(),
): Student[] {
    return activeTableRows("#studentRows tr")
        .map((row) => ({
            id: row.dataset.id ?? "",
            classId,
            number: fieldValue(row, "number"),
            studentCode: fieldValue(row, "studentCode"),
            fullName: fieldValue(row, "fullName"),
            gender: fieldValue(row, "gender") as StudentGender,
            status: fieldValue(row, "status") as StudentStatus,
        }))
        .filter((student) => !isEmptyStudentRow(student));
}

function validateStudentRowsBeforeSave(rows: Student[]): void {
    rows.forEach((student) => {
        if (student.gender === "unknown") {
            throw new Error(
                `กรุณาเลือกเพศของนักเรียนเลขที่ ${student.number || "-"}`,
            );
        }
    });
}

function loadSampleStudentCsv(): void {
    const textarea = document.getElementById(
        "studentCsvInput",
    ) as HTMLTextAreaElement;
    textarea.value = [
        [...studentCsvHeaders],
        ["1", "10001", "เด็กชายตัวอย่าง นักเรียน", "male"],
        ["2", "10002", "เด็กหญิงตัวอย่าง นักเรียน", "female"],
    ]
        .map((row) => row.map(escapeCsvCell).join(","))
        .join("\n");
    showNotice(
        "adminNotice",
        "ใส่ตัวอย่าง CSV แล้ว แก้ข้อมูลแล้วกดนำเข้า CSV",
        "info",
    );
}

function importStudentCsvToTable(): void {
    try {
        const textarea = document.getElementById(
            "studentCsvInput",
        ) as HTMLTextAreaElement;
        const selectedClassId = getSelectedStudentClassId();
        const students = parseStudentsCsv(textarea.value, selectedClassId);
        validateStudentCsvImport(
            students,
            readStudentRowsFromTable(selectedClassId),
        );
        const tbody = document.getElementById("studentRows");
        if (!tbody) {
            return;
        }
        tbody.insertAdjacentHTML(
            "beforeend",
            students.map(studentRowHtml).join(""),
        );
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
    return parsedRows.slice(1).map((row) => {
        const number = csvCell(row, headerIndexes.number);
        const studentCode = csvCell(row, headerIndexes.studentCode);
        const fullName = csvCell(row, headerIndexes.fullName);
        const gender = normalizeStudentGender(
            csvCell(row, headerIndexes.gender),
        );
        return {
            id: "",
            classId,
            number,
            studentCode,
            fullName,
            gender,
            status: "active",
        };
    });
}

function csvHeaderIndexes(
    headerRow: string[],
): Record<(typeof studentCsvHeaders)[number], number> {
    const normalized = headerRow.map((cell) => cell.trim());
    const indexes = Object.fromEntries(
        studentCsvHeaders.map((header) => [header, normalized.indexOf(header)]),
    ) as Record<(typeof studentCsvHeaders)[number], number>;
    const missingHeaders = studentCsvHeaders.filter(
        (header) => indexes[header] < 0,
    );
    if (missingHeaders.length > 0) {
        throw new Error(`CSV ต้องมีหัวคอลัมน์: ${missingHeaders.join(", ")}`);
    }
    return indexes;
}

function validateStudentCsvImport(
    importRows: Student[],
    currentRows: Student[],
): void {
    const existingClassNumbers = new Set<string>();
    const existingCodes = new Set<string>();
    currentRows
        .filter((student) => !isEmptyStudentRow(student))
        .forEach((student) => {
            existingClassNumbers.add(
                classNumberKey(student.classId, student.number),
            );
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
        if (student.gender === "unknown") {
            throw new Error(`ต้องระบุเพศชายหรือหญิงที่บรรทัด ${lineNumber}`);
        }
        const classNumber = classNumberKey(student.classId, student.number);
        if (existingClassNumbers.has(classNumber)) {
            throw new Error(
                `เลขที่ ${student.number} ในห้องนี้มีอยู่แล้ว กรุณาแก้ในตารางโดยตรง`,
            );
        }
        if (importClassNumbers.has(classNumber)) {
            throw new Error(
                `CSV มีเลขที่ซ้ำในห้องเดียวกันที่บรรทัด ${lineNumber}`,
            );
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
        !student.id &&
        !student.number &&
        !student.studentCode &&
        !student.fullName
    );
}

function classNumberKey(classId: string, number: string): string {
    return `${classId}:${number}`;
}

function classLabel(classRoom: ClassRoom): string {
    return `${classRoom.grade}/${classRoom.room}`;
}

function classLabelById(classId: string): string {
    const classRoom = state.classes.find((row) => row.id === classId);
    return classRoom ? classLabel(classRoom) : "-";
}

function studentStatusLabel(status: StudentStatus): string {
    return status === "leave" ? "ออก/พักเรียน" : "กำลังศึกษา";
}

function studentGenderLabel(gender: StudentGender): string {
    if (gender === "male") {
        return "ชาย";
    }
    if (gender === "female") {
        return "หญิง";
    }
    return "ไม่ระบุ";
}

function normalizeStudentGender(value: string): StudentGender {
    const clean = normalizeSearchText(value);
    if (clean === "male" || clean === "m" || clean === "ชาย") {
        return "male";
    }
    if (clean === "female" || clean === "f" || clean === "หญิง") {
        return "female";
    }
    return "unknown";
}

function normalizeSearchText(value: string): string {
    return value.toLocaleLowerCase("th").replace(/\s+/g, "");
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
