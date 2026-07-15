import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SERVER_BUNDLE_URL = new URL("../../.build/Code.js", import.meta.url);

class MockScriptProperties {
    #values = new Map();

    getProperty(key) {
        return this.#values.get(String(key)) ?? null;
    }

    getProperties() {
        return Object.fromEntries(this.#values);
    }

    setProperty(key, value) {
        this.#values.set(String(key), String(value));
        return this;
    }

    setProperties(values, deleteAllOthers = false) {
        if (deleteAllOthers) {
            this.#values.clear();
        }
        Object.entries(values).forEach(([key, value]) => {
            this.#values.set(key, String(value));
        });
        return this;
    }

    deleteProperty(key) {
        this.#values.delete(String(key));
        return this;
    }

    deleteAllProperties() {
        this.#values.clear();
        return this;
    }
}

class MockRange {
    constructor(sheet, row, column, rowCount, columnCount) {
        this.sheet = sheet;
        this.row = row;
        this.column = column;
        this.rowCount = rowCount;
        this.columnCount = columnCount;
    }

    getDisplayValues() {
        return Array.from({ length: this.rowCount }, (_, rowOffset) =>
            Array.from({ length: this.columnCount }, (_, columnOffset) =>
                this.sheet.displayValue(
                    this.row + rowOffset,
                    this.column + columnOffset,
                ),
            ),
        );
    }

    setNumberFormat() {
        return this;
    }

    setValues(values) {
        if (
            values.length !== this.rowCount ||
            values.some((row) => row.length !== this.columnCount)
        ) {
            throw new Error(
                "Mock range dimensions do not match setValues input",
            );
        }
        values.forEach((row, rowOffset) => {
            row.forEach((value, columnOffset) => {
                this.sheet.setValue(
                    this.row + rowOffset,
                    this.column + columnOffset,
                    value,
                );
            });
        });
        this.sheet.operations.push({
            type: "setValues",
            row: this.row,
            column: this.column,
            rowCount: this.rowCount,
            columnCount: this.columnCount,
            values: values.map((row) =>
                row.map((value) => String(value ?? "")),
            ),
        });
        return this;
    }

    clearContent() {
        for (let rowOffset = 0; rowOffset < this.rowCount; rowOffset += 1) {
            for (
                let columnOffset = 0;
                columnOffset < this.columnCount;
                columnOffset += 1
            ) {
                this.sheet.setValue(
                    this.row + rowOffset,
                    this.column + columnOffset,
                    "",
                );
            }
        }
        this.sheet.operations.push({
            type: "clearContent",
            row: this.row,
            column: this.column,
            rowCount: this.rowCount,
            columnCount: this.columnCount,
        });
        return this;
    }
}

class MockSheet {
    constructor(name) {
        this.name = name;
        this.maxRows = 1_000;
        this.values = [];
        this.operations = [];
    }

    getRange(row, column, rowCount = 1, columnCount = 1) {
        return new MockRange(this, row, column, rowCount, columnCount);
    }

    getLastRow() {
        for (let index = this.values.length - 1; index >= 0; index -= 1) {
            if ((this.values[index] ?? []).some((value) => value !== "")) {
                return index + 1;
            }
        }
        return 0;
    }

    getMaxRows() {
        return this.maxRows;
    }

    insertRowsAfter(_afterPosition, rowCount) {
        this.maxRows += rowCount;
        return this;
    }

    setFrozenRows() {
        return this;
    }

    autoResizeColumns() {
        return this;
    }

    displayValue(row, column) {
        return this.values[row - 1]?.[column - 1] ?? "";
    }

    setValue(row, column, value) {
        while (this.values.length < row) {
            this.values.push([]);
        }
        const targetRow = this.values[row - 1];
        while (targetRow.length < column) {
            targetRow.push("");
        }
        const text = String(value ?? "");
        targetRow[column - 1] = /^'[=+\-@]/.test(text)
            ? text.slice(1)
            : text;
    }
}

class MockSpreadsheet {
    constructor(id) {
        this.id = id;
        this.sheets = new Map();
    }

    getSheetByName(name) {
        return this.sheets.get(name) ?? null;
    }

    insertSheet(name) {
        if (this.sheets.has(name)) {
            throw new Error(`Sheet already exists: ${name}`);
        }
        const sheet = new MockSheet(name);
        this.sheets.set(name, sheet);
        return sheet;
    }
}

function webSafeBase64(value) {
    const buffer =
        typeof value === "string"
            ? Buffer.from(value, "utf8")
            : Buffer.from(Array.from(value, (byte) => Number(byte) & 0xff));
    return buffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function createUtilities() {
    let uuidCounter = 0;
    return {
        DigestAlgorithm: { SHA_256: "SHA_256" },
        Charset: { UTF_8: "UTF_8" },
        computeDigest(_algorithm, value) {
            return [
                ...createHash("sha256")
                    .update(String(value), "utf8")
                    .digest(),
            ].map((byte) => (byte > 127 ? byte - 256 : byte));
        },
        computeHmacSha256Signature(value, key) {
            return [
                ...createHmac("sha256", String(key))
                    .update(String(value), "utf8")
                    .digest(),
            ].map((byte) => (byte > 127 ? byte - 256 : byte));
        },
        base64EncodeWebSafe(value) {
            return webSafeBase64(value);
        },
        base64DecodeWebSafe(value) {
            return [...Buffer.from(String(value), "base64url")].map((byte) =>
                byte > 127 ? byte - 256 : byte,
            );
        },
        newBlob(value) {
            const bytes =
                typeof value === "string"
                    ? Buffer.from(value, "utf8")
                    : Buffer.from(
                          Array.from(value, (byte) => Number(byte) & 0xff),
                      );
            return {
                getDataAsString() {
                    return bytes.toString("utf8");
                },
            };
        },
        getUuid() {
            uuidCounter += 1;
            const suffix = String(uuidCounter).padStart(12, "0");
            return `00000000-0000-4000-8000-${suffix}`;
        },
        formatDate(value) {
            return new Date(value).toISOString();
        },
    };
}

function plain(value) {
    return value === undefined
        ? undefined
        : JSON.parse(JSON.stringify(value));
}

export function createGasRuntime() {
    const scriptProperties = new MockScriptProperties();
    const spreadsheets = new Map();
    const lockEvents = [];
    let flushCount = 0;

    const SpreadsheetApp = {
        openById(id) {
            const spreadsheet = spreadsheets.get(String(id));
            if (!spreadsheet) {
                throw new Error(`Spreadsheet not found: ${id}`);
            }
            return spreadsheet;
        },
        flush() {
            flushCount += 1;
        },
    };
    const PropertiesService = {
        getScriptProperties() {
            return scriptProperties;
        },
    };
    const LockService = {
        getScriptLock() {
            return {
                waitLock(timeout) {
                    lockEvents.push({ type: "wait", timeout });
                },
                releaseLock() {
                    lockEvents.push({ type: "release" });
                },
            };
        },
    };
    const ScriptApp = {
        getService() {
            return { getUrl: () => "https://example.test/web-app" };
        },
    };
    const HtmlService = {
        createTemplateFromFile() {
            const output = {
                setTitle() {
                    return this;
                },
                addMetaTag() {
                    return this;
                },
            };
            return { evaluate: () => output };
        },
    };

    const context = vm.createContext({
        console,
        PropertiesService,
        SpreadsheetApp,
        LockService,
        Utilities: createUtilities(),
        ScriptApp,
        HtmlService,
    });
    vm.runInContext(readFileSync(SERVER_BUNDLE_URL, "utf8"), context, {
        filename: ".build/Code.js",
    });

    return {
        api: context,
        createSpreadsheet(id) {
            const key = String(id);
            const spreadsheet = new MockSpreadsheet(key);
            spreadsheets.set(key, spreadsheet);
            return spreadsheet;
        },
        getSheetNames(spreadsheetId) {
            const spreadsheet = spreadsheets.get(String(spreadsheetId));
            return spreadsheet ? [...spreadsheet.sheets.keys()] : [];
        },
        getSheetObjects(spreadsheetId, sheetName) {
            const sheet = spreadsheets
                .get(String(spreadsheetId))
                ?.getSheetByName(sheetName);
            if (!sheet || sheet.getLastRow() < 2) {
                return [];
            }
            const lastRow = sheet.getLastRow();
            const headers = sheet.getRange(1, 1, 1, 50).getDisplayValues()[0];
            const headerCount =
                headers.findLastIndex((value) => value !== "") + 1;
            return sheet
                .getRange(2, 1, lastRow - 1, headerCount)
                .getDisplayValues()
                .flatMap((row, index) => {
                    if (!row.some((value) => value !== "")) {
                        return [];
                    }
                    return [
                        {
                            rowNumber: index + 2,
                            ...Object.fromEntries(
                                headers
                                    .slice(0, headerCount)
                                    .map((header, column) => [
                                        header,
                                        row[column],
                                    ]),
                            ),
                        },
                    ];
                });
        },
        getSheetOperations(spreadsheetId, sheetName) {
            const sheet = spreadsheets
                .get(String(spreadsheetId))
                ?.getSheetByName(sheetName);
            return sheet ? plain(sheet.operations) : [];
        },
        getProperties() {
            return scriptProperties.getProperties();
        },
        getFlushCount() {
            return flushCount;
        },
        getLockEvents() {
            return plain(lockEvents);
        },
        plain,
    };
}
