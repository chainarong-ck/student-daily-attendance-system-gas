# Student Daily Attendance System GAS

ระบบเช็คชื่อนักเรียนรายวันสำหรับ Google Apps Script Web App โดยใช้ Google Sheets เป็นฐานข้อมูล แยกข้อมูลตามปีการศึกษา/เทอม และเก็บค่าตั้งค่าหลักไว้ใน Script Properties ของ Apps Script

ระบบนี้ออกแบบสำหรับงานภายในโรงเรียน เน้นใช้งานง่าย โครงสร้างข้อมูลตรงไปตรงมา และลดการเก็บข้อมูลที่ไม่จำเป็น

## ภาพรวมระบบ

ระบบมี 4 หน้าเว็บหลัก

| หน้า | ใช้ทำอะไร |
| --- | --- |
| `Setup` | ตั้งค่าระบบครั้งแรก ใช้ได้ก่อนระบบถูก initialized เท่านั้น |
| `Login` | เข้าสู่ระบบด้วยรหัสผ่านแบบง่าย แยกครูกับ Admin |
| `Index` | หน้าใช้งานของครูสำหรับดูภาพรวม เช็คชื่อรายห้อง และดูสถิติ |
| `Admin` | หน้าผู้ดูแลระบบสำหรับตั้งค่า ปีการศึกษา ห้องเรียน รายชื่อนักเรียน และบังคับลบข้อมูล |

ข้อมูลถูกแยกเป็น 2 ส่วน

| ส่วนข้อมูล | ที่เก็บ |
| --- | --- |
| ค่าตั้งค่าระบบ | Apps Script `Script Properties` |
| ข้อมูลแต่ละปีการศึกษา/เทอม | Google Sheets แยกไฟล์ตามปีการศึกษา/เทอม |

ตัวอย่างแนวคิดการแยกข้อมูล:

```text
MainApp Apps Script
  - schoolName
  - password hashes
  - academicYears
  - currentYear

Google Sheet ปี 2569 เทอม 1
  - Classes
  - Students
  - Attendance

Google Sheet ปี 2569 เทอม 2
  - Classes
  - Students
  - Attendance
```

## คุณสมบัติหลัก

- ตั้งค่าระบบครั้งแรกผ่านหน้า `Setup`
- Login แยกสิทธิ์ครูและ Admin
- จำ session ไว้ใน `localStorage` ด้วย signed token
- จัดการปีการศึกษา/เทอมได้หลายรายการ และเลือก current year ได้ 1 รายการ
- แยก Google Sheet ของแต่ละปีการศึกษา/เทอม
- จัดการห้องเรียนและรายชื่อนักเรียนผ่านหน้า Admin
- เพิ่มนักเรียนทีละหลายแถวได้
- Import นักเรียนด้วย CSV รายห้อง โดยใช้คอลัมน์ `number,studentCode,fullName`
- เช็คชื่อรายห้องตามวันที่
- ป้องกันการเช็คชื่อซ้ำ ถ้าวัน/ห้องนั้นเคยเช็คแล้วจะเป็นการแก้ไขข้อมูลเดิม
- สถานะเช็คชื่อ: `present`, `absent`, `late`, `leave`
- ดูภาพรวมรายวันทั้งโรงเรียน พร้อมจำนวนทั้งหมด เช็คแล้ว ยังไม่เช็ค และเปอร์เซ็นต์สถานะ
- ดูสถิติละเอียดรายนักเรียน พร้อมเปอร์เซ็นต์สถานะ
- ลบแบบปลอดภัยในฟอร์ม Admin โดย mark แถวก่อนบันทึก และยกเลิกได้
- Tab บังคับลบข้อมูล สำหรับลบนักเรียนพร้อมประวัติเช็คชื่อของนักเรียนคนนั้น
- ตั้ง format ข้อมูลใน Google Sheet เป็น plain text (`@`) เพื่อลดปัญหา Google Sheets แปลงข้อมูลเอง

## สำหรับผู้ใช้งาน

### 1. การตั้งค่าครั้งแรก

เปิด Web App ครั้งแรก ระบบจะพาไปหน้า `Setup` อัตโนมัติ

ข้อมูลที่ต้องกรอก:

- ชื่อโรงเรียน
- รหัสผ่านสำหรับครู
- รหัสผ่านสำหรับ Admin
- ปีการศึกษาแรก
- เทอมแรก
- Google Sheet URL หรือ ID สำหรับเก็บข้อมูลปีการศึกษา/เทอมนั้น

หลังตั้งค่าสำเร็จ ระบบจะตั้งสถานะเป็น initialized และหน้า `Setup` จะไม่ถูกใช้ซ้ำในการทำงานปกติ

### 2. การ Login

ระบบมีการ Login แบบใส่รหัสผ่านอย่างง่าย

- ครู: ใช้เข้าหน้า `Index`
- Admin: ใช้เข้าหน้า `Admin`

เมื่อ login สำเร็จ ระบบจะเก็บ token ไว้ใน browser เพื่อใช้งานต่อเนื่องจนกว่า token หมดอายุหรือผู้ใช้กด logout

### 3. หน้าเช็คชื่อ `Index`

หน้า `Index` มี 3 tab

| Tab | รายละเอียด |
| --- | --- |
| ภาพรวม | ดูสถานะการเช็คชื่อทั้งโรงเรียนของวันที่เลือก |
| เช็คชื่อรายห้อง | เลือกห้องและวันที่เพื่อเช็คชื่อ |
| สถิติละเอียด | ดูสถิติรายนักเรียนตามช่วงวันที่และห้อง |

#### ภาพรวมรายวัน

แสดงข้อมูล:

- จำนวนนักเรียนทั้งหมด
- จำนวนที่เช็คแล้ว
- จำนวนที่ยังไม่ได้เช็ค
- จำนวนและเปอร์เซ็นต์ มา/ขาด/สาย/ลา
- รายละเอียดแยกตามห้อง

#### เช็คชื่อรายห้อง

ขั้นตอน:

1. เลือกห้องเรียน
2. เลือกวันที่
3. กดโหลดรายชื่อ
4. เลือกสถานะของนักเรียนแต่ละคน
5. กดบันทึก

ถ้าวันและห้องนั้นเคยเช็คแล้ว ระบบจะโหลดข้อมูลเดิมขึ้นมา และปุ่มบันทึกจะทำงานเป็นการแก้ไขข้อมูลเดิม ไม่สร้างข้อมูลซ้ำ

#### สถิติละเอียด

เลือกช่วงวันที่และห้องเรียน หรือเลือกทุกห้อง เพื่อดูสถิติรายนักเรียน

### 4. หน้า Admin

หน้า Admin มี tab หลักดังนี้

| Tab | รายละเอียด |
| --- | --- |
| ตั้งค่าระบบ | เปลี่ยนชื่อโรงเรียน รหัสครู และรหัส Admin |
| ปีการศึกษา | เพิ่ม/แก้ไขปีการศึกษา เทอม และ Google Sheet ID รวมถึงเลือก current year |
| ห้องเรียน | เพิ่ม/แก้ไข/ลบห้องเรียนใน current year |
| รายชื่อนักเรียน | จัดการนักเรียนทีละห้อง และ import CSV |
| บังคับลบข้อมูล | ลบนักเรียนพร้อมประวัติเช็คชื่อทั้งหมดของนักเรียนที่เลือก |

#### การจัดการปีการศึกษา

Admin สามารถเพิ่มหรือแก้ไขรายการปีการศึกษา/เทอมได้ แต่ต้องเลือก current year ไว้ 1 รายการเสมอ

ระบบจะตรวจสอบ:

- Google Sheet ID ห้ามซ้ำ
- คู่ปีการศึกษา + เทอมห้ามซ้ำ
- จำนวนปีการศึกษา/เทอมไม่เกิน 50 รายการ
- เปิด Google Sheet ได้ และสร้าง schema ได้

#### การจัดการห้องเรียน

ระบบบังคับไม่ให้ `grade + room` ซ้ำกันในปีการศึกษาเดียวกัน

ตัวอย่าง:

```text
grade = ม.1
room = 1
```

ข้อจำกัด:

- เพิ่มห้องเรียนได้ไม่เกิน 20 ห้องต่อปีการศึกษา/เทอม
- ไม่สามารถลบห้องเรียนที่ยังมีนักเรียนอยู่ได้

#### การจัดการรายชื่อนักเรียน

ระบบจัดการนักเรียนทีละห้อง เพื่อลดความเสี่ยงในการแก้ไขผิดห้อง

ข้อมูลนักเรียน:

- เลขที่
- รหัสนักเรียน
- ชื่อ-สกุล
- สถานะ: กำลังศึกษา หรือ ออก/พักเรียน

ข้อจำกัด:

- นักเรียนไม่เกิน 500 คนต่อปีการศึกษา/เทอม
- เลขที่ซ้ำกันไม่ได้ในห้องเดียวกัน
- รหัสนักเรียนซ้ำกันไม่ได้ถ้ามีการกรอก
- นักเรียนที่มีประวัติเช็คชื่อแล้วไม่ควรถูกลบผ่านหน้าปกติ ให้เปลี่ยนสถานะเป็นออก/พักเรียนแทน

#### Import CSV นักเรียน

ใช้สำหรับเพิ่มนักเรียนใหม่ในห้องที่เลือก

รูปแบบ CSV:

```csv
number,studentCode,fullName
1,10001,เด็กชายตัวอย่าง นักเรียน
2,10002,เด็กหญิงตัวอย่าง นักเรียน
```

หมายเหตุ:

- ไม่ต้องใส่ `id`
- ไม่ต้องใส่ `classId`
- ไม่ต้องใส่ `status`
- นักเรียนที่ import จะถูกตั้งสถานะเป็น `active` อัตโนมัติ
- หลัง import ลงตารางแล้วต้องกดบันทึกรายชื่อนักเรียนอีกครั้ง

#### การลบแถวในฟอร์ม

ใน tab ปีการศึกษา ห้องเรียน และรายชื่อนักเรียน เมื่อกด `ลบ` ระบบจะไม่ลบแถวทันที แต่จะทำเครื่องหมายว่า `จะลบเมื่อบันทึก`

ผู้ใช้สามารถกด `ยกเลิก` เพื่อคืนแถวก่อนกดบันทึกได้

#### บังคับลบข้อมูล

Tab นี้ใช้สำหรับกรณีที่ต้องการลบนักเรียนออกจากระบบถาวร พร้อมลบประวัติการเช็คชื่อทั้งหมดของนักเรียนคนนั้น

ขั้นตอน:

1. ค้นหานักเรียน
2. เลือกนักเรียนที่ต้องการลบ
3. พิมพ์คำยืนยัน `ลบถาวร`
4. กดปุ่มบังคับลบ
5. ยืนยันผ่าน dialog อีกครั้ง

ข้อควรระวัง:

- การลบนี้ไม่สามารถกู้คืนผ่านระบบได้
- ระบบจำกัดการบังคับลบครั้งละไม่เกิน 50 คน
- ใช้เฉพาะกรณีข้อมูลผิดจริง หรือมีความจำเป็นต้องล้างประวัติของนักเรียนคนนั้น

## โครงสร้าง Google Sheets

ใน Google Sheet ของแต่ละปีการศึกษา/เทอม ระบบใช้ 3 sheets

### Classes

| column | รายละเอียด |
| --- | --- |
| `id` | id ห้องเรียนที่ระบบสร้าง |
| `grade` | ระดับชั้น |
| `room` | เลขห้อง |

### Students

| column | รายละเอียด |
| --- | --- |
| `id` | id นักเรียนภายในระบบ |
| `classId` | id ของห้องเรียน |
| `number` | เลขที่ |
| `studentCode` | รหัสนักเรียน |
| `fullName` | ชื่อ-สกุล |
| `status` | `active` หรือ `leave` |

### Attendance

| column | รายละเอียด |
| --- | --- |
| `id` | id รายการเช็คชื่อ |
| `date` | วันที่รูปแบบ `yyyy-MM-dd` |
| `classId` | id ห้องเรียน |
| `studentId` | id นักเรียน |
| `status` | `present`, `absent`, `late`, `leave` |

ระบบจะสร้าง sheet และ header ให้อัตโนมัติเมื่อเพิ่มปีการศึกษา/เทอม และจะตั้ง number format เป็น plain text (`@`) ให้กับคอลัมน์ที่ใช้งาน

## Script Properties

ระบบเก็บค่าตั้งค่าหลักไว้ที่ Apps Script Script Properties

| key | รายละเอียด |
| --- | --- |
| `schoolName` | ชื่อโรงเรียน |
| `appPasswordHash` | hash ของรหัสผ่านครู |
| `adminPasswordHash` | hash ของรหัสผ่าน Admin |
| `academicYears` | JSON array ของปีการศึกษา/เทอม |
| `currentYear` | ปีการศึกษา/เทอมที่ใช้งานปัจจุบัน |
| `initialized` | flag ว่าติดตั้งระบบแล้ว |

ตัวอย่าง `academicYears`:

```json
[
  {
    "id": "google_sheet_id",
    "y": 2569,
    "t": 1
  },
  {
    "id": "google_sheet_id_2",
    "y": 2569,
    "t": 2
  }
]
```

## สำหรับนักพัฒนา

### Tech Stack

- Google Apps Script Web App
- TypeScript
- Vite
- Tailwind CSS
- Webpack + `gas-webpack-plugin`
- clasp
- Google Sheets เป็นฐานข้อมูล

### โครงสร้างโปรเจกต์

```text
.
├── appsscript.json
├── package.json
├── package-lock.json
├── README.md
├── scripts
│   ├── build-client.mjs
│   ├── build-server.mjs
│   └── copy-assets.mjs
├── src
│   ├── client
│   │   ├── Admin.html
│   │   ├── Index.html
│   │   ├── Login.html
│   │   ├── script
│   │   │   ├── Admin.ts
│   │   │   ├── client-utils.ts
│   │   │   ├── Index.ts
│   │   │   ├── Login.ts
│   │   │   └── Setup.ts
│   │   ├── Setup.html
│   │   └── style
│   │       └── Global.css
│   ├── server
│   │   ├── AcademicYearService.ts
│   │   ├── AttendanceService.ts
│   │   ├── AuthService.ts
│   │   ├── ClassService.ts
│   │   ├── Code.ts
│   │   ├── MainConfig.ts
│   │   ├── ServerConstant.ts
│   │   ├── ServerUtils.ts
│   │   ├── SheetDatabase.ts
│   │   └── StudentService.ts
│   └── shared
│       ├── gas-client.ts
│       ├── google-script-run.d.ts
│       └── types.ts
├── tsconfig.json
├── tsconfig.webpack.json
└── .build/ (ไฟล์ที่ build แล้วสำหรับ push ไป Apps Script)
```

### หลักการออกแบบฝั่ง server

- `Code.ts` เก็บเฉพาะ global functions ที่ Apps Script เรียกได้
- logic หลักอยู่ใน service classes
- `ServerConstant.ts` เก็บค่าคงที่ เช่น sheet names, headers, limits, statuses
- `ServerUtils.ts` เก็บ helper กลาง เช่น id, hash, date validation, sheet id extraction
- `SheetDatabase.ts` เป็นชั้นเชื่อมต่อ Google Sheets และจัดการ schema
- ใช้ OOP และ static service class เพื่อลด global function ที่ไม่จำเป็น

### หลักการออกแบบฝั่ง client

- ทุกหน้าแยก entry script ของตัวเอง
- เรียก server ผ่าน `googleScriptRun` เท่านั้น
- ทุก async action ควร disable ปุ่มและแสดง loading
- ใช้ Tailwind CSS
- ใช้ shell/layout กลางจาก `client-utils.ts`

### Public Endpoints

Global functions ที่ client เรียกผ่าน `google.script.run`

| endpoint | สิทธิ์ | รายละเอียด |
| --- | --- | --- |
| `getPublicSystemState()` | public | อ่านสถานะระบบพื้นฐาน |
| `setupSystem(payload)` | public ก่อน initialized | ตั้งค่าระบบครั้งแรก |
| `loginApp(password)` | public | login ครู |
| `loginAdmin(password)` | public | login Admin |
| `getIndexBootstrap(token)` | app | โหลดข้อมูลเริ่มต้นหน้า Index |
| `getAdminBootstrap(adminToken)` | admin | โหลดข้อมูลเริ่มต้นหน้า Admin |
| `saveSystemSettings(adminToken, payload)` | admin | บันทึกตั้งค่าระบบ |
| `addAcademicYear(adminToken, payload)` | admin | เพิ่มปีการศึกษา |
| `saveAcademicYears(adminToken, payload)` | admin | บันทึกปีการศึกษาและ current year |
| `setCurrentAcademicYear(adminToken, academicYearKey)` | admin | เปลี่ยน current year |
| `listClasses(adminToken)` | admin | โหลดห้องเรียน |
| `saveClasses(adminToken, rows)` | admin | บันทึกห้องเรียน |
| `listStudents(adminToken, classId?)` | admin | โหลดนักเรียน |
| `saveStudents(adminToken, rows)` | admin | บันทึกรายชื่อนักเรียน |
| `forceDeleteStudents(adminToken, payload)` | admin | บังคับลบนักเรียนพร้อมประวัติเช็คชื่อ |
| `getAttendanceClassSession(token, classId, date)` | app | โหลด session เช็คชื่อรายห้อง |
| `saveAttendance(token, payload)` | app | บันทึกเช็คชื่อครั้งแรก |
| `updateAttendance(token, payload)` | app | แก้ไขเช็คชื่อเดิม |
| `getAttendanceOverview(token, date)` | app | โหลดภาพรวมรายวัน |
| `getAttendanceStats(token, filters)` | app | โหลดสถิติละเอียด |

เมื่อเพิ่ม endpoint ใหม่ ต้องเพิ่มทั้ง:

- global function ใน `src/server/Code.ts`
- type ใน `src/shared/types.ts` ถ้ามี payload/result ใหม่
- declaration ใน `src/shared/google-script-run.d.ts`
- client call ผ่าน `src/shared/gas-client.ts`

### ข้อกำหนดข้อมูลและ validation

| รายการ | กฎ |
| --- | --- |
| ชื่อโรงเรียน | ต้องมีค่า และไม่เกิน 100 ตัวอักษร |
| ปีการศึกษา/เทอม | ไม่เกิน 50 รายการ |
| Google Sheet ID | ห้ามซ้ำ |
| ปีการศึกษา + เทอม | ห้ามซ้ำ |
| ห้องเรียน | ไม่เกิน 20 ห้อง |
| นักเรียน | ไม่เกิน 500 คน |
| `grade + room` | ห้ามซ้ำ |
| เลขที่นักเรียน | ห้ามซ้ำในห้องเดียวกัน |
| รหัสนักเรียน | ห้ามซ้ำถ้ากรอก |
| วันที่ที่บันทึก | ใช้รูปแบบ `yyyy-MM-dd` |

### การจัดการวันที่

ระบบเก็บวันที่ลง Google Sheets เป็น string รูปแบบ:

```text
yyyy-MM-dd
```

หน้าเว็บใช้ native `input type="date"` เพื่อให้มี calendar picker การแสดงผลในช่องวันที่ขึ้นกับ browser, OS และ locale ของผู้ใช้ แต่ค่า `.value` ที่ JavaScript อ่านได้จะเป็น `yyyy-MM-dd` ตามมาตรฐานของ input date

### การติดตั้งสำหรับพัฒนา

ต้องมี Node.js และ npm

```bash
npm install
```

ตรวจ build:

```bash
npm run build
```

คำสั่งที่มีใน `package.json`

| command | รายละเอียด |
| --- | --- |
| `npm run build:client` | build หน้า HTML/CSS/JS ฝั่ง client ด้วย Vite |
| `npm run build:server` | build server TypeScript เป็น `Code.js` ด้วย Webpack |
| `npm run copy:assets` | copy `appsscript.json` ไป `.build` |
| `npm run build` | build client + server + assets |
| `npm run push` | push `.build` ไป Apps Script ด้วย clasp |
| `npm run deploy` | build แล้ว push ไป Apps Script |

### การตั้งค่า clasp

คัดลอกไฟล์ตัวอย่าง:

```bash
cp .clasp.example.json .clasp.json
```

แก้ `scriptId` ให้เป็น Apps Script project id ของคุณ

```json
{
  "scriptId": "ใส่_scriptId_ของคุณ_ที่นี่",
  "rootDir": ".build"
}
```

Login clasp ถ้ายังไม่เคย login:

```bash
npx clasp login
```

Build และ push:

```bash
npm run deploy
```

### การ Deploy Web App

หลัง push ไป Apps Script แล้ว ให้เปิด Apps Script project และ deploy เป็น Web App

ค่าที่ใช้ใน `appsscript.json`:

```json
{
  "timeZone": "Asia/Bangkok",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

ระบบเปิด access เป็น anonymous เพราะใช้ password gate ภายในระบบเอง ไม่ใช่ Google account auth แบบเต็มรูปแบบ

### Security Notes

ระบบนี้เป็นระบบ auth แบบง่ายสำหรับใช้งานภายในโรงเรียน ไม่ใช่ระบบความปลอดภัยสูง

- password ถูกเก็บเป็น hash ใน Script Properties
- token ถูก sign และมีอายุประมาณ 7 วัน
- token ถูกเก็บใน browser `localStorage`
- ผู้ที่มี URL ยังเข้าหน้า Login ได้ แต่ต้องมีรหัสจึงใช้งานข้อมูลได้
- ผู้ดูแลควรจำกัดการแชร์ URL และตั้งรหัสผ่านให้เหมาะสม

### การ reset ระบบ

ถ้าต้องการกลับไปหน้า `Setup` ใหม่ ต้องล้าง Script Properties ใน Apps Script project โดยเฉพาะ key:

```text
initialized
schoolName
appPasswordHash
adminPasswordHash
academicYears
currentYear
```

ควรทำเฉพาะตอนเริ่มระบบใหม่จริง ๆ เพราะจะทำให้ระบบไม่พบ config เดิม

### Troubleshooting

#### เปิดหน้า Index หรือ Admin แล้วถูกพาไป Login

เกิดจากยังไม่มี token, token หมดอายุ หรือ token ไม่ตรงสิทธิ์ ให้ login ใหม่

#### เพิ่มปีการศึกษาแล้ว error เรื่อง Google Sheet

ตรวจสอบว่า:

- ใส่ Google Sheet URL หรือ ID ถูกต้อง
- Apps Script owner มีสิทธิ์เปิดไฟล์นั้น
- ไฟล์เป็น Google Sheets จริง

#### ลบห้องเรียนไม่ได้

ระบบไม่ให้ลบห้องเรียนที่ยังมีนักเรียนอยู่ ต้องลบนักเรียนหรือย้ายนักเรียนออกก่อน

#### ลบนักเรียนไม่ได้เพราะมีประวัติเช็คชื่อ

การลบปกติถูกป้องกันไว้เพื่อรักษาประวัติ แนะนำให้เปลี่ยนสถานะเป็นออก/พักเรียน ถ้าจำเป็นต้องลบพร้อมประวัติ ให้ใช้ tab `บังคับลบข้อมูล`

#### วันที่ในช่อง date แสดงเป็น mm/dd/yyyy

`input type="date"` แสดงผลตาม browser/OS locale ของผู้ใช้ ระบบยังอ่านค่าและบันทึกเป็น `yyyy-MM-dd` ตามมาตรฐาน จึงไม่กระทบข้อมูลใน Google Sheets

## Credits

พัฒนาโดย Chainarong_CK
