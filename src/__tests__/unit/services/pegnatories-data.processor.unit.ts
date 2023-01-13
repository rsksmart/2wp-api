import {expect, sinon} from '@loopback/testlab';
import {PegnatoriesStatusDataService} from '../../../services/pegnatories-status-data-services/pegnatories-status-data.service';
import {PegnatoriesDataProcessor} from '../../../services/pegnatories-data.processor';
import {PegnatoriesStatusMongoDbDataService} from '../../../services/pegnatories-status-data-services/pegnatories-status-mongo.service';
import {SinonStubbedInstance} from 'sinon';
import {Transaction} from 'bridge-transaction-parser';
import {BRIDGE_EVENTS} from '../../../utils/bridge-utils';
import ExtendedBridgeTx from '../../../services/extended-bridge-tx';
import {bridge} from '@rsksmart/rsk-precompiled-abis';
import {PegnatoriesStatusDataModel} from '../../../models/rsk/pegnatories-status-data.model';
import {ExtendedBridgeEvent} from '../../../models/types/bridge-transaction-parser';

const blockHash =
  '0xe934eb559aa52270dcad6ca6a890b19ba8605381b90a72f4a19a850a2e79d660';

const rskTxHash =
  '0xe934eb559aa52270dcad6ca6a890b19ba8605381b90a72f4a19a850a2e79d660';

describe('Service: PegnatoriesDataProcessor', async () => {
  it('returns filters', () => {
    const mockedPegnatoriesStatusDataService = <PegnatoriesStatusDataService>{};

    const thisService = new PegnatoriesDataProcessor(
      mockedPegnatoriesStatusDataService,
    );
    expect(thisService.getFilters()).to.be.Array;
    expect(thisService.getFilters()).to.not.be.empty;
    expect(thisService.getFilters().length).to.equal(1);
  });

  it('persisting data', async () => {
    const mockedPegnatoriesStatusDataService = sinon.createStubInstance(
      PegnatoriesStatusMongoDbDataService,
    ) as SinonStubbedInstance<PegnatoriesStatusDataService>;

    const thisService = new PegnatoriesDataProcessor(
      mockedPegnatoriesStatusDataService,
    );

    const createdOn = new Date();

    const bridgeTransaction: Transaction = {
      txHash:
        '0x475b7b3203ec6673b5884160736a937c62dc5e6c6c948900d16314bcd0ab25b8',
      blockNumber: 1,
      method: {
        name: '',
        signature: '',
        arguments: new Map(),
      },
      events: [
        {
          name: BRIDGE_EVENTS.UPDATE_COLLECTIONS,
          signature:
            '0x8e04e2f2c246a91202761c435d6a4971bdc7af0617f0c739d900ecd12a6d7266',
          arguments: {sender: 'sender'},
        },
      ],
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn,
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events,
    };

    const events = extendedBridgeTx.events as ExtendedBridgeEvent[];

    await thisService.process(extendedBridgeTx);

    const data: PegnatoriesStatusDataModel = new PegnatoriesStatusDataModel(
      extendedBridgeTx.txHash,
      extendedBridgeTx.blockNumber,
      extendedBridgeTx.blockHash,
      events[0].arguments.sender,
      events[0].signature,
      createdOn,
      );
      
    sinon.assert.calledOnceWithMatch(mockedPegnatoriesStatusDataService.set, data);
  });
});
