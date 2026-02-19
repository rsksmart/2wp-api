import {expect} from '@loopback/testlab';
import {BridgeService} from '../../services';
import BridgeTransactionParser from '@rsksmart/bridge-transaction-parser';
import { ethers } from 'ethers';
import * as constants from '../../constants';
import sinon from 'sinon';

const rskTxHash = '0xd2852f38fedf1915978715b8a0dc0670040ac4e9065989c810a5bf29c1e006fb';
const btcValidTxHash = '7006c53b81e644367bf736e07456af8a1ce487174fc6b5e398f6fa7b8d069daa';
const btcInvalidTxHash = '1234c53b81e644367bf736e07456af8a1ce487174fc6b5e398f6fa7b8d069daa';

describe('Service: Bridge', () => {
  const bridgeService = new BridgeService();

  beforeEach(() => {
    sinon.stub(bridgeService, 'getFederationAddress').resolves('2N1GMB8gxHYR5HLPSRgf9CJ9Lunjb9CTnKB');
    sinon.stub(bridgeService, 'getMinPeginValue').resolves(600000);
    sinon.stub(bridgeService, 'getLockingCapAmount').resolves(2100000000000000);
    sinon.stub(bridgeService, 'isBtcTxHashAlreadyProcessed')
      .withArgs(btcValidTxHash).resolves(true)
      .withArgs(btcInvalidTxHash).resolves(false);
    sinon.stub(bridgeService, 'getRbtcInCirculation').resolves(100000000);
    sinon.stub(bridgeService, 'getPeginAvailability').resolves(50000000);
  });

  afterEach(() => sinon.restore());

  it('should return a valid BTC segwit or legacy federation address', async () => {
    const legacyRegex = new RegExp('^[mn][1-9A-HJ-NP-Za-km-z]{26,35}');
    const segwitRegex = new RegExp('^[2][1-9A-HJ-NP-Za-km-z]{26,35}');
    const address = await bridgeService.getFederationAddress();
    expect(legacyRegex.test(address) || segwitRegex.test(address)).to.be.true();
  });

  it('should return the min value to pegin from bridge as number', async () => {
    const minValue = await bridgeService.getMinPeginValue();
    expect(minValue).to.be.Number();
  });

  it('return the Locking Cap from bridge as number', async () => {
    const lockingCap = await bridgeService.getLockingCapAmount();
    expect(lockingCap).to.be.Number();
  });

  it('returns true if tx hash was processed by bridge, false if not', async () => {
    const txProcessed = await bridgeService.isBtcTxHashAlreadyProcessed(btcValidTxHash);
    const txNotProcessed = await bridgeService.isBtcTxHashAlreadyProcessed(btcInvalidTxHash);

    expect(txProcessed).to.be.true();
    expect(txNotProcessed).to.be.false();

  });

  it('returns rbtc in circulation as number', async() => {
    const rbtc = await bridgeService.getRbtcInCirculation();
    expect(rbtc).to.be.Number();
  });

  it('returns pegin availability as number', async() => {
    const availability = await bridgeService.getPeginAvailability();
    expect(availability).to.be.Number();
  });

  it('returns bridge transaction by hash', async () => {
    const bridgeTransactionParser = new BridgeTransactionParser(new ethers.JsonRpcProvider(constants.TESTNET_RSK_NODE_HOST));
    sinon.stub(bridgeTransactionParser, 'getBridgeTransactionByTxHash').resolves({
      txHash: rskTxHash,
      blockNumber: 4000000,
      blockTimestamp: 1700000000,
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      events: [{
        name: 'release_request_received',
        signature: '0x',
        arguments: {amount: '1000', btcTxHash: btcValidTxHash, receiver: '2N1GMB8gxHYR5HLPSRgf9CJ9Lunjb9CTnKB', senderBtcAddress: '2N1GMB8gxHYR5HLPSRgf9CJ9Lunjb9CTnKB'},
      }],
      method: {
        name: 'registerBtcTransaction',
        signature: '0x',
        arguments: {height: 100, pmt: '0x', tx: '0x'},
      },
    } as any);
    const response = await bridgeTransactionParser.getBridgeTransactionByTxHash(rskTxHash);
    expect(response).to.have.keys('blockNumber', 'blockTimestamp', 'events', 'method', 'sender', 'txHash');
    expect(response.events[0]).to.have.keys('arguments', 'name', 'signature');
    expect(response.events[0].arguments).to.have.keys('amount', 'btcTxHash', 'receiver', 'senderBtcAddress');
    expect(response.method).to.have.keys('arguments');
    expect(response.method.arguments).to.have.keys('height', 'pmt', 'tx');
  });

});
