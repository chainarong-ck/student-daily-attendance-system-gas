import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const pages = ["Index.html", "Admin.html", "Login.html", "Setup.html"];

try {
    for (const page of pages) {
        await build({
            plugins: [
                tailwindcss(),
                viteSingleFile({ removeViteModuleLoader: true }),
            ],
            root: "src/client",
            build: {
                outDir: "../../.build",
                emptyOutDir: false,
                rollupOptions: {
                    input: page,
                },
            },
        });
    }
} catch (error) {
    console.error("Error during client build:", error);
    process.exit(1);
}
