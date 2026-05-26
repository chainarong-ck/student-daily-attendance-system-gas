class CacheController {
  private static instance: CacheController;

  public static getInstance(): CacheController {
    if (!CacheController.instance) {
      CacheController.instance = new CacheController();
    }
    return CacheController.instance;
  }

  public getCache(key: string): string | null {
    return CacheService.getScriptCache().get(key);
  }

  public setCache(
    key: string,
    value: string,
    expirationInSeconds: number,
  ): void {
    CacheService.getScriptCache().put(key, value, expirationInSeconds);
  }
}
