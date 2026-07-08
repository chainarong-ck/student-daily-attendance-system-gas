import { ServerConstant } from "./ServerConstant";

export class MainConfig {
    static isInitialized(): boolean {
        const initialized =
            PropertiesService.getScriptProperties().getProperty(
                ServerConstant.PROPERTY_KEYS.initialized,
            ) === "true";

        return initialized;
    }
}
