
export class HealthInformationChecks {
    up?: boolean;
    info?: string;
    lastBtcBlockNumber: number;
    lastBtcBlockHash: string;
    lastRskBlockNumber: number;
    lastRskBlockHash: string;
}

export class BlockBoock extends HealthInformationChecks {
    totalBlocks: number;
    chain: string;
    syncing: boolean;
}

export class Federation extends HealthInformationChecks {
    federationAddress: string;
}
  