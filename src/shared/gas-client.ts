/**
 * เรียกใช้งานฟังก์ชัน Google Apps Script ผ่าน google.script.run
 * และคืนค่าเป็น Promise เพื่อให้ใช้งานได้สะดวกในโค้ดแบบ async/await
 *
 * @param name ชื่อฟังก์ชันที่ต้องการเรียกใช้งานจาก Endpoints
 * @param args พารามิเตอร์ที่ส่งไปยังฟังก์ชันนั้น
 * @returns Promise ที่คืนค่าผลลัพธ์จากฟังก์ชัน Google Apps Script
 */
export function googleScriptRun<FnName extends google.script.EndpointsName>(
    name: FnName,
    ...args: google.script.EndpointArgs<FnName>
): Promise<google.script.EndpointReturn<FnName>> {
    return new Promise((resolve, reject) => {
        const runner = google.script.run
            .withSuccessHandler<FnName>((value) => {
                resolve(value);
            })
            .withFailureHandler((error) => {
                reject(error);
            });

        (runner[name] as google.script.EndpointFunctions[FnName])(...args);
    });
}
