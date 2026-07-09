import { googleScriptRun } from "../../shared/gas-client";
import {
    bindShellActions,
    messageText,
    navigateTo,
    noticeHtml,
    setBusy,
    shellHtml,
    showNotice,
} from "./client-utils";

async function main(): Promise<void> {
    document.body.innerHTML = shellHtml(
        "ตั้งค่าระบบครั้งแรก",
        `
        <div class="mx-auto max-w-3xl rounded-lg bg-white p-6 shadow-sm">
            ${noticeHtml("setupNotice")}
            <form id="setupForm" class="grid gap-5">
                <div>
                    <label class="mb-1 block text-sm font-medium">ชื่อโรงเรียน</label>
                    <input name="schoolName" maxlength="100" required class="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-orange-500 focus:outline-none" />
                </div>
                <div class="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label class="mb-1 block text-sm font-medium">รหัสผ่านครู</label>
                        <input name="appPassword" type="password" required class="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-orange-500 focus:outline-none" />
                    </div>
                    <div>
                        <label class="mb-1 block text-sm font-medium">รหัสผ่าน Admin</label>
                        <input name="adminPassword" type="password" required class="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-orange-500 focus:outline-none" />
                    </div>
                </div>
                <div class="rounded-lg border border-slate-200 p-4">
                    <h2 class="mb-3 font-semibold">ปีการศึกษาเริ่มต้น</h2>
                    <p class="mb-4 text-sm text-slate-600">ใส่ URL หรือ ID ของ Google Sheet ที่ Admin สร้างไว้ ระบบจะสร้างชีต Classes, Students และ Attendance ให้ถ้ายังไม่มี</p>
                    <div class="grid gap-4 sm:grid-cols-3">
                        <div>
                            <label class="mb-1 block text-sm font-medium">ปีการศึกษา</label>
                            <input name="year" type="number" required class="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-orange-500 focus:outline-none" />
                        </div>
                        <div>
                            <label class="mb-1 block text-sm font-medium">เทอม</label>
                            <input name="term" type="number" min="1" max="3" required class="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-orange-500 focus:outline-none" />
                        </div>
                        <div class="sm:col-span-3">
                            <label class="mb-1 block text-sm font-medium">Google Sheet URL หรือ ID</label>
                            <input name="sheetId" required class="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-orange-500 focus:outline-none" />
                        </div>
                    </div>
                </div>
                <button id="submitButton" type="submit" class="rounded-md bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">บันทึกและเริ่มใช้งาน</button>
            </form>
        </div>`,
        {
            activePage: "Setup",
            showAdminLink: false,
            showIndexLink: false,
            showLoginLink: false,
        },
    );
    bindShellActions();

    const state = await googleScriptRun("getPublicSystemState");
    if (state.initialized) {
        navigateTo("Login");
        return;
    }

    const form = document.getElementById("setupForm") as HTMLFormElement;
    const button = document.getElementById("submitButton") as HTMLButtonElement;
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitSetup(form, button);
    });
}

async function submitSetup(
    form: HTMLFormElement,
    button: HTMLButtonElement,
): Promise<void> {
    const data = new FormData(form);
    setBusy(button, true, "กำลังตั้งค่าระบบ...");
    try {
        await googleScriptRun("setupSystem", {
            schoolName: String(data.get("schoolName") ?? ""),
            appPassword: String(data.get("appPassword") ?? ""),
            adminPassword: String(data.get("adminPassword") ?? ""),
            firstAcademicYear: {
                id: String(data.get("sheetId") ?? ""),
                y: Number(data.get("year")),
                t: Number(data.get("term")),
            },
        });
        showNotice("setupNotice", "ตั้งค่าระบบสำเร็จ กำลังไปหน้า Login", "ok");
        navigateTo("Login");
    } catch (error) {
        showNotice("setupNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

void main().catch((error) => {
    document.body.textContent = messageText(error);
});
