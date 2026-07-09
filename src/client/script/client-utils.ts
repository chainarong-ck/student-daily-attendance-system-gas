import type { AppPages, AuthRole } from "../../shared/types";

export const APP_TOKEN_KEY = "student_attendance_app_token";
export const ADMIN_TOKEN_KEY = "student_attendance_admin_token";

type AppContext = {
    page: AppPages;
    role: AuthRole;
    webAppUrl: string;
};

type ShellOptions = {
    activePage: AppPages;
    logoutRole?: AuthRole;
    showAdminLink?: boolean;
    showIndexLink?: boolean;
    showLoginLink?: boolean;
};

declare global {
    interface Window {
        __APP_CONTEXT__?: AppContext;
        __WEB_APP_URL__?: string;
    }
}

export function webAppUrl(page?: string): string {
    const base =
        window.__APP_CONTEXT__?.webAppUrl ||
        window.__WEB_APP_URL__ ||
        window.location.href.split("?")[0];
    return page ? `${base}?page=${encodeURIComponent(page)}` : base;
}

export function navigateTo(page: string, params?: Record<string, string>): void {
    const url = new URL(webAppUrl(page));
    Object.entries(params ?? {}).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });
    window.open(url.toString(), "_top");
}

export function initialRole(): AuthRole {
    return window.__APP_CONTEXT__?.role ?? "app";
}

export function showLoginRequired(role: AuthRole, message?: string): void {
    const loginParams = role === "admin" ? { role: "admin" } : undefined;
    document.body.innerHTML = shellHtml(
        "ยังไม่ได้เข้าสู่ระบบ",
        `
        <section class="mx-auto max-w-xl rounded-lg bg-white p-6 text-center shadow-sm">
            <h2 class="text-xl font-semibold text-slate-900">กรุณาเข้าสู่ระบบก่อนใช้งาน</h2>
            <p class="mt-2 text-sm text-slate-600">${escapeHtml(message ?? "หน้านี้ต้องเข้าสู่ระบบก่อน")}</p>
            <p class="mt-2 text-sm text-slate-500">ระบบกำลังพาไปหน้า Login หากไม่เปลี่ยนหน้าให้กดปุ่มด้านล่าง</p>
            <button id="goLoginButton" type="button" class="mt-5 rounded-md bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700">ไปหน้า Login</button>
        </section>`,
        {
            activePage: "Login",
            showAdminLink: false,
            showIndexLink: false,
            showLoginLink: false,
        },
    );
    bindShellActions();
    document.getElementById("goLoginButton")?.addEventListener("click", () => {
        navigateTo("Login", loginParams);
    });
    window.setTimeout(() => {
        navigateTo("Login", loginParams);
    }, 800);
}

export function bindShellActions(): void {
    document.querySelectorAll<HTMLButtonElement>("[data-nav-page]").forEach((button) => {
        button.addEventListener("click", () => {
            const page = button.dataset.navPage;
            if (page) {
                navigateTo(page);
            }
        });
    });
    document
        .querySelectorAll<HTMLButtonElement>("[data-logout-role]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                const role = button.dataset.logoutRole === "admin" ? "admin" : "app";
                localStorage.removeItem(APP_TOKEN_KEY);
                localStorage.removeItem(ADMIN_TOKEN_KEY);
                navigateTo("Login", role === "admin" ? { role: "admin" } : undefined);
            });
        });
    document.querySelectorAll<HTMLButtonElement>("[data-close-notice]").forEach((button) => {
        button.addEventListener("click", () => {
            button.closest("[data-notice]")?.classList.add("hidden");
        });
    });
}

export function todayText(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const date = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${date}`;
}

export function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function messageText(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error || "เกิดข้อผิดพลาด");
}

export function setBusy(button: HTMLButtonElement, busy: boolean, label?: string): void {
    if (busy) {
        button.dataset.label = button.textContent ?? "";
        button.disabled = true;
        button.textContent = label ?? "กำลังทำงาน...";
        return;
    }
    button.disabled = false;
    button.textContent = button.dataset.label ?? button.textContent;
}

export function footerHtml(): string {
    return `<footer class="mt-10 border-t border-slate-200 py-5 text-center text-sm text-slate-500">ระบบเช็คชื่อนักเรียนรายวัน | พัฒนาโดย นายชัยณรงค์ คงพล | GitHub: <a href="https://github.com/chainarong-ck" target="_blank" rel="noopener noreferrer" class="font-medium text-orange-600">Chainarong-CK</a></footer>`;
}

export function shellHtml(title: string, body: string, options: ShellOptions): string {
    return `
        <main class="min-h-screen bg-slate-100 text-slate-900">
            <section class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                <header class="mb-6 flex flex-col gap-3 rounded-lg bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p class="text-sm font-medium text-orange-600">Student Daily Attendance</p>
                        <h1 class="text-2xl font-bold">${escapeHtml(title)}</h1>
                    </div>
                    <nav class="flex flex-wrap gap-2 text-sm">
                        ${navButton("Index", "หน้าเช็คชื่อ", options)}
                        ${navButton("Admin", "Admin", options)}
                        ${navButton("Login", "Login", options)}
                        ${logoutButton(options)}
                    </nav>
                </header>
                ${body}
                ${footerHtml()}
            </section>
        </main>`;
}

function navButton(page: AppPages, label: string, options: ShellOptions): string {
    if (page === "Index" && options.showIndexLink === false) {
        return "";
    }
    if (page === "Admin" && options.showAdminLink === false) {
        return "";
    }
    if (page === "Login" && options.showLoginLink === false) {
        return "";
    }
    const active = options.activePage === page;
    return `<button type="button" data-nav-page="${page}" class="rounded-md px-3 py-2 font-medium ${active ? "bg-orange-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}">${label}</button>`;
}

function logoutButton(options: ShellOptions): string {
    if (!options.logoutRole) {
        return "";
    }
    return `<button type="button" data-logout-role="${options.logoutRole}" class="rounded-md bg-slate-800 px-3 py-2 font-medium text-white hover:bg-slate-900">ออกจากระบบ</button>`;
}

export function noticeHtml(id: string): string {
    return `<div id="${id}" data-notice class="mb-4 hidden rounded-md border px-4 py-3 text-sm"><div class="flex items-start justify-between gap-3"><span data-notice-message></span><button type="button" data-close-notice class="rounded-md px-2 font-bold opacity-70 hover:bg-white hover:opacity-100" aria-label="ปิดข้อความแจ้งเตือน">X</button></div></div>`;
}

export function showNotice(id: string, text: string, tone: "ok" | "error" | "info"): void {
    const element = document.getElementById(id);
    if (!element) {
        return;
    }
    const classes = {
        ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
        error: "border-red-200 bg-red-50 text-red-800",
        info: "border-orange-200 bg-orange-50 text-orange-800",
    };
    element.className = `mb-4 rounded-md border px-4 py-3 text-sm ${classes[tone]}`;
    const message = element.querySelector("[data-notice-message]");
    if (message) {
        message.textContent = text;
    }
}
