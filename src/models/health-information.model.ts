import { HealthInformationChecks } from "./health-information-checks.model";

export class HealthInformation {
    status?: string;
    check: Array<HealthInformationChecks>;
}
  