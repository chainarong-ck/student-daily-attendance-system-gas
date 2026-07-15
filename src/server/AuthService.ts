import type { AuthRole, LoginResult } from "../shared/types";
import { MainConfig } from "./MainConfig";
import { ServerConstant } from "./ServerConstant";
import { ServerUtils } from "./ServerUtils";

type TokenPayload = {
    role: AuthRole;
    exp: number;
};

type AuthHashes = ReturnType<typeof MainConfig.getAuthHashes>;

export class AuthService {
    static hashPassword(password: string): string {
        const clean = password.trim();
        ServerUtils.assert(clean.length > 0, "ต้องระบุรหัสผ่าน");
        ServerUtils.assert(
            clean.length <= ServerConstant.LIMITS.passwordLength,
            `รหัสผ่านต้องยาวไม่เกิน ${ServerConstant.LIMITS.passwordLength} ตัวอักษร`,
        );
        return ServerUtils.hashText(`pwd:${clean}`);
    }

    static login(role: AuthRole, password: string): LoginResult {
        MainConfig.requireInitialized();
        const hashes = MainConfig.getAuthHashes();
        const expected = hashes[role];
        const actual = this.hashPassword(password);
        ServerUtils.assert(expected === actual, "รหัสผ่านไม่ถูกต้อง");
        const expiresAt = Date.now() + ServerConstant.LIMITS.tokenTtlMs;
        return {
            token: this.issueToken(role, expiresAt, hashes),
            role,
            expiresAt,
        };
    }

    static requireApp(token: string): void {
        this.verifyToken(token, "app");
    }

    static requireAdmin(token: string): void {
        this.verifyToken(token, "admin");
    }

    private static issueToken(
        role: AuthRole,
        expiresAt: number,
        hashes: AuthHashes,
    ): string {
        const payload = Utilities.base64EncodeWebSafe(
            JSON.stringify({ role, exp: expiresAt } satisfies TokenPayload),
        ).replace(/=+$/g, "");
        const signature = this.sign(payload, role, hashes);
        return `${payload}.${signature}`;
    }

    private static verifyToken(token: string, expectedRole: AuthRole): void {
        ServerUtils.assert(
            typeof token === "string" &&
                token.length <= ServerConstant.LIMITS.authTokenLength,
            "กรุณาเข้าสู่ระบบใหม่",
        );
        const parts = token.split(".");
        ServerUtils.assert(parts.length === 2, "กรุณาเข้าสู่ระบบใหม่");
        const [payload, signature] = parts;
        ServerUtils.assert(Boolean(payload && signature), "กรุณาเข้าสู่ระบบใหม่");
        ServerUtils.assert(
            signature === this.sign(payload, expectedRole),
            "กรุณาเข้าสู่ระบบใหม่",
        );
        try {
            const decoded = Utilities.newBlob(
                Utilities.base64DecodeWebSafe(this.withBase64Padding(payload)),
            ).getDataAsString();
            const data = JSON.parse(decoded) as TokenPayload;
            ServerUtils.assert(data.role === expectedRole, "สิทธิ์การใช้งานไม่ถูกต้อง");
            ServerUtils.assert(
                Date.now() <= data.exp,
                "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
            );
        } catch (error) {
            if (
                error instanceof Error &&
                (error.message.includes("Session") ||
                    error.message.includes("สิทธิ์"))
            ) {
                throw error;
            }
            throw new Error("กรุณาเข้าสู่ระบบใหม่");
        }
    }

    private static sign(
        payload: string,
        role: AuthRole,
        hashes: AuthHashes = MainConfig.getAuthHashes(),
    ): string {
        const signature = Utilities.computeHmacSha256Signature(
            `${payload}:${role}:${hashes[role]}`,
            MainConfig.getAuthSigningSecret(),
            Utilities.Charset.UTF_8,
        );
        return Utilities.base64EncodeWebSafe(signature).replace(/=+$/g, "");
    }

    private static withBase64Padding(value: string): string {
        const remainder = value.length % 4;
        return remainder === 0 ? value : `${value}${"=".repeat(4 - remainder)}`;
    }
}
