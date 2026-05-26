class AppPropertiesController {
  private static instance: AppPropertiesController;
  public static FIELDS = {
    APP_SPREADSHEET_ID: "APP_SPREADSHEET_ID",
    APP_PASSWORD: "APP_PASSWORD",
  };
  private static REQUIRED_FIELDS = [
    AppPropertiesController.FIELDS.APP_SPREADSHEET_ID,
    AppPropertiesController.FIELDS.APP_PASSWORD,
  ];
  private scriptProperties: GoogleAppsScript.Properties.Properties;
  private data: { [key: string]: string };
  private loaded: boolean;

  private constructor() {
    this.scriptProperties = PropertiesService.getScriptProperties();
    this.data = {};
    this.loaded = false;
  }

  public static getInstance(): AppPropertiesController {
    if (!AppPropertiesController.instance) {
      AppPropertiesController.instance = new AppPropertiesController();
    }
    return AppPropertiesController.instance;
  }

  private loadProperties(): void {
    this.data = this.scriptProperties.getProperties();
    this.loaded = true;
  }

  public getSpreadsheetId(): string | null {
    if (!this.loaded) {
      this.loadProperties();
    }
    return this.data[AppPropertiesController.FIELDS.APP_SPREADSHEET_ID] || null;
  }

  public getPassword(): string | null {
    if (!this.loaded) {
      this.loadProperties();
    }
    return this.data[AppPropertiesController.FIELDS.APP_PASSWORD] || null;
  }

  public getRequiredFieldsMissing(): string[] {
    if (!this.loaded) {
      this.loadProperties();
    }
    const missingFields: string[] = [];
    for (const field of AppPropertiesController.REQUIRED_FIELDS) {
      if (!this.data[field] || this.data[field] === "") {
        missingFields.push(field);
      }
    }
    return missingFields;
  }

  public setSpreadsheetId(spreadsheetId: string): void {
    this.scriptProperties.setProperty(
      AppPropertiesController.FIELDS.APP_SPREADSHEET_ID,
      spreadsheetId,
    );
    this.data[AppPropertiesController.FIELDS.APP_SPREADSHEET_ID] = spreadsheetId;
  }

  public setPassword(password: string): void {
    this.scriptProperties.setProperty(
      AppPropertiesController.FIELDS.APP_PASSWORD,
      password,
    );
    this.data[AppPropertiesController.FIELDS.APP_PASSWORD] = password;
  }

  public setMultipleProperties(properties: { [key: string]: string }): void {
    const setData: { [key: string]: string } = {};

    for (const field of Object.values(AppPropertiesController.FIELDS)) {
      if (field in properties) {
        setData[field] = properties[field];
      }
    }

    if (Object.keys(setData).length > 0) {
      this.scriptProperties.setProperties(setData);
      Object.assign(this.data, setData);
    }
  }
}
