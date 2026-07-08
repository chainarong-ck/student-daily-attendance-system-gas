import type { AppPages } from "../shared/types";
import { MainConfig } from "./MainConfig";
import { ServerConstant } from "./ServerConstant";
import { ServerUtils } from "./ServerUtils";

/**
 * จัดการคำขอ GET ไปยังเว็บแอปพลิเคชัน
 * @param event - ข้อมูลเหตุการณ์ที่เกิดขึ้นเมื่อมีการเรียกใช้งานเว็บแอปพลิเคชัน
 * @returns HtmlOutput ที่แสดงผลหน้าเว็บที่เหมาะสมตามสถานะการตั้งค่าและหน้าที่ร้องขอ
 */
export function doGet(
    event?: GoogleAppsScript.Events.DoGet,
): GoogleAppsScript.HTML.HtmlOutput {
    const setupState = MainConfig.isInitialized();
    const requestedPage = event?.parameter?.page ?? "";
    const page: AppPages = (
        !setupState
            ? "Setup"
            : ServerConstant.APP_PAGES.includes(requestedPage as AppPages)
              ? requestedPage
              : "Index"
    ) as AppPages;

    const template = HtmlService.createTemplateFromFile(
        page,
    ) as GoogleAppsScript.HTML.HtmlTemplate & { webAppUrl: string };
    template.WebAppUrl = ServerUtils.getWebAppUrl();
    template.PageTitle =
        ServerConstant.APP_PAGES_TITLEL[page] ??
        ServerConstant.APP_PAGES_TITLEL.Index;
    return template
        .evaluate()
        .setTitle("ระบบเช็คชื่อนักเรียน")
        .addMetaTag("viewport", "width=device-width, initial-scale=1");
}
