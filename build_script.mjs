import { execFileSync } from "child_process";
import { mkdirSync, rmSync, existsSync, readdirSync, readFileSync, copyFileSync, writeFileSync } from "fs";
import { join, relative, sep, extname, basename, dirname, parse } from "path";
import { fileURLToPath } from "url";

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, "src");
const HTML_DIR = join(SOURCE_DIR, "html");
const DIST_DIR = join(ROOT_DIR, "dist");
const TSCONFIG_PATH = join(ROOT_DIR, "tsconfig.json");
const TYPESCRIPT_BIN_PATH = join(
  ROOT_DIR,
  "node_modules",
  "typescript",
  "bin",
  "tsc",
);

/**
 * สร้างโฟลเดอร์ รวมถึง parent directory ที่ยังไม่มีอยู่
 * @param {string} dirPath
 * @returns {void}
 */
function ensureDirectory(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

/**
 * ล้างโฟลเดอร์ปลายทางแล้วสร้างโฟลเดอร์เปล่ากลับมาใหม่
 * @param {string} dirPath
 * @returns {void}
 */
function cleanDirectory(dirPath) {
  rmSync(dirPath, { recursive: true, force: true });
  ensureDirectory(dirPath);
}

/**
 * อ่านไฟล์ทั้งหมดในโฟลเดอร์และโฟลเดอร์ย่อย
 * @param {string} dirPath
 * @returns {string[]} paths ของไฟล์ที่พบ
 */
function walkFiles(dirPath) {
  if (!existsSync(dirPath)) {
    return [];
  }

  /** @type {string[]} */
  const files = [];

  readdirSync(dirPath, { withFileTypes: true }).forEach((entry) => {
    const entryPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
      return;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  });

  return files;
}

/**
 * แปลง path เป็นรูปแบบ relative สำหรับแสดงใน log
 * @param {string} filePath
 * @returns {string}
 */
function toDisplayPath(filePath) {
  return relative(ROOT_DIR, filePath).split(sep).join("/");
}

/**
 * Compile TypeScript ด้วย local compiler และ tsconfig.json ของโปรเจกต์
 * @returns {string | null} path ของ tsconfig.json หรือ null เมื่อไม่มีไฟล์ .ts
 * @throws {Error} เมื่อไม่มี tsconfig.json หรือยังไม่ได้ติดตั้ง TypeScript ใน node_modules
 */
function compileTypescript() {
  const hasTs = walkFiles(SOURCE_DIR).some(
    (filePath) => extname(filePath).toLowerCase() === ".ts",
  );

  if (!hasTs) {
    return null;
  }

  if (!existsSync(TSCONFIG_PATH)) {
    throw new Error("Missing tsconfig.json");
  }

  if (!existsSync(TYPESCRIPT_BIN_PATH)) {
    throw new Error("Missing local TypeScript. Run npm install first.");
  }

  execFileSync(
    process.execPath,
    [TYPESCRIPT_BIN_PATH, "-p", TSCONFIG_PATH],
    {
      cwd: ROOT_DIR,
      stdio: "inherit",
    },
  );

  return TSCONFIG_PATH;
}

/**
 * Copy HTML templates จาก src/html ไปไว้ root ของ dist สำหรับ Apps Script
 * @returns {{ source: string, target: string }[]}
 * @throws {Error} เมื่อมี HTML ต่าง path แต่ชื่อไฟล์ปลายทางซ้ำกัน
 */
function copyHtmlFiles() {
  const htmlFiles = walkFiles(HTML_DIR).filter(
    (filePath) => extname(filePath).toLowerCase() === ".html",
  );
  const copiedNames = new Map();
  const copied = [];

  htmlFiles.forEach((sourcePath) => {
    const targetName = basename(sourcePath);
    const existingSource = copiedNames.get(targetName);

    if (existingSource) {
      throw new Error(
        [
          `HTML output name collision: ${targetName}`,
          `- ${toDisplayPath(existingSource)}`,
          `- ${toDisplayPath(sourcePath)}`,
        ].join("\n"),
      );
    }

    copiedNames.set(targetName, sourcePath);

    const targetPath = join(DIST_DIR, targetName);
    ensureDirectory(dirname(targetPath));
    copyFileSync(sourcePath, targetPath);
    copied.push({ source: sourcePath, target: targetPath });
  });

  return copied;
}

/**
 * Copy appsscript.json ไปที่ dist/
 * @returns {{ source: string, target: string }}
 * @throws {Error} เมื่อไม่พบ appsscript.json
 */
function copyManifest() {
  const candidates = [
    join(ROOT_DIR, "appsscript.json"),
    join(SOURCE_DIR, "appsscript.json"),
  ];
  const manifestPath =
    candidates.find((candidate) => existsSync(candidate)) || null;

  if (!manifestPath) {
    throw new Error("Missing appsscript.json in project root or src/");
  }

  const targetPath = join(DIST_DIR, "appsscript.json");
  ensureDirectory(dirname(targetPath));
  copyFileSync(manifestPath, targetPath);

  return { source: manifestPath, target: targetPath };
}

/**
 * ห่อข้อความด้วย ANSI color code สำหรับแสดงใน console
 * @param {string} text
 * @param {string} ansiColor
 * @returns {string}
 */
function color(text, ansiColor) {
  return `${ansiColor}${text}\x1b[0m`;
}

/**
 * รัน build pipeline ทั้งหมดสำหรับ dist/
 * @returns {void}
 * @throws {Error} เมื่อโครงสร้างโปรเจกต์ไม่ถูกต้องหรือ build ขั้นใดขั้นหนึ่งล้มเหลว
 */
function build() {
  if (!existsSync(SOURCE_DIR)) {
    throw new Error("Missing src/ directory");
  }

  const colors = {
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
  };

  try {
    console.log(
      color(
        `=== Built project at ${toDisplayPath(DIST_DIR)} folder ===`,
        colors.green,
      ),
    );
    cleanDirectory(DIST_DIR);

    console.log(color(`- compiling TypeScript...`, colors.green));
    const tsconfig = compileTypescript();
    if (tsconfig) {
      console.log(
        color(
          `  - compiled TypeScript with ${toDisplayPath(tsconfig)}`,
          colors.green,
        ),
      );
    } else {
      console.warn(
        color(
          `  - no TypeScript files found, skipping compilation`,
          colors.yellow,
        ),
      );
    }

    console.log(color(`- copying HTML files...`, colors.green));
    const htmlFiles = copyHtmlFiles();
    if (htmlFiles.length === 0) {
      console.warn(color(`  - no HTML files found to copy`, colors.yellow));
    } else {
      htmlFiles.forEach((htmlFile) => {
        console.log(
          color(
            `  - copied ${toDisplayPath(htmlFile.source)} -> ${toDisplayPath(htmlFile.target)}`,
            colors.green,
          ),
        );
      });
    }

    console.log(color(`- copying manifest file...`, colors.green));
    const manifest = copyManifest();
    console.log(
      color(
        `  - copied ${toDisplayPath(manifest.source)} -> ${toDisplayPath(manifest.target)}`,
        colors.green,
      ),
    );

    console.log(color("Build completed successfully.\n", colors.green));

  } catch (error) {
    console.error(color(error instanceof Error ? error.message : String(error), colors.red));
    console.error(color("Build failed.\n", colors.red));
    process.exitCode = 1;
  }
}

build();
