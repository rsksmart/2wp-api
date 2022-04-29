import {expect, sinon} from '@loopback/testlab';
import {PegoutStatusDataService} from '../../../services/pegout-status-data-services/pegout-status-data.service';
import {PegoutDataProcessor} from '../../../services/pegout-data.processor';
import {BridgeService} from '../../../services/bridge.service';
import {SinonStubbedInstance} from 'sinon';
import {RskTransaction} from '../../../models/rsk/rsk-transaction.model';
import {BridgeMethod} from 'bridge-transaction-parser';

describe('Service: PegoutDataProcessor', () => {

  it('returns filters', () => {
    const mockedPegoutStatusDataService = <PegoutStatusDataService>{};
    const mockedBridgeService = <BridgeService>{};
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, mockedBridgeService);
    expect(thisService.getFilters()).to.be.Array;
    expect(thisService.getFilters()).to.not.be.empty;
    expect(thisService.getFilters().length).to.equal(2);
  });

  it('returns btc destination address from tx release_requested_received event', async () => {

    const txHash = '0xe934eb559aa52270dcad6ca6a890b19ba8605381b90a72f4a19a850a2e79d660';
    const expectedBtcAddress = 'mpKPLWXnmqjtXyoqi5yRBYgmF4PswMGj55';
    const mockedBridgeService =
    sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;

    const bridgeMethod: BridgeMethod = <BridgeMethod> {};

    const tx = new RskTransaction();
    tx.hash = txHash;

    const bridgeTx = {
        txHash: txHash,
        method: bridgeMethod,
        events: [
          {
            name: 'release_request_received',
            signature: '0x8e04e2f2c246a91202761c435d6a4971bdc7af0617f0c739d900ecd12a6d7266',
            arguments: {
                sender: '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc',
                btcDestinationAddress: expectedBtcAddress,
                amount: '500000'
            }
          }
        ],
        blockNumber: 2790247
    };

    mockedBridgeService.getBridgeTransactionByHash.withArgs(txHash).resolves(<any>bridgeTx);

    const mockedPegoutStatusDataService = <PegoutStatusDataService>{};
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, mockedBridgeService);
    const returnedBtcAddress = await thisService.getBtcDestinationAddressFromTxReleaseRequestedReceivedEvent(tx);

    expect(returnedBtcAddress).to.equal(expectedBtcAddress);

  });

  it('returns null when event is not release_requested_received', async () => {

    const txHash = '0xe934eb559aa52270dcad6ca6a890b19ba8605381b90a72f4a19a850a2e79d660';
    const expectedBtcAddress = 'mpKPLWXnmqjtXyoqi5yRBYgmF4PswMGj55';
    const mockedBridgeService =
    sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;

    const bridgeMethod: BridgeMethod = <BridgeMethod> {};

    const tx = new RskTransaction();
    tx.hash = txHash;

    const bridgeTx = {
        txHash: txHash,
        method: bridgeMethod,
        events: [
          {
            name: 'release_request',
            signature: '0x8e04e2f2c246a91202761c435d6a4971bdc7af0617f0c739d900ecd12a6d7266',
            arguments: {
                sender: '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc',
                btcDestinationAddress: expectedBtcAddress,
                amount: '500000'
            }
          }
        ],
        blockNumber: 2790247
    };

    mockedBridgeService.getBridgeTransactionByHash.withArgs(txHash).resolves(<any>bridgeTx);

    const mockedPegoutStatusDataService = <PegoutStatusDataService>{};
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, mockedBridgeService);
    const returnedBtcAddress = await thisService.getBtcDestinationAddressFromTxReleaseRequestedReceivedEvent(tx);

    expect(returnedBtcAddress).to.equal(null);

  });
  
});
