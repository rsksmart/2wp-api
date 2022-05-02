import {expect} from '@loopback/testlab';
import { PegoutStatusDataService } from '../../../services/pegout-status-data-services/pegout-status-data.service';
import { PegoutDataProcessor } from '../../../services/pegout-data.processor';
import {RskTransaction} from '../../../models/rsk/rsk-transaction.model';
import sinon from 'sinon';
import {Log} from '../../../models/rsk/log.model';
import {BRIDGE_EVENTS, BRIDGE_METHODS, encodeBridgeMethodParameters, getBridgeSignature} from '../../../utils/bridge-utils';
import {getRandomAddress} from '../../helper';
import {ensure0x, remove0x} from '../../../utils/hex-utils';
import { PegoutStatus, PegoutStatusDataModel } from '../../../models/rsk/pegout-status-data.model';

const txHash = '0x604aaf3de25d0ab07c209b564cf1a4e7084e8750eaef23bf89966a1d2e7f19ad';

const getFakeRegisterTransactionData = () => {
  const rawTx = ensure0x('0200000000010272c877b54c252ae3eaf4062ee80f8bc7d48e7d18269ecf319a0d7607def42e62000000004847304402202eb62bf7492cd45d8301ab6b4abfacd1a14d4bf74eb3c90aeb87f40b1d5be0ca022038ac9549765b7ad952c098e7b96dbc69cfc4ad0c5d4191e56fe618883a57057b01feffffffe679416ea007ea3515758bc5849dcabc423e840572074202d8cabbb532899e0f010000001716001468b4bdc83bda13fd1fe03a882508508f474fe3a8feffffff02438a1200000000001976a914a4cafae1627623d26e9bd72193beb863cd26b91088ac00e1f505000000001976a91499d7a8922b29bf765bc0ed4f208c29a1681d652988ac000247304402202c2dadda8ef412d58cbc30978257aee3c7e27add6d04e8d091b218a86e20263202204ebecb32500fe15075d9bc0ebc9709fd8df19fd560a695f9cabc7bf49874f1ff01210307d079a1a8d804c1f532104867114402a7b7eee84dfc01d73687e32c2677bb8474070000');
  return remove0x(encodeBridgeMethodParameters(
    BRIDGE_METHODS.UPDATE_COLLECTIONS,
    [rawTx, 1, ensure0x('')]
  ));
};

describe('Service: PegoutDataProcessor', () => {

  it('returns filters', () => {
    const mockedPegoutStatusDataService = <PegoutStatusDataService>{};
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService);
    const bridgeDataFilterModel = thisService.getFilters();
    expect(bridgeDataFilterModel).to.be.Array;
    expect(bridgeDataFilterModel).to.not.be.empty;
    expect(bridgeDataFilterModel.length).to.equal(2);
  });

  it('parses a transaction with no logs as null', () => {
    const mockedPeginStatusDataService = <PegoutStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();
    const tx = new RskTransaction();
    const thisService = new PegoutDataProcessor(mockedPeginStatusDataService);
    const result = thisService.parse(tx);

    expect(result).to.be.null;
  });

  it('reject TX with RELEASE_REQUEST_REJECTED', () => {
    const mockedPeginStatusDataService = <PegoutStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();

    const tx = new RskTransaction();
    tx.hash = txHash;
    const log = new Log();
    const values = getBridgeSignature(BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED);
    log.topics = [values];
    tx.logs.push(log);
    const thisService = new PegoutDataProcessor(mockedPeginStatusDataService);
    const result = thisService.parse(tx);

    expect(result).to.be.instanceOf(PegoutStatusDataModel);
    if (result) {
      expect(result.status).to.be.equal(PegoutStatus.REJECTED);
      expect(result.originatingRskTxHash).to.be.equal(txHash);
    }
  });

  it('receive TX with RELEASE_REQUEST_RECEIVED', () => {
    const mockedPeginStatusDataService = <PegoutStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();

    const tx = new RskTransaction();
    tx.hash = txHash;
    const log = new Log();
    const values = getBridgeSignature(BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED);
    log.topics = [values];
    tx.logs.push(log);
    const thisService = new PegoutDataProcessor(mockedPeginStatusDataService);
    const result = thisService.parse(tx);

    expect(result).to.be.instanceOf(PegoutStatusDataModel);
    if (result) {
      expect(result.status).to.be.equal(PegoutStatus.RECEIVED);
      expect(result.originatingRskTxHash).to.be.equal(txHash);
    }
  });
  
});
