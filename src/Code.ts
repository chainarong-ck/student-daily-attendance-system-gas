function doGet(e: GoogleAppsScript.Events.AppsScriptHttpRequestEvent) {
  const params = e.parameter;
  const name = params.name || 'World';
  return ContentService.createTextOutput(`Hello, ${name}!`);
}