import path from "node:path";
import { fileURLToPath } from "node:url";
import GasPlugin from "gas-webpack-plugin";
import webpack from "webpack";

const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);

const compiler = webpack({
    mode: "production",
    context: rootDir,
    entry: "./src/server/Code.ts",
    module: {
        rules: [
            {
                test: /(\.ts)$/,
                loader: "ts-loader",
                options: {
                    configFile: "tsconfig.webpack.json",
                },
            },
        ],
    },
    resolve: {
        extensions: [".ts"],
    },
    output: {
        path: path.join(rootDir, ".build"),
        filename: "Code.js",
        libraryTarget: "this",
    },
    plugins: [
        new GasPlugin({
            autoGlobalExportsFiles: ["**/*.ts"],
        }),
    ],
    target: ["web", "es2019"],
    optimization: {
        minimize: false,
    },
    devtool: false,
});

const stats = await new Promise((resolve, reject) => {
    compiler.run((error, result) => {
        compiler.close((closeError) => {
            if (error) {
                reject(error);
                return;
            }
            if (closeError) {
                reject(closeError);
                return;
            }
            resolve(result);
        });
    });
});

const output = stats.toString({
    colors: true,
    errors: true,
    warnings: true,
    modules: false,
    chunks: false,
    assets: true,
});

if (stats.hasErrors()) {
    console.error(output);
    process.exit(1);
}

if (stats.hasWarnings()) {
    console.warn(output);
}
