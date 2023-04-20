import { HealthInformationChecks } from "./health-information-checks.model";

export class HealthInformation {
    up?: boolean;
    dataBase: HealthInformationChecks;
    blockBook: HealthInformationChecks;
    rskNode: HealthInformationChecks;
    bridgeService: HealthInformationChecks;
    apiVersion: string;
}
