import {expect, sinon} from '@loopback/testlab';
import {BridgeService} from '../../services';
import BridgeTransactionParser from '@rsksmart/bridge-transaction-parser';
import { ethers } from 'ethers';
import * as constants from '../../constants';

const rskTxHash = '0xd2852f38fedf1915978715b8a0dc0670040ac4e9065989c810a5bf29c1e006fb';
const btcValidTxHash = '7006c53b81e644367bf736e07456af8a1ce487174fc6b5e398f6fa7b8d069daa';
const btcInvalidTxHash = '1234c53b81e644367bf736e07456af8a1ce487174fc6b5e398f6fa7b8d069daa';

describe('Service: Bridge', () => {
  let bridgeService: BridgeService;

  beforeEach(() => {
    bridgeService = new BridgeService();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return a valid BTC segwit or legacy federation address', async () => {
    const mockAddress = '2MxKEf2su6FGAUfCEAHreGFQvEYrfYNHvL7';
    sinon.stub(bridgeService, 'getFederationAddress').resolves(mockAddress);

    const legacyRegex = new RegExp('^[mn][1-9A-HJ-NP-Za-km-z]{26,35}');
    const segwitRegex = new RegExp('^[2][1-9A-HJ-NP-Za-km-z]{26,35}');
    const address = await bridgeService.getFederationAddress();
    expect(legacyRegex.test(address) || segwitRegex.test(address)).to.be.true();
  });

  it('should return the min value to pegin from bridge as number', async () => {
    const mockMinValue = 1000000;
    sinon.stub(bridgeService, 'getMinPeginValue').resolves(mockMinValue);

    const minValue = await bridgeService.getMinPeginValue();
    expect(minValue).to.be.Number();
  });

  it('return the Locking Cap from bridge as number', async () => {
    const mockLockingCap = 5000000000;
    sinon.stub(bridgeService, 'getLockingCapAmount').resolves(mockLockingCap);

    const lockingCap = await bridgeService.getLockingCapAmount();
    expect(lockingCap).to.be.Number();
  });

  it('returns true if tx hash was processed by bridge, false if not', async () => {
    const isBtcTxHashAlreadyProcessedStub = sinon.stub(bridgeService, 'isBtcTxHashAlreadyProcessed');
    isBtcTxHashAlreadyProcessedStub.withArgs(btcValidTxHash).resolves(true);
    isBtcTxHashAlreadyProcessedStub.withArgs(btcInvalidTxHash).resolves(false);

    const txProcessed = await bridgeService.isBtcTxHashAlreadyProcessed(btcValidTxHash);
    const txNotProcessed = await bridgeService.isBtcTxHashAlreadyProcessed(btcInvalidTxHash);

    expect(txProcessed).to.be.true();
    expect(txNotProcessed).to.be.false();

  });

  it('returns rbtc in circulation as number', async() => {
    const mockRbtcInCirculation = 10000000000000000000;
    sinon.stub(bridgeService, 'getRbtcInCirculation').resolves(mockRbtcInCirculation);

    const rbtc = await bridgeService.getRbtcInCirculation();
    expect(rbtc).to.be.Number();
  });

  it('returns pegin availability as number', async() => {
    const mockAvailability = 1000000000;
    sinon.stub(bridgeService, 'getPeginAvailability').resolves(mockAvailability);

    const availability = await bridgeService.getPeginAvailability();
    expect(availability).to.be.Number();
  });

  it('returns bridge transaction by hash', async () => {
    const mockResponse = {
      blockNumber: 2863627,
      blockTimestamp: 1234567890,
      events: [{
        name: 'lock_btc',
        signature: '0x123',
        arguments: {
          amount: '504237',
          btcTxHash: '0x1f789f91cb5cb6f76b91f19adcc89233f3447d7228d8798c4e94ef09fd6d8950',
          receiver: '0x2D623170Cb518434af6c02602334610f194818c1',
          senderBtcAddress: '0x413bfc1ab391bbedcfdbc45116c5a0a75e628fc4d7b955dfb99b0214d0f1be43'
        }
      }],
      method: {
        arguments: {
          height: '2195587',
          pmt: '0x4100000008',
          tx: '0x0100000001'
        }
      },
      sender: '0x0000000000000000000000000000000001000006',
      txHash: rskTxHash
    };

    const bridgeTransactionParser = new BridgeTransactionParser(new ethers.JsonRpcProvider(constants.TESTNET_RSK_NODE_HOST));
    sinon.stub(bridgeTransactionParser, 'getBridgeTransactionByTxHash').resolves(mockResponse as any);

    const response = await bridgeTransactionParser.getBridgeTransactionByTxHash(rskTxHash);
    expect(response).to.have.keys('blockNumber', 'blockTimestamp', 'events', 'method', 'sender', 'txHash');
    expect(response.events[0]).to.have.keys('arguments', 'name', 'signature');
    expect(response.events[0].arguments).to.have.keys('amount', 'btcTxHash', 'receiver', 'senderBtcAddress');
    expect(response.method).to.have.keys('arguments');
    expect(response.method.arguments).to.have.keys('height', 'pmt', 'tx');
  });

});
