class AuthController {
  public static AUTH_QUERY_PARAM = "auth";
  private static instance: AuthController;
  private static AUTH_CACHE_PREFIX = "APP_AUTH_SESSION_";
  private static AUTH_SESSION_TIME = 6 * 60 * 60;

  public static getInstance() {
    if (!AuthController.instance) {
      AuthController.instance = new AuthController();
    }
    return AuthController.instance;
  }

  public isAuthorizedSession(token: string): boolean {
    if (token.length === 0 || token.length > 160) {
      return false;
    }
    const cache = CacheController.getInstance();
    const cacheKey = AuthController.AUTH_CACHE_PREFIX + token;
    const isValid = cache.getCache(cacheKey) === "1";

    if (isValid) {
      cache.setCache(cacheKey, "1", AuthController.AUTH_SESSION_TIME);
    }

    return isValid;
  }

  private createSessionToken() {
    return [
      Utilities.getUuid().replace(/-/g, ""),
      Utilities.getUuid().replace(/-/g, ""),
    ].join("");
  }

  public verifyLoginPassword(password: string): string | null {
    const appPassword = AppPropertiesSetting.getInstance().getPassword();

    if (password !== appPassword) {
      return null;
    }

    const token = this.createSessionToken();

    CacheController.getInstance().setCache(
      AuthController.AUTH_CACHE_PREFIX + token,
      "1",
      AuthController.AUTH_SESSION_TIME,
    );

    return token;
  }
}
