export const APP_TOKEN_KEY = "student_attendance_app_token";
export const ADMIN_TOKEN_KEY = "student_attendance_admin_token";

declare global {
    interface Window {
        __WEB_APP_URL__?: string;
    }
}

export function webAppUrl(page?: string): string {
    const base = window.__WEB_APP_URL__ || window.location.href.split("?")[0];
    return page ? `${base}?page=${encodeURIComponent(page)}` : base;
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
    return `<footer class="mt-10 border-t border-slate-200 py-5 text-center text-sm text-slate-500">ระบบเช็คชื่อนักเรียนรายวัน | พัฒนาโดย Chainarong CK</footer>`;
}

export function shellHtml(title: string, body: string): string {
    return `
        <main class="min-h-screen bg-slate-100 text-slate-900">
            <section class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                <header class="mb-6 flex flex-col gap-3 rounded-lg bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p class="text-sm font-medium text-orange-600">Student Daily Attendance</p>
                        <h1 class="text-2xl font-bold">${escapeHtml(title)}</h1>
                    </div>
                    <nav class="flex flex-wrap gap-2 text-sm">
                        <a class="rounded-md bg-slate-100 px-3 py-2 font-medium hover:bg-slate-200" href="${webAppUrl("Index")}">หน้าเช็คชื่อ</a>
                        <a class="rounded-md bg-slate-100 px-3 py-2 font-medium hover:bg-slate-200" href="${webAppUrl("Admin")}">Admin</a>
                        <a class="rounded-md bg-orange-600 px-3 py-2 font-medium text-white hover:bg-orange-700" href="${webAppUrl("Login")}">Login</a>
                    </nav>
                </header>
                ${body}
                ${footerHtml()}
            </section>
        </main>`;
}

export function noticeHtml(id: string): string {
    return `<div id="${id}" class="mb-4 hidden rounded-md border px-4 py-3 text-sm"></div>`;
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
    element.textContent = text;
}
