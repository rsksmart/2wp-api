import {model, property} from '@loopback/repository';
import { BlockBoock, Federation, HealthInformationChecks } from "./health-information-checks.model";
import { ProviderHealthReport } from "./provider-health-report.model";

/** The body of `GET /health`. The decorators are the route's OpenAPI schema. */
@model()
export class HealthInformation {
    @property({required: true})
    up?: boolean;
    @property({required: true})
    dataBase: HealthInformationChecks;
    @property({required: true})
    blockBook: BlockBoock;
    @property({required: true})
    rskNode: HealthInformationChecks;
    @property({required: true})
    bridgeService: Federation;
    @property({required: true})
    apiVersion: string;
    /**
     * Provider health from the background job's stored results. Informational
     * only: a provider that is down does not change `up` or the status code.
     */
    @property.array(ProviderHealthReport, {required: true})
    providers: ProviderHealthReport[];
}
