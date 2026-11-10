import {model, property} from '@loopback/repository';

/** One dependency check in `/health`. Which fields are set depends on the dependency. */
@model()
export class HealthInformationChecks {
    @property()
    up?: boolean;
    @property()
    info?: string;
    @property()
    lastBtcBlockNumber: number;
    @property()
    lastBtcBlockHash: string;
    @property()
    lastRskBlockNumber: number;
    @property()
    lastRskBlockHash: string;
}

@model()
export class BlockBoock extends HealthInformationChecks {
    @property()
    totalBlocks: number;
    @property()
    chain: string;
    @property()
    syncing: boolean;
}

@model()
export class Federation extends HealthInformationChecks {
    @property()
    federationAddress: string;
}
