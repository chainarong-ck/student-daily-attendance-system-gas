import { googleScriptRun } from "../../shared/gas-client";
import type {
    AcademicYear,
    AdminBootstrap,
    ClassRoom,
    ReportTemplate,
    ReportTemplateConfig,
    ReportTableColumn,
    ReportTableDataSource,
    ReportTableDefinition,
    ReportTableHeaderCell,
    ReportType,
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

type AdminTab =
    | "settings"
    | "years"
    | "classes"
    | "students"
    | "reportTemplates"
    | "forceDelete";

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
let selectedTemplateSourceYearKey = "";
let sourceReportTemplates: ReportTemplate[] = [];
let editingTemplateCard: HTMLElement | null = null;
let editingTemplateConfig: ReportTemplateConfig | null = null;
let activeTemplateSection: "header" | "content" | "footer" = "header";
let selectedTemplateTableId = "";
let selectedHeaderCellIds = new Set<string>();
let lastTemplateEditorRange: Range | null = null;

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
            ${adminTabButton("reportTemplates", "แบบฟอร์มส่งออก")}
            ${adminTabButton("forceDelete", "บังคับลบข้อมูล")}
        </div>
        <div class="grid gap-5">
            <div id="settingsAdminPanel" class="${activeAdminTab === "settings" ? "" : "hidden"}">${settingsPanel()}</div>
            <div id="yearsAdminPanel" class="${activeAdminTab === "years" ? "" : "hidden"}">${academicYearPanel()}</div>
            <div id="classesAdminPanel" class="${activeAdminTab === "classes" ? "" : "hidden"}">${classesPanel()}</div>
            <div id="studentsAdminPanel" class="${activeAdminTab === "students" ? "" : "hidden"}">${studentsPanel()}</div>
            <div id="reportTemplatesAdminPanel" class="${activeAdminTab === "reportTemplates" ? "" : "hidden"}">${reportTemplatesPanel()}</div>
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
    bindReportTemplates();
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
            "reportTemplates",
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
        <td class="p-2"><input data-field="year" type="number" min="1" value="${escapeHtml(row?.y ?? "")}" class="${compactFieldClass}" /></td>
        <td class="p-2"><input data-field="term" type="number" min="1" max="3" value="${escapeHtml(row?.t ?? "")}" class="${compactFieldClass}" /></td>
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

function reportTemplatesPanel(): string {
    const currentKey = state.config.currentYear
        ? `${state.config.currentYear.y}-${state.config.currentYear.t}`
        : "";
    const sourceYears = state.config.academicYears.filter(
        (year) => `${year.y}-${year.t}` !== currentKey,
    );
    if (
        selectedTemplateSourceYearKey &&
        !sourceYears.some(
            (year) =>
                `${year.y}-${year.t}` === selectedTemplateSourceYearKey,
        )
    ) {
        selectedTemplateSourceYearKey = "";
        sourceReportTemplates = [];
    }
    return panel(
        "แบบฟอร์มส่งออก",
        `
        <p class="mb-4 text-sm text-slate-600">เทมเพลตในหน้านี้ถูกเก็บในชีต ReportTemplates ของปีการศึกษาปัจจุบัน การแก้ไขจะไม่กระทบเทมเพลตของปีการศึกษาอื่น</p>
        <div class="mb-5 rounded-lg border border-sky-200 bg-sky-50/60 p-4">
            <h3 class="font-semibold text-sky-950">คัดลอกจากปีการศึกษาอื่น</h3>
            ${
                sourceYears.length === 0
                    ? `<p class="mt-2 text-sm text-sky-800">ยังไม่มีปีการศึกษาอื่นสำหรับคัดลอกเทมเพลต</p>`
                    : `
                    <div class="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                        <select id="templateSourceYear" class="${fieldClass}">
                            <option value="">เลือกปีการศึกษาต้นทาง</option>
                            ${sourceYears
                                .map((year) => {
                                    const key = `${year.y}-${year.t}`;
                                    return `<option value="${escapeHtml(key)}" ${key === selectedTemplateSourceYearKey ? "selected" : ""}>ปีการศึกษา ${year.y} เทอม ${year.t}</option>`;
                                })
                                .join("")}
                        </select>
                        <button id="loadSourceTemplatesButton" type="button" class="${secondaryButtonClass}">โหลดรายการ</button>
                    </div>
                    <div id="sourceTemplateList" class="mt-3">${sourceTemplateListHtml()}</div>`
            }
        </div>
        <div class="mb-3 flex flex-wrap justify-between gap-2">
            <p class="text-sm text-slate-600">ตั้งค่าเริ่มต้นได้หนึ่งรายการต่อประเภทรายงาน และมีได้ไม่เกิน 30 รายการต่อปีการศึกษา</p>
            <div class="flex flex-wrap gap-2">
                <button type="button" data-add-report-template="daily" class="${secondaryButtonClass}">+ รายงานรายวัน</button>
                <button type="button" data-add-report-template="detailed" class="${secondaryButtonClass}">+ สถิติละเอียด</button>
            </div>
        </div>
        <div id="reportTemplateRows" class="grid gap-4">
            ${
                state.reportTemplates.length > 0
                    ? state.reportTemplates.map(reportTemplateCardHtml).join("")
                    : `<p id="emptyReportTemplateNotice" class="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">ยังไม่มีเทมเพลตในปีการศึกษานี้ สามารถสร้างใหม่หรือคัดลอกจากปีอื่นได้</p>`
            }
        </div>
        <button id="saveReportTemplatesButton" type="button" class="mt-4 ${primaryButtonClass}">บันทึกเทมเพลต</button>`,
        currentAcademicYearLabel(),
    );
}

function sourceTemplateListHtml(): string {
    if (!selectedTemplateSourceYearKey) {
        return `<p class="text-sm text-sky-800">เลือกปีการศึกษาแล้วกดโหลดรายการ</p>`;
    }
    if (sourceReportTemplates.length === 0) {
        return `<p class="text-sm text-sky-800">ปีการศึกษาที่เลือกยังไม่มีเทมเพลต</p>`;
    }
    return `
        <div class="grid gap-2 rounded-md border border-sky-100 bg-white p-3">
            ${sourceReportTemplates
                .map(
                    (template) => `
                    <label class="flex items-center gap-3 text-sm">
                        <input type="checkbox" data-source-template-id value="${escapeHtml(template.id)}" />
                        <span class="font-medium text-slate-900">${escapeHtml(template.name)}</span>
                        <span class="text-slate-500">${reportTypeLabel(template.reportType)}</span>
                    </label>`,
                )
                .join("")}
            <div class="mt-2"><button id="copyReportTemplatesButton" type="button" class="${primaryButtonClass} text-sm">คัดลอกที่เลือกมายังปีปัจจุบัน</button></div>
        </div>`;
}

function reportTemplateCardHtml(template: ReportTemplate): string {
    const config = template.config;
    return `<article data-report-template data-id="${escapeHtml(template.id)}" class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <textarea data-field="configJson" class="hidden">${escapeHtml(JSON.stringify(config))}</textarea>
        <div class="grid gap-3 lg:grid-cols-[1.5fr_1fr_auto_auto_auto]">
            <div>
                <label class="mb-1 block text-sm font-medium">ชื่อเทมเพลต</label>
                <input data-field="name" maxlength="100" value="${escapeHtml(template.name)}" class="${fieldClass}" />
            </div>
            <div>
                <label class="mb-1 block text-sm font-medium">ประเภทรายงาน</label>
                <select data-field="reportType" class="${fieldClass}">
                    <option value="daily" ${template.reportType === "daily" ? "selected" : ""}>รายงานรายวัน</option>
                    <option value="detailed" ${template.reportType === "detailed" ? "selected" : ""}>สถิติละเอียด</option>
                </select>
            </div>
            <label class="text-sm font-medium">สถานะ<select data-field="enabled" class="mt-1 ${fieldClass}"><option value="true" ${template.enabled ? "selected" : ""}>เปิดใช้งาน</option><option value="false" ${template.enabled ? "" : "selected"}>ปิดใช้งาน</option></select></label>
            <label class="text-sm font-medium">การเลือกใช้<select data-field="isDefault" class="mt-1 ${fieldClass}"><option value="false" ${template.isDefault ? "" : "selected"}>ตัวเลือกทั่วไป</option><option value="true" ${template.isDefault ? "selected" : ""}>ค่าเริ่มต้น</option></select></label>
            <button type="button" data-delete-report-template class="self-end rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">ลบ</button>
        </div>
        <div class="mt-4 flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3"><p class="text-sm text-slate-600">แก้ไขหน้ากระดาษ Header, Content, Footer และตารางทั้งหมดผ่าน Designer</p><button type="button" data-open-template-editor class="${primaryButtonClass}">เปิด Designer และ Preview</button></div>
        ${template.updatedAt ? `<p class="mt-2 text-right text-xs text-slate-400">แก้ไขล่าสุด ${escapeHtml(template.updatedAt)}</p>` : ""}
    </article>`;
}

function checked(value: boolean): string {
    return value ? "checked" : "";
}

function reportTypeLabel(reportType: ReportType): string {
    return reportType === "daily" ? "รายงานรายวัน" : "สถิติละเอียด";
}

function defaultReportTemplate(reportType: ReportType): ReportTemplate {
    return {
        id: "",
        name:
            reportType === "daily"
                ? "แบบฟอร์มรายงานประจำวัน"
                : "แบบฟอร์มสถิติละเอียด",
        reportType,
        isDefault: false,
        enabled: true,
        config: defaultReportTemplateConfig(reportType),
        updatedAt: "",
    };
}

function defaultReportTemplateConfig(
    reportType: ReportType,
): ReportTemplateConfig {
    return {
        orientation: reportType === "daily" ? "portrait" : "landscape",
        pageMarginMm: 12,
        fontFamily: "Sarabun, sans-serif",
        fontSizePt: 11,
        title:
            reportType === "daily"
                ? "รายงานสถิตินักเรียนประจำวัน"
                : "รายงานสถิติการเข้าเรียนแบบละเอียด",
        subtitle: "",
        showLogo: true,
        showStatusDetails: true,
        showDutyNotes: reportType === "daily",
        showSignatures: true,
        showDraftWatermark: true,
        sections: {
            headerHtml:
                '<div style="text-align:center"><h2>{{school.name}}</h2><p>{{report.title}}</p><p>ปีการศึกษา {{academic.year}} เทอม {{academic.term}}</p></div>',
            contentHtml:
                reportType === "daily"
                    ? '<p>ประจำวันที่ {{report.dateThai}}</p><p>{{table:daily-summary}}</p>'
                    : '<p>ช่วงวันที่ {{report.dateFromThai}} ถึง {{report.dateToThai}}</p><p>{{table:detailed-students}}</p>',
            footerHtml:
                '<div style="text-align:center"><p>ลงชื่อ................................................</p><p>(................................................)</p><p>ผู้รับรองรายงาน</p></div>',
        },
        tables: [defaultReportTable(reportType)],
    };
}

function defaultReportTable(reportType: ReportType): ReportTableDefinition {
    if (reportType === "daily") {
        const columns = [
            reportColumn("class", "ชั้น/ห้อง", "class.name", 20, "left"),
            reportColumn("students", "นักเรียนทั้งหมด", "students.total", 16),
            reportColumn("present", "มา", "present.total", 16),
            reportColumn("absent", "ขาด", "absent.total", 16),
            reportColumn("late", "สาย", "late.total", 16),
            reportColumn("leave", "ลา", "leave.total", 16),
        ];
        return {
            id: "daily-summary",
            name: "สรุปตามห้องเรียน",
            dataSource: "daily.classes",
            showHeader: true,
            showTotals: true,
            columns,
            headerRowCount: 1,
            headerCells: defaultReportHeaderCells(columns),
        };
    }
    const columns = [
        reportColumn("class", "ห้อง", "class.name", 12),
        reportColumn("number", "เลขที่", "student.number", 8),
        reportColumn("name", "ชื่อ-สกุล", "student.fullName", 28, "left"),
        reportColumn("present", "มา", "present.count", 13),
        reportColumn("absent", "ขาด", "absent.count", 13),
        reportColumn("late", "สาย", "late.count", 13),
        reportColumn("leave", "ลา", "leave.count", 13),
    ];
    return {
        id: "detailed-students",
        name: "สถิติรายบุคคล",
        dataSource: "detailed.students",
        showHeader: true,
        showTotals: false,
        columns,
        headerRowCount: 1,
        headerCells: defaultReportHeaderCells(columns),
    };
}

function reportColumn(
    id: string,
    header: string,
    valueToken: string,
    widthPercent: number,
    align: ReportTableColumn["align"] = "center",
): ReportTableColumn {
    return {
        id,
        header,
        valueToken,
        widthPercent,
        align,
        mergeRepeatingValues: false,
    };
}

function defaultReportHeaderCells(
    columns: ReportTableColumn[],
): ReportTableHeaderCell[] {
    return columns.map((column, columnIndex) => ({
        id: `head-${column.id}`,
        text: column.header,
        rowIndex: 0,
        columnIndex,
        rowSpan: 1,
        columnSpan: 1,
    }));
}

type TemplateTokenOption = {
    token: string;
    label: string;
    sample: string;
    reportTypes?: ReportType[];
};

const globalTemplateTokens: TemplateTokenOption[] = [
    { token: "school.name", label: "ชื่อโรงเรียน", sample: "โรงเรียนตัวอย่างวิทยา" },
    { token: "report.title", label: "หัวข้อรายงาน", sample: "รายงานสถิตินักเรียนประจำวัน" },
    { token: "report.subtitle", label: "หัวข้อรอง", sample: "รายงานการปฏิบัติหน้าที่เวรประจำวัน" },
    { token: "report.dateThai", label: "วันที่รายงาน", sample: "14 กรกฎาคม 2569", reportTypes: ["daily"] },
    { token: "report.dateFromThai", label: "วันที่เริ่มต้น", sample: "1 กรกฎาคม 2569", reportTypes: ["detailed"] },
    { token: "report.dateToThai", label: "วันที่สิ้นสุด", sample: "31 กรกฎาคม 2569", reportTypes: ["detailed"] },
    { token: "academic.year", label: "ปีการศึกษา", sample: "2569" },
    { token: "academic.term", label: "ภาคเรียน", sample: "1" },
    { token: "generatedAt", label: "วันเวลาที่สร้าง", sample: "14 ก.ค. 2569 15:30 น." },
];

const tableTokenOptions: Record<ReportTableDataSource, TemplateTokenOption[]> = {
    "daily.school": [
        { token: "students.male", label: "นักเรียนชายทั้งโรงเรียน", sample: "66" },
        { token: "students.female", label: "นักเรียนหญิงทั้งโรงเรียน", sample: "70" },
        { token: "students.total", label: "นักเรียนรวมทั้งโรงเรียน", sample: "136" },
        { token: "present.male", label: "มาชาย", sample: "62" },
        { token: "present.female", label: "มาหญิง", sample: "67" },
        { token: "present.total", label: "มารวม", sample: "129" },
        { token: "present.percent", label: "ร้อยละมา", sample: "94.85%" },
        { token: "absent.male", label: "ขาดชาย", sample: "2" },
        { token: "absent.female", label: "ขาดหญิง", sample: "1" },
        { token: "absent.total", label: "ขาดรวม", sample: "3" },
        { token: "absent.percent", label: "ร้อยละขาด", sample: "2.21%" },
        { token: "late.male", label: "สายชาย", sample: "1" },
        { token: "late.female", label: "สายหญิง", sample: "1" },
        { token: "late.total", label: "สายรวม", sample: "2" },
        { token: "late.percent", label: "ร้อยละสาย", sample: "1.47%" },
        { token: "leave.male", label: "ลาชาย", sample: "1" },
        { token: "leave.female", label: "ลาหญิง", sample: "1" },
        { token: "leave.total", label: "ลารวม", sample: "2" },
        { token: "leave.percent", label: "ร้อยละลา", sample: "1.47%" },
    ],
    "daily.classes": [
        { token: "class.name", label: "ชั้น/ห้อง", sample: "ม.1/1" },
        { token: "students.male", label: "นักเรียนชาย", sample: "12" },
        { token: "students.female", label: "นักเรียนหญิง", sample: "15" },
        { token: "students.total", label: "นักเรียนรวม", sample: "27" },
        { token: "present.male", label: "มาชาย", sample: "11" },
        { token: "present.female", label: "มาหญิง", sample: "14" },
        { token: "present.total", label: "มารวม", sample: "25" },
        { token: "absent.male", label: "ขาดชาย", sample: "1" },
        { token: "absent.female", label: "ขาดหญิง", sample: "0" },
        { token: "absent.total", label: "ขาดรวม", sample: "1" },
        { token: "late.male", label: "สายชาย", sample: "0" },
        { token: "late.female", label: "สายหญิง", sample: "1" },
        { token: "late.total", label: "สายรวม", sample: "1" },
        { token: "leave.male", label: "ลาชาย", sample: "0" },
        { token: "leave.female", label: "ลาหญิง", sample: "0" },
        { token: "leave.total", label: "ลารวม", sample: "0" },
        { token: "present.percent", label: "ร้อยละมา", sample: "92.59%" },
        { token: "absent.percent", label: "ร้อยละขาด", sample: "3.70%" },
        { token: "late.percent", label: "ร้อยละสาย", sample: "3.70%" },
        { token: "leave.percent", label: "ร้อยละลา", sample: "0.00%" },
    ],
    "daily.statusStudents": [
        { token: "class.name", label: "ชั้น/ห้อง", sample: "ม.1/1" },
        { token: "student.number", label: "เลขที่", sample: "8" },
        { token: "student.code", label: "รหัสนักเรียน", sample: "10008" },
        { token: "student.fullName", label: "ชื่อ-สกุล", sample: "เด็กชายสมชาย ใจดี" },
        { token: "student.gender", label: "เพศ", sample: "ชาย" },
        { token: "attendance.status", label: "สถานะ", sample: "ขาด" },
    ],
    "detailed.students": [
        { token: "class.name", label: "ชั้น/ห้อง", sample: "ม.1/1" },
        { token: "student.number", label: "เลขที่", sample: "8" },
        { token: "student.code", label: "รหัสนักเรียน", sample: "10008" },
        { token: "student.fullName", label: "ชื่อ-สกุล", sample: "เด็กชายสมชาย ใจดี" },
        { token: "student.gender", label: "เพศ", sample: "ชาย" },
        { token: "present.count", label: "จำนวนวันมา", sample: "18" },
        { token: "present.percent", label: "ร้อยละมา", sample: "90.00%" },
        { token: "absent.count", label: "จำนวนวันขาด", sample: "1" },
        { token: "absent.percent", label: "ร้อยละขาด", sample: "5.00%" },
        { token: "late.count", label: "จำนวนวันสาย", sample: "1" },
        { token: "late.percent", label: "ร้อยละสาย", sample: "5.00%" },
        { token: "leave.count", label: "จำนวนวันลา", sample: "0" },
        { token: "leave.percent", label: "ร้อยละลา", sample: "0.00%" },
        { token: "attendance.total", label: "รวมวันที่เช็คชื่อ", sample: "20" },
    ],
};

function openReportTemplateEditor(card: HTMLElement): void {
    const reportType = fieldValue(card, "reportType") as ReportType;
    editingTemplateCard = card;
    editingTemplateConfig = parseReportTemplateConfig(
        fieldValue(card, "configJson"),
        reportType,
    );
    activeTemplateSection = "header";
    selectedTemplateTableId = editingTemplateConfig.tables[0]?.id ?? "";
    selectedHeaderCellIds.clear();
    document.getElementById("reportTemplateEditorModal")?.remove();
    document.body.insertAdjacentHTML("beforeend", reportTemplateEditorHtml());
    bindReportTemplateEditor();
    renderTemplateSectionEditor();
    renderTableDesigner();
    renderReportTemplatePreview();
}

function reportTemplateEditorHtml(): string {
    const config = editingTemplateConfig;
    if (!config) {
        return "";
    }
    return `<div id="reportTemplateEditorModal" class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm lg:p-6">
        <div class="mx-auto max-w-[1700px] overflow-hidden rounded-xl bg-slate-100 shadow-2xl">
            <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
                <div><h2 class="text-xl font-bold text-slate-950">ออกแบบเอกสาร</h2><p class="text-sm text-slate-500">แก้ไขแต่ละส่วนแยกกันและตรวจผลบนกระดาษ A4 ทางขวา</p></div>
                <div class="flex gap-2"><button id="cancelTemplateEditorButton" type="button" class="${secondaryButtonClass}">ยกเลิก</button><button id="applyTemplateEditorButton" type="button" class="${primaryButtonClass}">นำการออกแบบไปใช้</button></div>
            </header>
            <div class="grid min-h-[78vh] lg:grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)]">
                <div class="space-y-4 overflow-y-auto p-4 lg:max-h-[calc(100vh-9rem)]">
                    ${templatePageSettingsHtml(config)}
                    <section class="rounded-lg border border-slate-200 bg-white shadow-sm">
                        <div class="flex border-b border-slate-200 bg-slate-50 p-1">
                            ${templateSectionTab("header", "Header · หัวกระดาษ")}
                            ${templateSectionTab("content", "Content · เนื้อหา")}
                            ${templateSectionTab("footer", "Footer · ท้ายกระดาษ")}
                        </div>
                        <div class="p-4">
                            ${richTextToolbarHtml()}
                            <div id="templateSectionEditor" contenteditable="true" spellcheck="true" class="report-template-rich-content mt-3 min-h-56 rounded-md border border-slate-300 bg-white p-4 leading-relaxed outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"></div>
                            <p class="mt-2 text-xs text-slate-500">สามารถพิมพ์ วางข้อความจาก Word และแทรกตัวแปรจากรายการด้านบนได้ เนื้อหาที่เป็น script หรือ event จะถูกตัดออก</p>
                        </div>
                    </section>
                    <section id="templateTableDesignerSection" class="hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div class="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 class="font-bold">ตัวออกแบบตาราง</h3><p class="text-sm text-slate-500">กำหนด data source และคอลัมน์ที่คำนวณจากข้อมูลจริง</p></div><button id="addTemplateTableButton" type="button" class="${secondaryButtonClass}">+ เพิ่มตาราง</button></div>
                        <div id="templateTableDesigner"></div>
                    </section>
                </div>
                <aside class="border-l border-slate-300 bg-slate-200/70 p-4 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
                    <div class="mb-3 flex items-center justify-between"><h3 class="font-bold text-slate-800">Live Preview</h3><span class="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">ข้อมูลตัวอย่าง</span></div>
                    <div id="reportTemplatePreview" class="mx-auto origin-top"></div>
                </aside>
            </div>
        </div>
    </div>`;
}

function templatePageSettingsHtml(config: ReportTemplateConfig): string {
    return `<section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 class="mb-3 font-bold">ตั้งค่าหน้ากระดาษ</h3>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label class="text-sm font-medium sm:col-span-2">หัวข้อรายงาน<input id="editorReportTitle" maxlength="500" value="${escapeHtml(config.title)}" class="mt-1 ${fieldClass}" /></label>
            <label class="text-sm font-medium sm:col-span-2">หัวข้อรอง<input id="editorReportSubtitle" maxlength="500" value="${escapeHtml(config.subtitle)}" class="mt-1 ${fieldClass}" /></label>
            <label class="text-sm font-medium">แนวกระดาษ<select id="editorPageOrientation" class="mt-1 ${fieldClass}"><option value="portrait" ${config.orientation === "portrait" ? "selected" : ""}>แนวตั้ง</option><option value="landscape" ${config.orientation === "landscape" ? "selected" : ""}>แนวนอน</option></select></label>
            <label class="text-sm font-medium">ระยะขอบ (มม.)<input id="editorPageMargin" type="number" min="5" max="30" value="${config.pageMarginMm}" class="mt-1 ${fieldClass}" /></label>
            <label class="text-sm font-medium">ฟอนต์<select id="editorFontFamily" class="mt-1 ${fieldClass}">${fontFamilyOptions(config.fontFamily)}</select></label>
            <label class="text-sm font-medium">ขนาดตัวอักษร (pt)<input id="editorFontSize" type="number" min="8" max="20" value="${config.fontSizePt}" class="mt-1 ${fieldClass}" /></label>
            <label class="flex items-center gap-2 text-sm font-medium"><input id="editorDraftWatermark" type="checkbox" ${checked(config.showDraftWatermark)} /> แสดงลายน้ำฉบับร่างใน Preview</label>
        </div>
    </section>`;
}

function fontFamilyOptions(selected: string): string {
    return [
        ["Sarabun, sans-serif", "Sarabun"],
        ['"Noto Sans Thai", sans-serif', "Noto Sans Thai"],
    ]
        .map(
            ([value, label]) =>
                `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`,
        )
        .join("");
}

function templateSectionTab(
    section: "header" | "content" | "footer",
    label: string,
): string {
    return `<button type="button" data-template-section="${section}" class="flex-1 rounded-md px-3 py-2 text-sm font-semibold transition">${label}</button>`;
}

function richTextToolbarHtml(): string {
    const reportType = currentEditingReportType();
    const availableTokens = globalTemplateTokens.filter(
        (item) => !item.reportTypes || item.reportTypes.includes(reportType),
    );
    return `<div class="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
        <select id="editorBlockFormat" class="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"><option value="p">ย่อหน้าปกติ</option><option value="h1">หัวข้อ 1</option><option value="h2">หัวข้อ 2</option><option value="h3">หัวข้อ 3</option></select>
        <select id="editorSelectionFontSize" class="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"><option value="">ขนาดข้อความ</option><option value="1">เล็กมาก</option><option value="2">เล็ก</option><option value="3">ปกติ</option><option value="4">ใหญ่</option><option value="5">ใหญ่มาก</option><option value="6">หัวข้อใหญ่</option></select>
        ${editorCommandButton("bold", "B", "ตัวหนา")}${editorCommandButton("italic", "I", "ตัวเอียง")}${editorCommandButton("underline", "U", "ขีดเส้นใต้")}
        ${editorCommandButton("justifyLeft", "ชิดซ้าย")}${editorCommandButton("justifyCenter", "กึ่งกลาง")}${editorCommandButton("justifyRight", "ชิดขวา")}
        ${editorCommandButton("insertUnorderedList", "• รายการ")}${editorCommandButton("insertOrderedList", "1. รายการ")}
        <input id="editorTextColor" type="color" value="#0f172a" title="สีตัวอักษร" class="h-8 w-10 rounded border border-slate-200 bg-white p-1" />
        <select id="editorGlobalToken" class="min-w-48 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"><option value="">แทรกตัวแปรข้อมูล...</option>${availableTokens.map((item) => `<option value="${item.token}">${item.label} · {{${item.token}}}</option>`).join("")}</select>
    </div>`;
}

function currentEditingReportType(): ReportType {
    return fieldValue(editingTemplateCard ?? document, "reportType") ===
        "detailed"
        ? "detailed"
        : "daily";
}

function editorCommandButton(
    command: string,
    label: string,
    title = label,
): string {
    return `<button type="button" data-editor-command="${command}" title="${title}" class="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold hover:bg-teal-50">${label}</button>`;
}

function bindReportTemplateEditor(): void {
    document
        .getElementById("cancelTemplateEditorButton")
        ?.addEventListener("click", closeReportTemplateEditor);
    document
        .getElementById("applyTemplateEditorButton")
        ?.addEventListener("click", applyReportTemplateEditor);
    document
        .querySelectorAll<HTMLButtonElement>("[data-template-section]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                syncTemplateSectionFromEditor();
                activeTemplateSection = (button.dataset.templateSection ??
                    "header") as typeof activeTemplateSection;
                renderTemplateSectionEditor();
            });
        });
    document
        .querySelectorAll<HTMLButtonElement>("[data-editor-command]")
        .forEach((button) => {
            button.addEventListener("mousedown", (event) => {
                event.preventDefault();
                document.execCommand(button.dataset.editorCommand ?? "", false);
                syncTemplateSectionFromEditor();
                renderReportTemplatePreview();
            });
        });
    document
        .getElementById("editorBlockFormat")
        ?.addEventListener("change", (event) => {
            const select = event.target as HTMLSelectElement;
            restoreTemplateEditorSelection();
            document.execCommand("formatBlock", false, select.value);
            syncTemplateSectionFromEditor();
            renderReportTemplatePreview();
        });
    document
        .getElementById("editorSelectionFontSize")
        ?.addEventListener("change", (event) => {
            const select = event.target as HTMLSelectElement;
            if (select.value) {
                restoreTemplateEditorSelection();
                document.execCommand("fontSize", false, select.value);
                select.value = "";
                syncTemplateSectionFromEditor();
                renderReportTemplatePreview();
            }
        });
    document
        .getElementById("editorTextColor")
        ?.addEventListener("input", (event) => {
            restoreTemplateEditorSelection();
            document.execCommand(
                "foreColor",
                false,
                (event.target as HTMLInputElement).value,
            );
            syncTemplateSectionFromEditor();
            renderReportTemplatePreview();
        });
    document
        .getElementById("editorGlobalToken")
        ?.addEventListener("change", (event) => {
            const select = event.target as HTMLSelectElement;
            if (select.value) {
                insertTextAtEditorSelection(`{{${select.value}}}`);
                select.value = "";
            }
        });
    document
        .getElementById("templateSectionEditor")
        ?.addEventListener("input", () => {
            captureTemplateEditorSelection();
            syncTemplateSectionFromEditor();
            renderReportTemplatePreview();
        });
    ["keyup", "mouseup"].forEach((eventName) => {
        document
            .getElementById("templateSectionEditor")
            ?.addEventListener(eventName, captureTemplateEditorSelection);
    });
    [
        "editorReportTitle",
        "editorReportSubtitle",
        "editorPageOrientation",
        "editorPageMargin",
        "editorFontFamily",
        "editorFontSize",
        "editorDraftWatermark",
    ].forEach((id) => {
        document.getElementById(id)?.addEventListener("input", () => {
            syncTemplatePageSettings();
            renderReportTemplatePreview();
        });
    });
    document
        .getElementById("addTemplateTableButton")
        ?.addEventListener("click", addTemplateTable);
    document
        .getElementById("templateTableDesigner")
        ?.addEventListener("input", handleTableDesignerInput);
    document
        .getElementById("templateTableDesigner")
        ?.addEventListener("change", handleTableDesignerChange);
    document
        .getElementById("templateTableDesigner")
        ?.addEventListener("click", handleTableDesignerClick);
}

function closeReportTemplateEditor(): void {
    document.getElementById("reportTemplateEditorModal")?.remove();
    editingTemplateCard = null;
    editingTemplateConfig = null;
    lastTemplateEditorRange = null;
}

function applyReportTemplateEditor(): void {
    if (!editingTemplateCard || !editingTemplateConfig) {
        return;
    }
    syncTemplateSectionFromEditor();
    syncTemplatePageSettings();
    syncSelectedTableFromDesigner();
    const configField = editingTemplateCard.querySelector<HTMLTextAreaElement>(
        '[data-field="configJson"]',
    );
    if (configField) {
        configField.value = JSON.stringify(editingTemplateConfig);
    }
    closeReportTemplateEditor();
    showNotice(
        "adminNotice",
        "นำการออกแบบมาใช้ในแบบฟอร์มแล้ว กรุณากดบันทึกเทมเพลตเพื่อบันทึกลง Sheet",
        "info",
    );
}

function renderTemplateSectionEditor(): void {
    const config = editingTemplateConfig;
    const editor = document.getElementById("templateSectionEditor");
    if (!config || !editor) {
        return;
    }
    editor.innerHTML = sanitizeTemplateHtml(sectionHtml(config));
    lastTemplateEditorRange = null;
    document
        .querySelectorAll<HTMLButtonElement>("[data-template-section]")
        .forEach((button) => {
            const active = button.dataset.templateSection === activeTemplateSection;
            button.className = `flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${active ? "bg-orange-600 text-white" : "text-slate-600 hover:bg-white"}`;
        });
    document
        .getElementById("templateTableDesignerSection")
        ?.classList.toggle("hidden", activeTemplateSection !== "content");
    renderReportTemplatePreview();
}

function sectionHtml(config: ReportTemplateConfig): string {
    if (activeTemplateSection === "content") {
        return config.sections.contentHtml;
    }
    if (activeTemplateSection === "footer") {
        return config.sections.footerHtml;
    }
    return config.sections.headerHtml;
}

function syncTemplateSectionFromEditor(): void {
    const config = editingTemplateConfig;
    const editor = document.getElementById("templateSectionEditor");
    if (!config || !editor) {
        return;
    }
    const html = sanitizeTemplateHtml(editor.innerHTML);
    if (activeTemplateSection === "content") {
        config.sections.contentHtml = html;
    } else if (activeTemplateSection === "footer") {
        config.sections.footerHtml = html;
    } else {
        config.sections.headerHtml = html;
    }
}

function syncTemplatePageSettings(): void {
    const config = editingTemplateConfig;
    if (!config) {
        return;
    }
    config.orientation =
        (document.getElementById("editorPageOrientation") as HTMLSelectElement)
            .value === "landscape"
            ? "landscape"
            : "portrait";
    config.title = (
        document.getElementById("editorReportTitle") as HTMLInputElement
    ).value.trim();
    config.subtitle = (
        document.getElementById("editorReportSubtitle") as HTMLInputElement
    ).value.trim();
    config.pageMarginMm = numberInputValue("editorPageMargin", 5, 30, 12);
    config.fontFamily = (
        document.getElementById("editorFontFamily") as HTMLSelectElement
    ).value;
    config.fontSizePt = numberInputValue("editorFontSize", 8, 20, 11);
    config.showDraftWatermark =
        (
            document.getElementById(
                "editorDraftWatermark",
            ) as HTMLInputElement | null
        )?.checked ?? true;
}

function numberInputValue(
    id: string,
    min: number,
    max: number,
    fallback: number,
): number {
    const value = Number(
        (document.getElementById(id) as HTMLInputElement | null)?.value,
    );
    return Number.isFinite(value) && value >= min && value <= max
        ? value
        : fallback;
}

function insertTextAtEditorSelection(text: string): void {
    const editor = document.getElementById("templateSectionEditor");
    if (!editor) {
        return;
    }
    insertNodeAtEditorSelection(document.createTextNode(text));
    syncTemplateSectionFromEditor();
    renderReportTemplatePreview();
}

function insertHtmlAtEditorSelection(html: string): void {
    const template = document.createElement("template");
    template.innerHTML = sanitizeTemplateHtml(html);
    insertNodeAtEditorSelection(template.content);
    syncTemplateSectionFromEditor();
    renderReportTemplatePreview();
}

function insertNodeAtEditorSelection(node: Node): void {
    const editor = document.getElementById("templateSectionEditor");
    if (!editor) {
        return;
    }
    editor.focus();
    const range = lastTemplateEditorRange?.cloneRange();
    if (range && editor.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(node);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        lastTemplateEditorRange = range.cloneRange();
        return;
    }
    editor.append(node);
    captureTemplateEditorSelection();
}

function captureTemplateEditorSelection(): void {
    const editor = document.getElementById("templateSectionEditor");
    const selection = window.getSelection();
    if (
        editor &&
        selection &&
        selection.rangeCount > 0 &&
        editor.contains(selection.getRangeAt(0).commonAncestorContainer)
    ) {
        lastTemplateEditorRange = selection.getRangeAt(0).cloneRange();
    }
}

function restoreTemplateEditorSelection(): void {
    if (!lastTemplateEditorRange) {
        return;
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(lastTemplateEditorRange);
}

function renderTableDesigner(): void {
    const container = document.getElementById("templateTableDesigner");
    const config = editingTemplateConfig;
    if (!container || !config) {
        return;
    }
    if (
        selectedTemplateTableId &&
        !config.tables.some((table) => table.id === selectedTemplateTableId)
    ) {
        selectedTemplateTableId = config.tables[0]?.id ?? "";
    }
    const selected = selectedReportTable();
    container.innerHTML = `
        <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
            <select id="templateTableSelect" class="${fieldClass}">
                ${
                    config.tables.length > 0
                        ? config.tables
                              .map(
                                  (table) =>
                                      `<option value="${escapeHtml(table.id)}" ${table.id === selectedTemplateTableId ? "selected" : ""}>${escapeHtml(table.name)}</option>`,
                              )
                              .join("")
                        : `<option value="">ยังไม่มีตาราง</option>`
                }
            </select>
            <div class="flex gap-2"><button type="button" data-insert-table-token class="${secondaryButtonClass}" ${selected ? "" : "disabled"}>แทรกตารางใน Content</button><button type="button" data-delete-template-table class="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100" ${selected ? "" : "disabled"}>ลบตาราง</button></div>
        </div>
        ${selected ? reportTableFormHtml(selected) : `<p class="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">กด “เพิ่มตาราง” เพื่อสร้างตารางใหม่</p>`}`;
}

function reportTableFormHtml(table: ReportTableDefinition): string {
    return `<div class="mt-4 space-y-4">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label class="text-sm font-medium">ชื่อตาราง<input data-table-field="name" value="${escapeHtml(table.name)}" class="mt-1 ${fieldClass}" /></label>
            <label class="text-sm font-medium">รหัสตาราง<input value="${escapeHtml(table.id)}" disabled class="mt-1 ${fieldClass} bg-slate-100" /></label>
            <label class="text-sm font-medium">แหล่งข้อมูล<select data-table-field="dataSource" class="mt-1 ${fieldClass}">${tableDataSourceOptions(table.dataSource)}</select></label>
        </div>
        <div class="flex flex-wrap gap-5 rounded-md bg-slate-50 p-3 text-sm"><label class="flex items-center gap-2"><input data-table-field="showHeader" type="checkbox" ${checked(table.showHeader)} /> แสดงหัวตาราง</label><label class="flex items-center gap-2"><input data-table-field="showTotals" type="checkbox" ${checked(table.showTotals)} /> แสดงแถวรวม</label></div>
        ${reportHeaderGridDesignerHtml(table)}
        <div>
            <div class="mb-2 flex items-center justify-between"><div><h4 class="font-semibold">คอลัมน์</h4><p class="text-xs text-slate-500">เลือกค่าที่ระบบเตรียมไว้ ความกว้างเป็นสัดส่วนเปอร์เซ็นต์ของตาราง</p></div><button type="button" data-add-table-column class="${secondaryButtonClass}">+ คอลัมน์</button></div>
            <div class="overflow-x-auto"><table class="w-full min-w-[920px] text-sm"><thead class="${tableHeadClass}"><tr><th class="p-2">ชื่ออ้างอิง</th><th class="p-2">ข้อมูล/สูตรคำนวณ</th><th class="p-2 w-24">กว้าง %</th><th class="p-2 w-28">จัดแนว</th><th class="p-2 w-32">รวมค่าซ้ำ</th><th class="p-2 w-36"></th></tr></thead><tbody>${table.columns.map((column, index) => reportTableColumnRowHtml(column, table.dataSource, index)).join("")}</tbody></table></div>
        </div>
        <div class="rounded-md border border-teal-100 bg-teal-50 p-3"><h4 class="text-sm font-semibold text-teal-900">Token ของตารางนี้</h4><code class="mt-1 block text-sm text-teal-800">{{table:${escapeHtml(table.id)}}}</code></div>
    </div>`;
}

function reportHeaderGridDesignerHtml(table: ReportTableDefinition): string {
    return `<div class="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><h4 class="font-semibold text-indigo-950">โครงสร้างหัวตารางและการผสานเซลล์</h4><p class="text-xs text-indigo-800">เลือกเซลล์ที่อยู่ติดกันเป็นรูปสี่เหลี่ยม แล้วกดรวมเซลล์ สามารถรวมได้ทั้งแนวนอนและแนวตั้ง</p></div>
            <div class="flex flex-wrap gap-2"><button type="button" data-add-header-row class="${secondaryButtonClass}">+ แถวหัวตาราง</button><button type="button" data-remove-header-row class="${secondaryButtonClass}" ${table.headerRowCount <= 1 ? "disabled" : ""}>− แถวสุดท้าย</button><button type="button" data-merge-header-cells class="${primaryButtonClass} text-sm">รวมเซลล์ที่เลือก</button><button type="button" data-unmerge-header-cells class="${secondaryButtonClass}">แยกเซลล์ที่เลือก</button></div>
        </div>
        <div class="overflow-x-auto"><table class="w-full min-w-[700px] table-fixed border-collapse bg-white"><tbody>${Array.from({ length: table.headerRowCount }, (_, rowIndex) => `<tr>${table.headerCells.filter((cell) => cell.rowIndex === rowIndex).sort((a, b) => a.columnIndex - b.columnIndex).map(reportHeaderCellEditorHtml).join("")}</tr>`).join("")}</tbody></table></div>
        <p class="mt-2 text-xs text-slate-500">เซลล์ที่เลือก: ${selectedHeaderCellIds.size} · จำนวนแถวหัวตาราง: ${table.headerRowCount}</p>
    </div>`;
}

function reportHeaderCellEditorHtml(cell: ReportTableHeaderCell): string {
    return `<td rowspan="${cell.rowSpan}" colspan="${cell.columnSpan}" style="width:auto" class="border-2 ${selectedHeaderCellIds.has(cell.id) ? "border-orange-500 bg-orange-50" : "border-indigo-200 bg-white"} p-2 align-middle">
        <label class="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-500"><input type="checkbox" data-select-header-cell value="${escapeHtml(cell.id)}" ${checked(selectedHeaderCellIds.has(cell.id))} /> เลือก (${cell.rowSpan}×${cell.columnSpan})</label>
        <input data-header-cell-text data-id="${escapeHtml(cell.id)}" maxlength="100" value="${escapeHtml(cell.text)}" class="${compactFieldClass} text-center font-semibold" />
    </td>`;
}

function tableDataSourceOptions(selected: ReportTableDataSource): string {
    const reportType = editingReportType();
    const options: Array<[ReportTableDataSource, string]> =
        reportType === "detailed"
            ? [["detailed.students", "สถิติละเอียด · รายบุคคล"]]
            : [
                  ["daily.school", "ภาพรวมรายวัน · สรุปทั้งโรงเรียน"],
                  ["daily.classes", "ภาพรวมรายวัน · สรุปตามห้อง"],
                  [
                      "daily.statusStudents",
                      "ภาพรวมรายวัน · รายชื่อนักเรียนตามสถานะ",
                  ],
              ];
    return options
        .map(
            ([value, label]) =>
                `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`,
        )
        .join("");
}

function editingReportType(): ReportType {
    return fieldValue(editingTemplateCard ?? document, "reportType") ===
        "detailed"
        ? "detailed"
        : "daily";
}

function reportTableColumnRowHtml(
    column: ReportTableColumn,
    dataSource: ReportTableDataSource,
    index: number,
): string {
    return `<tr data-table-column data-id="${escapeHtml(column.id)}" class="border-b border-slate-100">
        <td class="p-2"><input data-column-field="header" value="${escapeHtml(column.header)}" class="${compactFieldClass}" /></td>
        <td class="p-2"><select data-column-field="valueToken" class="${compactFieldClass}">${tableTokenOptions[dataSource].map((item) => `<option value="${item.token}" ${item.token === column.valueToken ? "selected" : ""}>${item.label} · ${item.token}</option>`).join("")}</select></td>
        <td class="p-2"><input data-column-field="widthPercent" type="number" min="1" max="100" value="${column.widthPercent}" class="${compactFieldClass}" /></td>
        <td class="p-2"><select data-column-field="align" class="${compactFieldClass}"><option value="left" ${column.align === "left" ? "selected" : ""}>ซ้าย</option><option value="center" ${column.align === "center" ? "selected" : ""}>กลาง</option><option value="right" ${column.align === "right" ? "selected" : ""}>ขวา</option></select></td>
        <td class="p-2 text-center"><input data-column-field="mergeRepeatingValues" type="checkbox" ${checked(column.mergeRepeatingValues)} title="รวมเซลล์แนวตั้งเมื่อค่าของแถวที่ติดกันเหมือนกัน" /></td>
        <td class="p-2"><div class="flex justify-end gap-1"><button type="button" data-move-column="up" data-index="${index}" class="rounded bg-slate-100 px-2 py-1" title="เลื่อนขึ้น">↑</button><button type="button" data-move-column="down" data-index="${index}" class="rounded bg-slate-100 px-2 py-1" title="เลื่อนลง">↓</button><button type="button" data-delete-table-column data-index="${index}" class="rounded bg-red-50 px-2 py-1 font-semibold text-red-700">ลบ</button></div></td>
    </tr>`;
}

function selectedReportTable(): ReportTableDefinition | null {
    return (
        editingTemplateConfig?.tables.find(
            (table) => table.id === selectedTemplateTableId,
        ) ?? null
    );
}

function addTemplateTable(): void {
    const config = editingTemplateConfig;
    if (!config) {
        return;
    }
    syncSelectedTableFromDesigner();
    if (config.tables.length >= 10) {
        window.alert("เพิ่มตารางได้ไม่เกิน 10 ตารางต่อเทมเพลต");
        return;
    }
    const id = `table-${Date.now().toString(36)}`;
    const dataSource: ReportTableDataSource =
        fieldValue(editingTemplateCard ?? document, "reportType") === "detailed"
            ? "detailed.students"
            : "daily.classes";
    const token = tableTokenOptions[dataSource][0];
    const columns = [
        reportColumn(
            `col-${Date.now().toString(36)}`,
            token.label,
            token.token,
            100,
        ),
    ];
    config.tables.push({
        id,
        name: `ตาราง ${config.tables.length + 1}`,
        dataSource,
        showHeader: true,
        showTotals: false,
        columns,
        headerRowCount: 1,
        headerCells: defaultReportHeaderCells(columns),
    });
    selectedTemplateTableId = id;
    selectedHeaderCellIds.clear();
    renderTableDesigner();
    renderReportTemplatePreview();
}

function handleTableDesignerInput(event: Event): void {
    const target = event.target as HTMLElement;
    // Checkbox selection is UI-only. Its following `change` event owns the
    // selection state and rerender; previewing here would repair every table
    // before that state has been recorded.
    if (target.matches("[data-select-header-cell]")) {
        return;
    }
    syncSelectedTableFromDesigner();
    renderReportTemplatePreview();
}

function handleTableDesignerChange(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.id === "templateTableSelect") {
        syncSelectedTableFromDesigner();
        selectedTemplateTableId = (target as HTMLSelectElement).value;
        selectedHeaderCellIds.clear();
        renderTableDesigner();
        return;
    }
    syncSelectedTableFromDesigner();
    if (target.matches("[data-select-header-cell]")) {
        const checkbox = target as HTMLInputElement;
        if (checkbox.checked) {
            selectedHeaderCellIds.add(checkbox.value);
        } else {
            selectedHeaderCellIds.delete(checkbox.value);
        }
        renderTableDesigner();
        return;
    }
    if (target.matches('[data-table-field="dataSource"]')) {
        const table = selectedReportTable();
        if (table) {
            const firstToken = tableTokenOptions[table.dataSource][0];
            table.columns.forEach((column) => {
                if (
                    !tableTokenOptions[table.dataSource].some(
                        (option) => option.token === column.valueToken,
                    )
                ) {
                    column.valueToken = firstToken.token;
                }
            });
        }
        renderTableDesigner();
    }
    renderReportTemplatePreview();
}

function handleTableDesignerClick(event: Event): void {
    const target = event.target as HTMLElement;
    const config = editingTemplateConfig;
    const table = selectedReportTable();
    if (!config || !table) {
        return;
    }
    syncSelectedTableFromDesigner();
    if (target.matches("[data-add-header-row]")) {
        addReportTableHeaderRow(table);
        renderTableDesigner();
    } else if (target.matches("[data-remove-header-row]")) {
        removeReportTableHeaderRow(table);
        renderTableDesigner();
    } else if (target.matches("[data-merge-header-cells]")) {
        mergeSelectedReportHeaderCells(table);
        renderTableDesigner();
    } else if (target.matches("[data-unmerge-header-cells]")) {
        unmergeSelectedReportHeaderCells(table);
        renderTableDesigner();
    } else if (target.matches("[data-insert-table-token]")) {
        insertHtmlAtEditorSelection(`<p>{{table:${escapeHtml(table.id)}}}</p>`);
    } else if (target.matches("[data-delete-template-table]")) {
        if (!window.confirm(`ลบตาราง “${table.name}” ใช่หรือไม่`)) {
            return;
        }
        config.tables = config.tables.filter((row) => row.id !== table.id);
        selectedTemplateTableId = config.tables[0]?.id ?? "";
        selectedHeaderCellIds.clear();
        renderTableDesigner();
    } else if (target.matches("[data-add-table-column]")) {
        if (table.columns.length >= 20) {
            window.alert("เพิ่มได้ไม่เกิน 20 คอลัมน์ต่อตาราง");
            return;
        }
        const option = tableTokenOptions[table.dataSource][0];
        table.columns.push(
            reportColumn(
                `col-${Date.now().toString(36)}`,
                option.label,
                option.token,
                10,
            ),
        );
        appendHeaderColumn(table);
        renderTableDesigner();
    } else if (target.matches("[data-delete-table-column]")) {
        const index = Number(target.dataset.index);
        if (table.columns.length <= 1) {
            window.alert("ตารางต้องมีอย่างน้อย 1 คอลัมน์");
            return;
        }
        table.columns.splice(index, 1);
        removeHeaderColumn(table, index);
        renderTableDesigner();
    } else if (target.matches("[data-move-column]")) {
        const index = Number(target.dataset.index);
        const nextIndex =
            target.dataset.moveColumn === "up" ? index - 1 : index + 1;
        if (nextIndex >= 0 && nextIndex < table.columns.length) {
            [table.columns[index], table.columns[nextIndex]] = [
                table.columns[nextIndex],
                table.columns[index],
            ];
            renderTableDesigner();
        }
    }
    renderReportTemplatePreview();
}

function syncSelectedTableFromDesigner(): void {
    const table = selectedReportTable();
    const container = document.getElementById("templateTableDesigner");
    if (!table || !container) {
        return;
    }
    const nameInput = container.querySelector<HTMLInputElement>(
        '[data-table-field="name"]',
    );
    const sourceSelect = container.querySelector<HTMLSelectElement>(
        '[data-table-field="dataSource"]',
    );
    table.name = nameInput?.value.trim() || table.name;
    table.dataSource = (sourceSelect?.value ??
        table.dataSource) as ReportTableDataSource;
    table.showHeader =
        container.querySelector<HTMLInputElement>(
            '[data-table-field="showHeader"]',
        )?.checked ?? false;
    table.showTotals =
        container.querySelector<HTMLInputElement>(
            '[data-table-field="showTotals"]',
        )?.checked ?? false;
    container
        .querySelectorAll<HTMLInputElement>("[data-header-cell-text]")
        .forEach((input) => {
            const cell = table.headerCells.find(
                (row) => row.id === input.dataset.id,
            );
            if (cell) {
                cell.text = input.value.trim();
            }
        });
    table.columns = Array.from(
        container.querySelectorAll<HTMLElement>("[data-table-column]"),
    ).map((row) => ({
        id: row.dataset.id ?? `col-${Date.now().toString(36)}`,
        header:
            row.querySelector<HTMLInputElement>('[data-column-field="header"]')
                ?.value.trim() ?? "",
        valueToken:
            row.querySelector<HTMLSelectElement>(
                '[data-column-field="valueToken"]',
            )?.value ?? tableTokenOptions[table.dataSource][0].token,
        widthPercent: Math.max(
            1,
            Math.min(
                100,
                Number(
                    row.querySelector<HTMLInputElement>(
                        '[data-column-field="widthPercent"]',
                    )?.value ?? 10,
                ),
            ),
        ),
        align: (row.querySelector<HTMLSelectElement>(
            '[data-column-field="align"]',
        )?.value ?? "center") as ReportTableColumn["align"],
        mergeRepeatingValues:
            row.querySelector<HTMLInputElement>(
                '[data-column-field="mergeRepeatingValues"]',
            )?.checked ?? false,
    }));
}

function addReportTableHeaderRow(table: ReportTableDefinition): void {
    if (table.headerRowCount >= 6) {
        window.alert("เพิ่มหัวตารางได้ไม่เกิน 6 แถว");
        return;
    }
    const rowIndex = table.headerRowCount;
    table.headerRowCount += 1;
    table.columns.forEach((column, columnIndex) => {
        table.headerCells.push(
            createReportHeaderCell(
                rowIndex,
                columnIndex,
                column.header,
            ),
        );
    });
    selectedHeaderCellIds.clear();
}

function removeReportTableHeaderRow(table: ReportTableDefinition): void {
    if (table.headerRowCount <= 1) {
        return;
    }
    const removedRow = table.headerRowCount - 1;
    table.headerCells = table.headerCells
        .filter((cell) => cell.rowIndex < removedRow)
        .map((cell) => ({
            ...cell,
            rowSpan:
                cell.rowIndex + cell.rowSpan > removedRow
                    ? Math.max(1, cell.rowSpan - 1)
                    : cell.rowSpan,
        }));
    table.headerRowCount -= 1;
    selectedHeaderCellIds.clear();
    repairReportTableHeaderLayout(table);
}

function mergeSelectedReportHeaderCells(table: ReportTableDefinition): void {
    const cells = table.headerCells.filter((cell) =>
        selectedHeaderCellIds.has(cell.id),
    );
    if (cells.length < 2) {
        window.alert("กรุณาเลือกอย่างน้อย 2 เซลล์เพื่อรวม");
        return;
    }
    const minRow = Math.min(...cells.map((cell) => cell.rowIndex));
    const minColumn = Math.min(...cells.map((cell) => cell.columnIndex));
    const maxRow = Math.max(
        ...cells.map((cell) => cell.rowIndex + cell.rowSpan),
    );
    const maxColumn = Math.max(
        ...cells.map((cell) => cell.columnIndex + cell.columnSpan),
    );
    const selectedArea = cells.reduce(
        (total, cell) => total + cell.rowSpan * cell.columnSpan,
        0,
    );
    const rectangleArea = (maxRow - minRow) * (maxColumn - minColumn);
    if (selectedArea !== rectangleArea) {
        window.alert(
            "เซลล์ที่เลือกต้องอยู่ติดกันและครอบคลุมพื้นที่รูปสี่เหลี่ยมโดยไม่มีช่องว่าง",
        );
        return;
    }
    const selectedSet = new Set(cells.map((cell) => cell.id));
    const firstText =
        cells
            .sort(
                (a, b) =>
                    a.rowIndex - b.rowIndex ||
                    a.columnIndex - b.columnIndex,
            )
            .find((cell) => cell.text)?.text ?? "";
    table.headerCells = table.headerCells.filter(
        (cell) => !selectedSet.has(cell.id),
    );
    const merged = createReportHeaderCell(minRow, minColumn, firstText);
    merged.rowSpan = maxRow - minRow;
    merged.columnSpan = maxColumn - minColumn;
    table.headerCells.push(merged);
    selectedHeaderCellIds.clear();
    selectedHeaderCellIds.add(merged.id);
    repairReportTableHeaderLayout(table);
}

function unmergeSelectedReportHeaderCells(
    table: ReportTableDefinition,
): void {
    const selected = table.headerCells.filter((cell) =>
        selectedHeaderCellIds.has(cell.id),
    );
    if (selected.length === 0) {
        window.alert("กรุณาเลือกเซลล์ที่ต้องการแยก");
        return;
    }
    const selectedSet = new Set(selected.map((cell) => cell.id));
    const replacements: ReportTableHeaderCell[] = [];
    selected.forEach((cell) => {
        for (
            let row = cell.rowIndex;
            row < cell.rowIndex + cell.rowSpan;
            row += 1
        ) {
            for (
                let column = cell.columnIndex;
                column < cell.columnIndex + cell.columnSpan;
                column += 1
            ) {
                const defaultText =
                    row === table.headerRowCount - 1
                        ? (table.columns[column]?.header ?? "")
                        : "";
                replacements.push(
                    createReportHeaderCell(
                        row,
                        column,
                        row === cell.rowIndex && column === cell.columnIndex
                            ? cell.text
                            : defaultText,
                    ),
                );
            }
        }
    });
    table.headerCells = [
        ...table.headerCells.filter((cell) => !selectedSet.has(cell.id)),
        ...replacements,
    ];
    selectedHeaderCellIds.clear();
    repairReportTableHeaderLayout(table);
}

function appendHeaderColumn(table: ReportTableDefinition): void {
    const columnIndex = table.columns.length - 1;
    table.headerCells.push(
        ...Array.from({ length: table.headerRowCount }, (_, rowIndex) =>
            createReportHeaderCell(
                rowIndex,
                columnIndex,
                rowIndex === table.headerRowCount - 1
                    ? table.columns[columnIndex].header
                    : "",
            ),
        ),
    );
    repairReportTableHeaderLayout(table);
}

function removeHeaderColumn(
    table: ReportTableDefinition,
    removedColumnIndex: number,
): void {
    table.headerCells = table.headerCells
        .filter(
            (cell) =>
                !(
                    cell.columnIndex === removedColumnIndex &&
                    cell.columnSpan === 1
                ),
        )
        .map((cell) => {
            const coversRemoved =
                cell.columnIndex <= removedColumnIndex &&
                cell.columnIndex + cell.columnSpan > removedColumnIndex;
            return {
                ...cell,
                columnIndex:
                    cell.columnIndex > removedColumnIndex
                        ? cell.columnIndex - 1
                        : cell.columnIndex,
                columnSpan:
                    coversRemoved && cell.columnSpan > 1
                        ? cell.columnSpan - 1
                        : cell.columnSpan,
            };
        });
    selectedHeaderCellIds.clear();
    repairReportTableHeaderLayout(table);
}

function repairReportTableHeaderLayout(table: ReportTableDefinition): void {
    table.headerRowCount = Math.max(
        1,
        Math.min(6, Math.trunc(Number(table.headerRowCount) || 1)),
    );
    const rowCount = table.headerRowCount;
    const columnCount = table.columns.length;
    const occupied = Array.from({ length: rowCount }, () =>
        Array.from({ length: columnCount }, () => false),
    );
    const ids = new Set<string>();
    const repaired: ReportTableHeaderCell[] = [];
    [...table.headerCells]
        .sort(
            (a, b) =>
                a.rowIndex - b.rowIndex || a.columnIndex - b.columnIndex,
        )
        .forEach((source) => {
            const rowIndex = Math.max(0, Math.trunc(Number(source.rowIndex)));
            const columnIndex = Math.max(
                0,
                Math.trunc(Number(source.columnIndex)),
            );
            if (rowIndex >= rowCount || columnIndex >= columnCount) {
                return;
            }
            const rowSpan = Math.max(
                1,
                Math.min(
                    Math.trunc(Number(source.rowSpan) || 1),
                    rowCount - rowIndex,
                ),
            );
            const columnSpan = Math.max(
                1,
                Math.min(
                    Math.trunc(Number(source.columnSpan) || 1),
                    columnCount - columnIndex,
                ),
            );
            let overlaps = false;
            for (let row = rowIndex; row < rowIndex + rowSpan; row += 1) {
                for (
                    let column = columnIndex;
                    column < columnIndex + columnSpan;
                    column += 1
                ) {
                    overlaps ||= occupied[row][column];
                }
            }
            if (overlaps) {
                return;
            }
            let id = source.id || createReportHeaderCellId(rowIndex, columnIndex);
            if (ids.has(id)) {
                id = createReportHeaderCellId(rowIndex, columnIndex);
            }
            ids.add(id);
            for (let row = rowIndex; row < rowIndex + rowSpan; row += 1) {
                for (
                    let column = columnIndex;
                    column < columnIndex + columnSpan;
                    column += 1
                ) {
                    occupied[row][column] = true;
                }
            }
            repaired.push({
                id,
                text: String(source.text ?? "").slice(0, 100),
                rowIndex,
                columnIndex,
                rowSpan,
                columnSpan,
            });
        });
    for (let row = 0; row < rowCount; row += 1) {
        for (let column = 0; column < columnCount; column += 1) {
            if (!occupied[row][column]) {
                const cell = createReportHeaderCell(
                    row,
                    column,
                    row === rowCount - 1
                        ? (table.columns[column]?.header ?? "")
                        : "",
                );
                repaired.push(cell);
                occupied[row][column] = true;
            }
        }
    }
    table.headerCells = repaired.sort(
        (a, b) =>
            a.rowIndex - b.rowIndex || a.columnIndex - b.columnIndex,
    );
    // Preview renders and repairs every table. Only the active table is
    // allowed to prune the designer's current cell selection.
    if (table.id === selectedTemplateTableId) {
        selectedHeaderCellIds = new Set(
            [...selectedHeaderCellIds].filter((id) =>
                table.headerCells.some((cell) => cell.id === id),
            ),
        );
    }
}

function createReportHeaderCell(
    rowIndex: number,
    columnIndex: number,
    text: string,
): ReportTableHeaderCell {
    return {
        id: createReportHeaderCellId(rowIndex, columnIndex),
        text,
        rowIndex,
        columnIndex,
        rowSpan: 1,
        columnSpan: 1,
    };
}

function createReportHeaderCellId(
    rowIndex: number,
    columnIndex: number,
): string {
    return `head-${rowIndex}-${columnIndex}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function renderReportTemplatePreview(): void {
    const preview = document.getElementById("reportTemplatePreview");
    const config = editingTemplateConfig;
    if (!preview || !config) {
        return;
    }
    const landscape = config.orientation === "landscape";
    const maxWidth = landscape ? 960 : 700;
    const aspectRatio = landscape ? "297 / 210" : "210 / 297";
    const paddingPx = Math.round(config.pageMarginMm * 2.7);
    preview.innerHTML = `<div class="report-template-preview" style="--report-font-family:${escapeHtml(config.fontFamily)};position:relative;width:min(100%,${maxWidth}px);min-height:${landscape ? 610 : 920}px;aspect-ratio:${aspectRatio};margin:0 auto;padding:${paddingPx}px;background:#fff;color:#0f172a;box-shadow:0 12px 35px rgba(15,23,42,.18);font-family:${escapeHtml(config.fontFamily)};font-size:${config.fontSizePt}pt;line-height:1.45;display:flex;flex-direction:column;overflow:hidden">
        ${config.showDraftWatermark ? '<div style="position:absolute;inset:42% 0 auto;transform:rotate(-28deg);text-align:center;font-size:48px;font-weight:700;color:rgba(148,163,184,.18);pointer-events:none">ฉบับร่าง · PREVIEW</div>' : ""}
        <header class="report-template-rich-content" style="position:relative;border:1px dashed #cbd5e1;padding:8px;min-height:55px">${previewSectionLabel("HEADER")}${renderPreviewRegion(config.sections.headerHtml)}</header>
        <main class="report-template-rich-content" style="position:relative;flex:1;border-left:1px dashed #e2e8f0;border-right:1px dashed #e2e8f0;padding:10px 8px">${previewSectionLabel("CONTENT")}${renderPreviewRegion(config.sections.contentHtml)}</main>
        <footer class="report-template-rich-content" style="position:relative;border:1px dashed #cbd5e1;padding:8px;min-height:55px">${previewSectionLabel("FOOTER")}${renderPreviewRegion(config.sections.footerHtml)}</footer>
    </div>`;
}

function previewSectionLabel(label: string): string {
    return `<span style="position:absolute;top:2px;right:4px;color:#94a3b8;font:600 8px Arial,sans-serif;letter-spacing:.08em">${label}</span>`;
}

function renderPreviewRegion(sourceHtml: string): string {
    const config = editingTemplateConfig;
    if (!config) {
        return "";
    }
    let html = sanitizeTemplateHtml(sourceHtml);
    config.tables.forEach((table) => {
        const tokenPattern = escapeRegExp(`{{table:${table.id}}}`);
        const tableHtml = sampleReportTableHtml(table);
        html = html.replace(
            new RegExp(`<p[^>]*>\\s*${tokenPattern}\\s*</p>`, "gi"),
            tableHtml,
        );
        html = html.replace(new RegExp(tokenPattern, "g"), tableHtml);
    });
    const applicableTokens = globalTemplateTokens.filter(
        (item) =>
            !item.reportTypes ||
            item.reportTypes.includes(currentEditingReportType()),
    );
    const samples = new Map(
        applicableTokens.map((item) => [item.token, item.sample]),
    );
    const currentYear = state.config.currentYear;
    samples.set(
        "school.name",
        state.config.schoolName || "ยังไม่ได้ตั้งชื่อโรงเรียน",
    );
    samples.set("report.title", config.title);
    samples.set("report.subtitle", config.subtitle);
    samples.set("academic.year", String(currentYear?.y ?? "-"));
    samples.set("academic.term", String(currentYear?.t ?? "-"));
    samples.set(
        "generatedAt",
        new Intl.DateTimeFormat("th-TH", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Bangkok",
        }).format(new Date()),
    );
    applicableTokens.forEach((item) => {
        html = html.replace(
            new RegExp(escapeRegExp(`{{${item.token}}}`), "g"),
            escapeHtml(samples.get(item.token) ?? item.sample),
        );
    });
    return html.replace(
        /{{\s*([^{}]+)\s*}}/g,
        '<span style="border-radius:3px;background:#fef3c7;color:#92400e;padding:1px 3px;font:600 9px monospace">{{$1}}</span>',
    );
}

function sampleReportTableHtml(table: ReportTableDefinition): string {
    const options = tableTokenOptions[table.dataSource];
    const base = Object.fromEntries(
        options.map((item) => [item.token, item.sample]),
    ) as Record<string, string>;
    const sampleRowIndexes = table.dataSource === "daily.school" ? [0] : [0, 1, 2];
    const rows: Array<Record<string, string>> = sampleRowIndexes.map(
        (index) => ({
            ...base,
            "class.name": ["ม.1/1", "ม.1/1", "ม.2/1"][index],
            "student.number": String(index + 1),
            "student.code": String(10001 + index),
            "student.fullName": [
                "เด็กชายสมชาย ใจดี",
                "เด็กหญิงสมหญิง ตั้งใจ",
                "เด็กชายขยัน เรียนดี",
            ][index],
        }),
    );
    const head = table.showHeader ? sampleReportHeaderHtml(table) : "";
    const body = rows
        .map(
            (row, rowIndex) =>
                `<tr>${table.columns
                    .map((column) => {
                        const value =
                            row[column.valueToken] ??
                            `{{${column.valueToken}}}`;
                        if (
                            column.mergeRepeatingValues &&
                            rowIndex > 0 &&
                            rows[rowIndex - 1][column.valueToken] === value
                        ) {
                            return "";
                        }
                        let rowSpan = 1;
                        if (column.mergeRepeatingValues) {
                            while (
                                rowIndex + rowSpan < rows.length &&
                                rows[rowIndex + rowSpan][column.valueToken] ===
                                    value
                            ) {
                                rowSpan += 1;
                            }
                        }
                        return `<td rowspan="${rowSpan}" style="border:1px solid #64748b;padding:4px;text-align:${column.align};vertical-align:middle">${escapeHtml(value)}</td>`;
                    })
                    .join("")}</tr>`,
        )
        .join("");
    const total = table.showTotals
        ? `<tfoot><tr>${table.columns.map((column, index) => `<td style="border:1px solid #64748b;background:#f8fafc;padding:4px;text-align:${column.align};font-weight:700">${index === 0 ? "รวม" : sampleTotalValue(column.valueToken)}</td>`).join("")}</tr></tfoot>`
        : "";
    return `<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:.88em;table-layout:fixed">${head}<tbody>${body}</tbody>${total}</table>`;
}

function sampleReportHeaderHtml(table: ReportTableDefinition): string {
    repairReportTableHeaderLayout(table);
    return `<thead>${Array.from(
        { length: table.headerRowCount },
        (_, rowIndex) =>
            `<tr>${table.headerCells
                .filter((cell) => cell.rowIndex === rowIndex)
                .sort((a, b) => a.columnIndex - b.columnIndex)
                .map((cell) => {
                    const width = table.columns
                        .slice(
                            cell.columnIndex,
                            cell.columnIndex + cell.columnSpan,
                        )
                        .reduce(
                            (total, column) =>
                                total + column.widthPercent,
                            0,
                        );
                    return `<th rowspan="${cell.rowSpan}" colspan="${cell.columnSpan}" style="border:1px solid #64748b;background:#f1f5f9;padding:4px;text-align:center;vertical-align:middle;width:${width}%">${escapeHtml(cell.text)}</th>`;
                })
                .join("")}</tr>`,
    ).join("")}</thead>`;
}

function sampleTotalValue(token: string): string {
    if (token.includes("percent")) {
        return "91.36%";
    }
    if (token === "students.total") {
        return "81";
    }
    if (/\.(total|count)$/.test(token)) {
        return "3";
    }
    return "";
}

function sanitizeTemplateHtml(html: string): string {
    const parser = new DOMParser();
    const documentFragment = parser.parseFromString(
        `<body>${html}</body>`,
        "text/html",
    );
    const allowedTags = new Set([
        "P",
        "DIV",
        "SPAN",
        "BR",
        "H1",
        "H2",
        "H3",
        "H4",
        "STRONG",
        "B",
        "EM",
        "I",
        "U",
        "S",
        "UL",
        "OL",
        "LI",
        "BLOCKQUOTE",
        "TABLE",
        "THEAD",
        "TBODY",
        "TFOOT",
        "TR",
        "TH",
        "TD",
        "A",
        "FONT",
    ]);
    const allowedStyles = new Set([
        "text-align",
        "font-weight",
        "font-style",
        "text-decoration",
        "color",
        "background-color",
        "font-size",
        "font-family",
        "margin-left",
    ]);
    Array.from(documentFragment.body.querySelectorAll<HTMLElement>("*"))
        .reverse()
        .forEach((element) => {
            if (!allowedTags.has(element.tagName)) {
                element.replaceWith(...Array.from(element.childNodes));
                return;
            }
            Array.from(element.attributes).forEach((attribute) => {
                if (
                    attribute.name !== "style" &&
                    attribute.name !== "colspan" &&
                    attribute.name !== "rowspan" &&
                    attribute.name !== "href" &&
                    attribute.name !== "size" &&
                    attribute.name !== "color"
                ) {
                    element.removeAttribute(attribute.name);
                }
            });
            if (element.hasAttribute("href")) {
                const href = element.getAttribute("href") ?? "";
                if (!/^(https?:|mailto:)/i.test(href)) {
                    element.removeAttribute("href");
                } else {
                    element.setAttribute("rel", "noopener noreferrer");
                    element.setAttribute("target", "_blank");
                }
            }
            if (
                element.hasAttribute("size") &&
                !/^[1-7]$/.test(element.getAttribute("size") ?? "")
            ) {
                element.removeAttribute("size");
            }
            if (
                element.hasAttribute("color") &&
                !/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(
                    element.getAttribute("color") ?? "",
                )
            ) {
                element.removeAttribute("color");
            }
            const safeStyles: string[] = [];
            Array.from(element.style).forEach((property) => {
                if (!allowedStyles.has(property)) {
                    return;
                }
                const value = element.style.getPropertyValue(property);
                if (!/url\s*\(|expression\s*\(|javascript\s*:/i.test(value)) {
                    safeStyles.push(`${property}:${value}`);
                }
            });
            if (safeStyles.length > 0) {
                element.setAttribute("style", safeStyles.join(";"));
            } else {
                element.removeAttribute("style");
            }
        });
    return documentFragment.body.innerHTML;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function bindReportTemplates(): void {
    document
        .querySelectorAll<HTMLButtonElement>("[data-add-report-template]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                const reportType: ReportType =
                    button.dataset.addReportTemplate === "detailed"
                        ? "detailed"
                        : "daily";
                document.getElementById("emptyReportTemplateNotice")?.remove();
                document
                    .getElementById("reportTemplateRows")
                    ?.insertAdjacentHTML(
                        "beforeend",
                        reportTemplateCardHtml(
                            defaultReportTemplate(reportType),
                        ),
                    );
            });
        });
    const rows = document.getElementById("reportTemplateRows");
    rows?.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        if (target.matches("[data-open-template-editor]")) {
            const card = target.closest<HTMLElement>(
                "[data-report-template]",
            );
            if (card) {
                openReportTemplateEditor(card);
            }
            return;
        }
        if (target.matches("[data-delete-report-template]")) {
            target.closest<HTMLElement>("[data-report-template]")?.remove();
        }
    });
    rows?.addEventListener("change", (event) => {
        const target = event.target as HTMLInputElement | HTMLSelectElement;
        if (
            target.dataset.field !== "isDefault" &&
            target.dataset.field !== "reportType"
        ) {
            return;
        }
        const card = target.closest<HTMLElement>("[data-report-template]");
        if (!card || fieldValue(card, "isDefault") !== "true") {
            return;
        }
        const reportType = fieldValue(card, "reportType") as ReportType;
        document
            .querySelectorAll<HTMLElement>("[data-report-template]")
            .forEach((otherCard) => {
                if (
                    otherCard !== card &&
                    fieldValue(otherCard, "reportType") === reportType
                ) {
                    const otherDefault =
                        otherCard.querySelector<HTMLSelectElement>(
                            '[data-field="isDefault"]',
                        );
                    if (otherDefault) {
                        otherDefault.value = "false";
                    }
                }
            });
    });
    document
        .getElementById("saveReportTemplatesButton")
        ?.addEventListener("click", () => {
            const button = document.getElementById(
                "saveReportTemplatesButton",
            ) as HTMLButtonElement;
            void saveReportTemplates(button);
        });
    document
        .getElementById("loadSourceTemplatesButton")
        ?.addEventListener("click", () => {
            const button = document.getElementById(
                "loadSourceTemplatesButton",
            ) as HTMLButtonElement;
            void loadSourceReportTemplates(button);
        });
    document
        .getElementById("sourceTemplateList")
        ?.addEventListener("click", (event) => {
            const target = event.target as HTMLElement;
            if (!target.matches("#copyReportTemplatesButton")) {
                return;
            }
            void copySelectedReportTemplates(target as HTMLButtonElement);
        });
}

async function loadSourceReportTemplates(
    button: HTMLButtonElement,
): Promise<void> {
    const sourceSelect = document.getElementById(
        "templateSourceYear",
    ) as HTMLSelectElement;
    selectedTemplateSourceYearKey = sourceSelect.value;
    if (!selectedTemplateSourceYearKey) {
        showNotice(
            "adminNotice",
            "กรุณาเลือกปีการศึกษาต้นทาง",
            "error",
        );
        return;
    }
    setBusy(button, true, "กำลังโหลด...");
    try {
        sourceReportTemplates = await googleScriptRun(
            "getReportTemplatesForAcademicYear",
            token,
            selectedTemplateSourceYearKey,
        );
        const list = document.getElementById("sourceTemplateList");
        if (list) {
            list.innerHTML = sourceTemplateListHtml();
        }
    } catch (error) {
        showNotice("adminNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

async function copySelectedReportTemplates(
    button: HTMLButtonElement,
): Promise<void> {
    const templateIds = Array.from(
        document.querySelectorAll<HTMLInputElement>(
            "[data-source-template-id]:checked",
        ),
    ).map((input) => input.value);
    if (templateIds.length === 0) {
        showNotice(
            "adminNotice",
            "กรุณาเลือกเทมเพลตที่ต้องการคัดลอก",
            "error",
        );
        return;
    }
    setBusy(button, true, "กำลังคัดลอก...");
    try {
        state.reportTemplates = await googleScriptRun(
            "copyReportTemplates",
            token,
            {
                sourceAcademicYearKey: selectedTemplateSourceYearKey,
                templateIds,
            },
        );
        sourceReportTemplates = [];
        selectedTemplateSourceYearKey = "";
        render();
        showNotice(
            "adminNotice",
            `คัดลอกเทมเพลต ${templateIds.length} รายการมายังปีการศึกษาปัจจุบันแล้ว`,
            "ok",
        );
    } catch (error) {
        showNotice("adminNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
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
        state.students = await googleScriptRun(
            "saveStudents",
            token,
            selectedClassId,
            selectedClassRows,
        );
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

async function saveReportTemplates(button: HTMLButtonElement): Promise<void> {
    setBusy(button, true, "กำลังบันทึก...");
    try {
        state.reportTemplates = await googleScriptRun(
            "saveReportTemplates",
            token,
            readReportTemplateCards(),
        );
        render();
        showNotice(
            "adminNotice",
            "บันทึกเทมเพลตของปีการศึกษาปัจจุบันเรียบร้อย",
            "ok",
        );
    } catch (error) {
        showNotice("adminNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

function readReportTemplateCards(): ReportTemplate[] {
    return Array.from(
        document.querySelectorAll<HTMLElement>("[data-report-template]"),
    ).map((card) => {
        const reportType = fieldValue(card, "reportType") as ReportType;
        const storedConfig = parseReportTemplateConfig(
            fieldValue(card, "configJson"),
            reportType,
        );
        return {
            id: card.dataset.id ?? "",
            name: fieldValue(card, "name"),
            reportType,
            isDefault: fieldValue(card, "isDefault") === "true",
            enabled: fieldValue(card, "enabled") === "true",
            config: storedConfig,
            updatedAt: "",
        };
    });
}

function parseReportTemplateConfig(
    json: string,
    reportType: ReportType,
): ReportTemplateConfig {
    const fallback = defaultReportTemplateConfig(reportType);
    try {
        const parsed = JSON.parse(json) as Partial<ReportTemplateConfig>;
        return {
            ...fallback,
            ...parsed,
            sections: {
                ...fallback.sections,
                ...(parsed.sections ?? {}),
            },
            tables: (parsed.tables ?? fallback.tables).map((table) =>
                normalizeClientReportTable(table, reportType),
            ),
        };
    } catch {
        return fallback;
    }
}

function normalizeClientReportTable(
    table: ReportTableDefinition,
    reportType: ReportType,
): ReportTableDefinition {
    const compatible =
        reportType === "daily"
            ? table.dataSource === "daily.school" ||
              table.dataSource === "daily.classes" ||
              table.dataSource === "daily.statusStudents"
            : table.dataSource === "detailed.students";
    const sourceTable = compatible
        ? table
        : {
              ...defaultReportTable(reportType),
              id: table.id,
              name: table.name,
              showHeader: table.showHeader,
              showTotals: table.showTotals,
          };
    const columns = sourceTable.columns.map((column) => ({
        ...column,
        mergeRepeatingValues: Boolean(column.mergeRepeatingValues),
    }));
    const normalized: ReportTableDefinition = {
        ...sourceTable,
        columns,
        headerRowCount: Math.max(
            1,
            Math.min(6, Number(sourceTable.headerRowCount) || 1),
        ),
        headerCells:
            Array.isArray(sourceTable.headerCells) &&
            sourceTable.headerCells.length > 0
                ? sourceTable.headerCells.map((cell) => ({ ...cell }))
                : defaultReportHeaderCells(columns),
    };
    repairReportTableHeaderLayout(normalized);
    return normalized;
}

function fieldValue(container: ParentNode, field: string): string {
    const input = container.querySelector<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(
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
