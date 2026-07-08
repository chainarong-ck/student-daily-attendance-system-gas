import type { AuthRole, LoginResult } from "../shared/types";
import { MainConfig } from "./MainConfig";
import { ServerConstant } from "./ServerConstant";
import { ServerUtils } from "./ServerUtils";

type TokenPayload = {
    role: AuthRole;
    exp: number;
};

export class AuthService {
    static hashPassword(password: string): string {
        const clean = password.trim();
        ServerUtils.assert(clean.length > 0, "ต้องระบุรหัสผ่าน");
        return ServerUtils.hashText(`pwd:${clean}`);
    }

    static login(role: AuthRole, password: string): LoginResult {
        MainConfig.requireInitialized();
        const expected = MainConfig.getPasswordHash(role);
        const actual = this.hashPassword(password);
        ServerUtils.assert(expected === actual, "รหัสผ่านไม่ถูกต้อง");
        const expiresAt = Date.now() + ServerConstant.LIMITS.tokenTtlMs;
        return {
            token: this.issueToken(role, expiresAt),
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

    private static issueToken(role: AuthRole, expiresAt: number): string {
        const payload = Utilities.base64EncodeWebSafe(
            JSON.stringify({ role, exp: expiresAt } satisfies TokenPayload),
        ).replace(/=+$/g, "");
        const signature = this.sign(payload);
        return `${payload}.${signature}`;
    }

    private static verifyToken(token: string, expectedRole: AuthRole): void {
        const [payload, signature] = token.split(".");
        ServerUtils.assert(Boolean(payload && signature), "กรุณาเข้าสู่ระบบใหม่");
        ServerUtils.assert(signature === this.sign(payload), "กรุณาเข้าสู่ระบบใหม่");
        const decoded = Utilities.newBlob(
            Utilities.base64DecodeWebSafe(payload),
        ).getDataAsString();
        const data = JSON.parse(decoded) as TokenPayload;
        ServerUtils.assert(data.role === expectedRole, "สิทธิ์การใช้งานไม่ถูกต้อง");
        ServerUtils.assert(Date.now() <= data.exp, "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
    }

    private static sign(payload: string): string {
        return ServerUtils.hashText(
            `${payload}:${MainConfig.getPasswordHash("app")}:${MainConfig.getPasswordHash(
                "admin",
            )}`,
        );
    }
}
