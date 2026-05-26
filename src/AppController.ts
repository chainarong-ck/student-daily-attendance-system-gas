class AppController {
  private static instance: AppController;
  private authController: AuthController;
  private appPropertiesSetting: AppPropertiesSetting;

  private constructor() {
    this.authController = AuthController.getInstance();
    this.appPropertiesSetting = AppPropertiesSetting.getInstance();
  }

  public static getInstance() {
    if (!AppController.instance) {
      AppController.instance = new AppController();
    }
    return AppController.instance;
  }

  public static getWebAppUrl() {
    try {
      return ScriptApp.getService().getUrl() || "";
    } catch (error) {
      return "";
    }
  }

  public doGet(
    event: GoogleAppsScript.Events.DoGet,
  ): GoogleAppsScript.HTML.HtmlOutput {
    const params = event && event.parameter ? event.parameter : {};

    if (this.appPropertiesSetting.getRequiredFieldsMissing().length > 0) {
      return this.renderSetup();
    }

    const authToken = params[AuthController.AUTH_QUERY_PARAM] || "";
    if (!this.authController.isAuthorizedSession(authToken)) {
      return this.renderLogin();
    }

    return this.renderIndex(authToken);
  }

  private renderSetup(): GoogleAppsScript.HTML.HtmlOutput {
    const currentSpreadsheetId = this.appPropertiesSetting.getSpreadsheetId();
    const needsSpreadsheetId = !currentSpreadsheetId;
    const needsPassword = !this.appPropertiesSetting.getPassword();
    const containerSpreadsheet = SpreadsheetController.getActiveSpreadsheet();

    const template = HtmlService.createTemplateFromFile("Setup");
    template.appUrl = AppController.getWebAppUrl();
    template.currentSpreadsheetId = currentSpreadsheetId;
    template.needsSpreadsheetId = needsSpreadsheetId;
    template.needsPassword = needsPassword;
    template.containerSpreadsheet = containerSpreadsheet
      ? {
          id: containerSpreadsheet.getId(),
          name: containerSpreadsheet.getName(),
        }
      : null;

    return template
      .evaluate()
      .setTitle("ตั้งค่าระบบ - บันทึกการเข้าเรียนรายวัน")
      .addMetaTag("viewport", "width=device-width, initial-scale=1")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  private renderLogin(): GoogleAppsScript.HTML.HtmlOutput {
    const template = HtmlService.createTemplateFromFile("Login");
    template.appUrl = AppController.getWebAppUrl();
    return template
      .evaluate()
      .setTitle("เข้าสู่ระบบ - บันทึกการเข้าเรียนรายวัน")
      .addMetaTag("viewport", "width=device-width, initial-scale=1")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  private renderIndex(authToken: string): GoogleAppsScript.HTML.HtmlOutput {
    const template = HtmlService.createTemplateFromFile("Index");
    template.appUrl = AppController.getWebAppUrl();
    template.authToken = authToken;
    return template
      .evaluate()
      .setTitle("ระบบบันทึกการเข้าเรียนรายวัน")
      .addMetaTag("viewport", "width=device-width, initial-scale=1")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}
