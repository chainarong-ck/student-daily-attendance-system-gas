import { googleScriptRun } from "../../shared/gas-client";
import type { AuthRole } from "../../shared/types";
import {
    ADMIN_TOKEN_KEY,
    APP_TOKEN_KEY,
    bindShellActions,
    initialRole,
    messageText,
    navigateTo,
    noticeHtml,
    setBusy,
    shellHtml,
    showNotice,
} from "./client-utils";

let selectedRole: AuthRole = initialRole();

async function main(): Promise<void> {
    renderLogin();
}

function renderLogin(): void {
    const role = selectedRole;
    const title = role === "admin" ? "เข้าสู่ระบบ Admin" : "เข้าสู่ระบบครู";
    document.body.innerHTML = shellHtml(
        title,
        `
        <div class="mx-auto max-w-md overflow-hidden rounded-lg border border-white/70 bg-white/95 shadow-xl shadow-slate-200/70">
            <div class="p-6">
            ${noticeHtml("loginNotice")}
            <div class="mb-5">
                <p class="text-sm font-semibold text-teal-700">เลือกบทบาทเพื่อเข้าใช้งาน</p>
                <p class="mt-1 text-sm text-slate-500">ระบบเช็คชื่อนักเรียนรายวัน</p>
            </div>
            <div class="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm font-semibold">
                <button type="button" data-login-role="app" class="rounded-md px-3 py-2 text-center transition ${role === "app" ? "bg-white text-orange-700 shadow-sm" : "text-slate-600 hover:bg-white hover:text-teal-800"}">ครู</button>
                <button type="button" data-login-role="admin" class="rounded-md px-3 py-2 text-center transition ${role === "admin" ? "bg-white text-orange-700 shadow-sm" : "text-slate-600 hover:bg-white hover:text-teal-800"}">Admin</button>
            </div>
            <form id="loginForm" class="grid gap-4">
                <div>
                    <label class="mb-1 block text-sm font-medium">รหัสผ่าน</label>
                    <input name="password" type="password" required autofocus class="w-full rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
                </div>
                <button id="loginButton" type="submit" class="rounded-md bg-orange-600 px-4 py-2.5 font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">เข้าสู่ระบบ</button>
            </form>
            </div>
        </div>`,
        {
            activePage: "Login",
            showLoginLink: false,
        },
    );
    bindShellActions();

    document.querySelectorAll<HTMLButtonElement>("[data-login-role]").forEach((button) => {
        button.addEventListener("click", () => {
            selectedRole = button.dataset.loginRole === "admin" ? "admin" : "app";
            renderLogin();
        });
    });
    const form = document.getElementById("loginForm") as HTMLFormElement;
    const button = document.getElementById("loginButton") as HTMLButtonElement;
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void login(form, button, role);
    });
}

async function login(
    form: HTMLFormElement,
    button: HTMLButtonElement,
    role: AuthRole,
): Promise<void> {
    const password = String(new FormData(form).get("password") ?? "");
    setBusy(button, true, "กำลังเข้าสู่ระบบ...");
    try {
        const result =
            role === "admin"
                ? await googleScriptRun("loginAdmin", password)
                : await googleScriptRun("loginApp", password);
        localStorage.setItem(role === "admin" ? ADMIN_TOKEN_KEY : APP_TOKEN_KEY, result.token);
        showNotice("loginNotice", "เข้าสู่ระบบสำเร็จ", "ok");
        navigateTo(role === "admin" ? "Admin" : "Index");
    } catch (error) {
        showNotice("loginNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

void main().catch((error) => {
    document.body.textContent = messageText(error);
});
