import {expect, sinon} from '@loopback/testlab';
import {BridgeService} from '../../services';
import bridgeTransactionParser, {Transaction} from 'bridge-transaction-parser';

const rskTxHash = '0xd2852f38fedf1915978715b8a0dc0670040ac4e9065989c810a5bf29c1e006fb';
const btcValidTxHash = '7006c53b81e644367bf736e07456af8a1ce487174fc6b5e398f6fa7b8d069daa';
const btcInvalidTxHash = '1234c53b81e644367bf736e07456af8a1ce487174fc6b5e398f6fa7b8d069daa';

describe('Service: Bridge', () => {
  const bridgeService = new BridgeService();

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
    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: new Map()
      },
      events: [
        {
          name: 'pegin_btc',
          signature: '0x44cdc782a38244afd68336ab92a0b39f864d6c0b2a50fa1da58cafc93cd2ae5a',
          arguments: new Map()
        }
      ]
    };
    const promise = new Promise<Transaction>((resolve) => resolve(bridgeTransaction));
    sinon.stub(bridgeTransactionParser, 'getBridgeTransactionByTxHash').returns(promise);
    const response = await bridgeService.getBridgeTransactionByHash('0x0001');
    const expectedResponse = await promise;
    expect(response).to.equal(expectedResponse);
  });

});
