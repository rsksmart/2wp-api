import {expect} from '@loopback/testlab';
import { PegoutStatusDataService } from '../../../services/pegout-status-data-services/pegout-status-data.service';
import { PegoutDataProcessor } from '../../../services/pegout-data.processor';
import {RskTransaction} from '../../../models/rsk/rsk-transaction.model';
import {Log} from '../../../models/rsk/log.model';
import {BRIDGE_EVENTS, BRIDGE_METHODS, getBridgeSignature} from '../../../utils/bridge-utils';
import { PegoutStatus, PegoutStatusDataModel } from '../../../models/rsk/pegout-status-data.model';
import {PegoutStatusMongoDbDataService} from '../../../services/pegout-status-data-services/pegout-status-mongo.service';
import sinon, {SinonStubbedInstance} from 'sinon';
import { PegoutStatusRulesService } from '../../../services/pegout-status/pegout-status-rules-services';

const txHash = '0x604aaf3de25d0ab07c209b564cf1a4e7084e8750eaef23bf89966a1d2e7f19ad';

const getStatusService = () => {
  const mockedPegoutStatusRulesService = sinon.createStubInstance(PegoutStatusRulesService)  as SinonStubbedInstance<PegoutStatusRulesService> & PegoutStatusRulesService;
  return mockedPegoutStatusRulesService;
};

const getStatusDataService = () => {
  const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
  return mockedPegoutStatusDataService;
}

describe('Service: PegoutDataProcessor', () => {

  it('returns filters', () => {
    const mockedPegoutStatusDataService = <PegoutStatusDataService>{};
    const mockedPegoutStatusRulesService = getStatusService();
    const thisService = new PegoutDataProcessor(mockedPegoutStatusRulesService, mockedPegoutStatusDataService);
    const bridgeDataFilterModel = thisService.getFilters();
    // eslint-disable-next-line no-unused-expressions
    expect(bridgeDataFilterModel).to.be.Array;
    // eslint-disable-next-line no-unused-expressions
    expect(bridgeDataFilterModel).to.not.be.empty;
    expect(bridgeDataFilterModel.length).to.equal(2);
  });

  it('parses a transaction with no logs as null', () => {
    const mockedPegoutStatusDataService = <PegoutStatusDataService>{};
    const mockedPegoutStatusRulesService = getStatusService();
    mockedPegoutStatusDataService.start = sinon.stub();
    mockedPegoutStatusDataService.stop = sinon.stub();

    const tx = new RskTransaction();
    const thisService = new PegoutDataProcessor(mockedPegoutStatusRulesService, mockedPegoutStatusDataService);
    const result = thisService.parse(tx);

    // eslint-disable-next-line no-unused-expressions
    expect(result).to.be.null;
  });

  it('reject TX with RELEASE_REQUEST_REJECTED', () => {
    const mockedPegoutStatusDataService = <PegoutStatusDataService>{};
    const mockedPegoutStatusRulesService = getStatusService();
    mockedPegoutStatusDataService.start = sinon.stub();
    mockedPegoutStatusDataService.stop = sinon.stub();

    const retorno = new PegoutStatusDataModel();
    retorno.status = PegoutStatus.REJECTED;
    mockedPegoutStatusRulesService.searchStatus.onCall(0).returns(retorno);

    const tx = new RskTransaction();
    tx.hash = txHash;
    const log = new Log();
    const values = getBridgeSignature(BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED);
    log.topics = [values];
    tx.logs.push(log);
    const thisService = new PegoutDataProcessor(mockedPegoutStatusRulesService, mockedPegoutStatusDataService);
    const result = thisService.parse(tx);

    expect(result).to.be.instanceOf(PegoutStatusDataModel);
    if (result) {
      expect(result.status).to.be.equal(PegoutStatus.REJECTED);
      expect(result.originatingRskTxHash).to.be.equal(txHash);
    }
  });

  it('receive TX with RELEASE_REQUEST_RECEIVED', () => {
    const mockedPegoutStatusDataService = <PegoutStatusDataService>{};
    const mockedPegoutStatusRulesService = getStatusService();
    mockedPegoutStatusDataService.start = sinon.stub();
    mockedPegoutStatusDataService.stop = sinon.stub();

    const retorno = new PegoutStatusDataModel();
    retorno.status = PegoutStatus.RECEIVED;
    mockedPegoutStatusRulesService.searchStatus.onCall(0).returns(retorno);

    const tx = new RskTransaction();
    tx.hash = txHash;
    const log = new Log();
    const values = getBridgeSignature(BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED);
    log.topics = [values];
    tx.logs.push(log);
    const thisService = new PegoutDataProcessor(mockedPegoutStatusRulesService, mockedPegoutStatusDataService);
    const result = thisService.parse(tx);
    
    expect(result).to.be.instanceOf(PegoutStatusDataModel);
    if (result) {
      expect(result.status).to.be.equal(PegoutStatus.RECEIVED);
      expect(result.originatingRskTxHash).to.be.equal(txHash);
    }
  });

  it('processes pegout valid transaction', async () => {
    const mockedPegoutStatusDataService = getStatusDataService();
    const mockedPegoutStatusRulesService = getStatusService();
    mockedPegoutStatusRulesService.searchStatus = sinon.stub();
    const retorno = new PegoutStatusDataModel();
    retorno.status = PegoutStatus.RECEIVED;
    mockedPegoutStatusRulesService.searchStatus.onCall(0).returns(retorno);

    const tx = new RskTransaction();
    tx.data = getBridgeSignature(BRIDGE_METHODS.UPDATE_COLLECTIONS);
    const log = new Log();
    log.topics = [getBridgeSignature(BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED)];
    tx.logs.push(log);
    const thisService = new PegoutDataProcessor(mockedPegoutStatusRulesService, mockedPegoutStatusDataService);
    await thisService.process(tx);
    sinon.assert.calledOnce(mockedPegoutStatusDataService.set);
  });

  it('processes pegout rejected transaction', async () => {
    const mockedPegoutStatusDataService = getStatusDataService();
    const mockedPegoutStatusRulesService = getStatusService();
    mockedPegoutStatusRulesService.searchStatus = sinon.stub();
    const retorno = new PegoutStatusDataModel();
    retorno.status = PegoutStatus.REJECTED;
    mockedPegoutStatusRulesService.searchStatus.onCall(0).returns(retorno);

    const tx = new RskTransaction();
    tx.data = getBridgeSignature(BRIDGE_METHODS.UPDATE_COLLECTIONS);
    const log = new Log();
    log.topics = [getBridgeSignature(BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED)];
    tx.logs.push(log);
    const thisService = new PegoutDataProcessor(mockedPegoutStatusRulesService, mockedPegoutStatusDataService);
    await thisService.process(tx);
    sinon.assert.calledOnce(mockedPegoutStatusDataService.set);
  });
  
});
