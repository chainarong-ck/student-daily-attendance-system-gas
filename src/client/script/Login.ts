import { googleScriptRun } from "../../shared/gas-client";
import type { AuthRole } from "../../shared/types";
import {
    ADMIN_TOKEN_KEY,
    APP_TOKEN_KEY,
    messageText,
    noticeHtml,
    setBusy,
    shellHtml,
    showNotice,
    webAppUrl,
} from "./client-utils";

function currentRole(): AuthRole {
    return new URLSearchParams(window.location.search).get("role") === "admin"
        ? "admin"
        : "app";
}

async function main(): Promise<void> {
    const role = currentRole();
    const title = role === "admin" ? "เข้าสู่ระบบ Admin" : "เข้าสู่ระบบครู";
    document.body.innerHTML = shellHtml(
        title,
        `
        <div class="mx-auto max-w-md rounded-lg bg-white p-6 shadow-sm">
            ${noticeHtml("loginNotice")}
            <div class="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
                <a class="rounded-md px-3 py-2 text-center ${role === "app" ? "bg-white text-orange-700 shadow-sm" : "text-slate-600"}" href="${webAppUrl("Login")}">ครู</a>
                <a class="rounded-md px-3 py-2 text-center ${role === "admin" ? "bg-white text-orange-700 shadow-sm" : "text-slate-600"}" href="${webAppUrl("Login")}&role=admin">Admin</a>
            </div>
            <form id="loginForm" class="grid gap-4">
                <div>
                    <label class="mb-1 block text-sm font-medium">รหัสผ่าน</label>
                    <input name="password" type="password" required autofocus class="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-orange-500 focus:outline-none" />
                </div>
                <button id="loginButton" type="submit" class="rounded-md bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">เข้าสู่ระบบ</button>
            </form>
        </div>`,
    );

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
        window.location.href = webAppUrl(role === "admin" ? "Admin" : "Index");
    } catch (error) {
        showNotice("loginNotice", messageText(error), "error");
    } finally {
        setBusy(button, false);
    }
}

void main().catch((error) => {
    document.body.textContent = messageText(error);
});
