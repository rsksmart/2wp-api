import { HealthInformationChecks } from "./health-information-checks.model";
import { ProviderHealthReport } from "./provider-health-report.model";

export class HealthInformation {
    up?: boolean;
    dataBase: HealthInformationChecks;
    blockBook: HealthInformationChecks;
    rskNode: HealthInformationChecks;
    bridgeService: HealthInformationChecks;
    apiVersion: string;
    /**
     * Provider health from the background job's stored results. Informational
     * only: a provider that is down does not change `up` or the status code.
     */
    providers: ProviderHealthReport[];
}
