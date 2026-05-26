# Student Daily Attendance System GAS

ระบบบันทึกการเข้าเรียนรายวันของนักเรียนบน Google Apps Script Web App โดยใช้ Google Sheets เป็นแหล่งเก็บข้อมูลหลัก พัฒนา UI ด้วย HTML, Bootstrap 5 และ Bootstrap Icons พร้อมจัดการโค้ดฝั่ง Apps Script ด้วย TypeScript แล้ว build ไปยังโฟลเดอร์ `dist/` สำหรับ deploy ผ่าน `clasp`

## สถานะระบบปัจจุบัน

ระบบในเวอร์ชันนี้เป็นโครงสร้างพื้นฐานสำหรับ Web App ประกอบด้วย:

- หน้าตั้งค่าระบบครั้งแรก สำหรับกำหนด Google Spreadsheet หลักและรหัสผ่านเข้าใช้งาน
- หน้าเข้าสู่ระบบด้วยรหัสผ่านที่บันทึกไว้ใน Script Properties
- ระบบ session token ผ่าน Apps Script Cache Service อายุ 6 ชั่วโมง
- หน้าหลักหลังเข้าสู่ระบบ แสดงสถานะระบบ, สเปรดชีตหลัก และเซสชัน
- สร้างโครงสร้างชีตหลักอัตโนมัติเมื่อบันทึกการตั้งค่า
- Build pipeline สำหรับ compile TypeScript และคัดลอก HTML/manifest ไปยัง `dist/`

## เทคโนโลยีที่ใช้

- Google Apps Script V8 Runtime
- Google Sheets
- TypeScript
- HTML Service
- Bootstrap 5
- Bootstrap Icons
- Noto Sans Thai
- clasp สำหรับ push โปรเจกต์ขึ้น Google Apps Script

## โครงสร้างโปรเจกต์

```text
.
├── src/
│   ├── Code.ts
│   ├── AppController.ts
│   ├── AppPropertiesController.ts
│   ├── AppSpreadsheetController.ts
│   ├── AuthController.ts
│   ├── CacheController.ts
│   ├── SpreadsheetController.ts
│   ├── TermSpreadsheetController.ts
│   └── html/
│       ├── Setup.html
│       ├── Login.html
│       └── Index.html
├── dist/
├── appsscript.json
├── build_script.js
├── package.json
└── tsconfig.json
```

ไฟล์ใน `src/` คือ source หลักของโปรเจกต์ ส่วน `dist/` คือผลลัพธ์จากการ build และเป็น root directory ที่ใช้ push ขึ้น Google Apps Script ตามค่าใน `.clasp.json`

## การตั้งค่าที่ระบบใช้

ระบบเก็บค่าหลักไว้ใน Script Properties:

| Key | รายละเอียด |
| --- | --- |
| `APP_SPREADSHEET_ID` | Spreadsheet ID ของ Google Sheet หลัก |
| `APP_PASSWORD` | รหัสผ่านสำหรับเข้าสู่ระบบ |

หากยังไม่มีค่าใดค่าหนึ่ง ระบบจะแสดงหน้า `Setup` เพื่อให้ตั้งค่าก่อนใช้งาน

## โครงสร้าง Google Sheets

เมื่อบันทึกการตั้งค่าระบบจะตรวจสอบและสร้างชีตที่จำเป็นใน Spreadsheet หลัก:

### `Academic_Terms`

| คอลัมน์ | รายละเอียด |
| --- | --- |
| `academicYear` | ปีการศึกษา |
| `term` | ภาคเรียน |
| `spreadsheetId` | Spreadsheet ID ของข้อมูลรายภาคเรียน |
| `status` | สถานะการใช้งาน |
| `createdAt` | วันที่สร้าง |
| `updatedAt` | วันที่แก้ไขล่าสุด |

### `App_Settings`

| คอลัมน์ | รายละเอียด |
| --- | --- |
| `key` | ชื่อการตั้งค่า |
| `value` | ค่าของการตั้งค่า |

## การติดตั้งสำหรับพัฒนา

ติดตั้ง dependency:

```bash
npm install
```

Build โปรเจกต์:

```bash
npm run build
```

คำสั่ง build จะทำงานหลัก ๆ ดังนี้:

- ล้างและสร้างโฟลเดอร์ `dist/`
- compile TypeScript จาก `src/**/*.ts` ไปเป็น JavaScript
- คัดลอกไฟล์ HTML จาก `src/html/` ไปยัง `dist/`
- คัดลอก `appsscript.json` ไปยัง `dist/`
- สร้าง helper `include_` หากยังไม่มีใน source

## การเชื่อมต่อกับ Google Apps Script

ล็อกอิน clasp ก่อนใช้งาน:

```bash
clasp login
```

คัดลอกไฟล์ `.clasp.json.example` ไปเป็น `.clasp.json` และแก้ไข `scriptId` ให้ตรงกับโปรเจกต์ Google Apps Script ที่ต้องการเชื่อมต่อ

```json
{
  "scriptId": "ใส่_scriptId_ของคุณ_ที่นี่",
  "rootDir": "src",
  "scriptExtensions": [
    ".js",
    ".gs"
  ],
  "htmlExtensions": [
    ".html"
  ],
  "jsonExtensions": [
    ".json"
  ],
  "filePushOrder": [],
  "skipSubdirectories": false
}
```

Push โค้ดขึ้น Google Apps Script:

```bash
npm run push
```

คำสั่งนี้จะ run `npm run build` ก่อน แล้วต่อด้วย `clasp push`

## การเปิดใช้งานครั้งแรก

1. สร้าง Google Sheet สำหรับใช้เป็นฐานข้อมูลหลัก หรือใช้ Google Sheet ที่ผูกกับ Apps Script อยู่แล้ว
2. Deploy Apps Script เป็น Web App
3. เปิด URL ของ Web App
4. ระบบจะแสดงหน้าตั้งค่า หากยังไม่มี `APP_SPREADSHEET_ID` หรือ `APP_PASSWORD`
5. กรอก Spreadsheet ID หรือ URL ของ Google Sheet
6. ตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร
7. บันทึกการตั้งค่า
8. กลับเข้าสู่หน้า Web App และล็อกอินด้วยรหัสผ่านที่ตั้งไว้

## การ Deploy Web App

ใน Google Apps Script ให้ตั้งค่า deployment เป็น Web App โดยค่าปัจจุบันใน `appsscript.json` กำหนดไว้ดังนี้:

```json
{
  "executeAs": "USER_DEPLOYING",
  "access": "MYSELF"
}
```

ค่าดังกล่าวเหมาะกับการใช้งานส่วนตัวหรือช่วงพัฒนา หากต้องการให้ผู้ใช้อื่นเข้าถึง ต้องปรับสิทธิ์การ deploy ใน Google Apps Script ให้เหมาะสมกับบริบทการใช้งานจริง

## Workflow การพัฒนา

แก้ไข source ใน `src/` เท่านั้นเป็นหลัก:

- TypeScript controller แก้ที่ `src/*.ts`
- หน้าเว็บแก้ที่ `src/html/*.html`
- Manifest แก้ที่ `appsscript.json`

จากนั้น build และ push:

```bash
npm run build
npm run push
```

ไม่ควรแก้ไฟล์ใน `dist/` โดยตรง เพราะโฟลเดอร์นี้จะถูกล้างและสร้างใหม่ทุกครั้งที่ run build

## หมายเหตุด้านความปลอดภัย

- รหัสผ่านถูกเก็บใน Script Properties ตามรูปแบบปัจจุบันของระบบ
- Session token ถูกเก็บใน Cache Service เป็นเวลา 6 ชั่วโมง และต่ออายุเมื่อมีการตรวจสอบ session สำเร็จ
- หากต้องการเปลี่ยนรหัสผ่านหลังตั้งค่าครบแล้ว ต้องแก้ค่า `APP_PASSWORD` ใน Script Properties โดยตรง

## คำสั่งที่ใช้บ่อย

```bash
npm install
npm run build
npm run push
```

## ผู้พัฒนา

พัฒนาโดย [นายชัยณรงค์ คงพล](https://github.com/chainarong-ck)
