export class ServerUtils {
    /**
     *
     * @returns
     */
    static getWebAppUrl(): string {
        try {
            return ScriptApp.getService().getUrl();
        } catch {
            return "";
        }
    }

}
