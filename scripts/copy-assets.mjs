import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync(".build", { recursive: true });
copyFileSync("appsscript.json", ".build/appsscript.json");
