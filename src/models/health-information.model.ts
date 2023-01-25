import { HealthInformationChecks } from "./health-information-checks.model";

export class HealthInformation {
    up?: boolean;
    check: Array<HealthInformationChecks>;
}
  