import {expect, sinon} from '@loopback/testlab';
import {SinonStubbedInstance} from 'sinon';
import {bridge} from '@rsksmart/rsk-precompiled-abis';
import {Transaction} from '@rsksmart/bridge-transaction-parser';
import {BridgeDataFilterModel} from '../../../models/bridge-data-filter.model';
import {RskBlock} from '../../../models/rsk/rsk-block.model';
import {RskTransaction} from '../../../models/rsk/rsk-transaction.model';
import {BridgeService} from '../../../services';
import FilteredBridgeTransactionProcessor from '../../../services/filtered-bridge-transaction-processor';
import {NodeBridgeDataProvider} from '../../../services/node-bridge-data.provider';
import {PeginDataProcessor} from '../../../services/pegin-data.processor';
import {RskNodeService} from '../../../services/rsk-node.service';
import {
  BRIDGE_METHODS,
  encodeBridgeMethodParameters,
  getBridgeSignature,
} from '../../../utils/bridge-utils';

const rskTxHash =
  '0xd2852f38fedf1915978715b8a0dc0670040ac4e9065989c810a5bf29c1e006fb';
const otherTxHash =
  '0x1111111111111111111111111111111111111111111111111111111111111111';

/** `registerBtcTransaction` — a selector the pegin processor subscribes to. */
const subscribedCalldata = (): string =>
  getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION) +
  encodeBridgeMethodParameters(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION, [
    '0x0100000001',
    2195587,
    '0x4100000008',
  ]).slice(2);

/**
 * The amplification payload: `receiveHeaders(bytes[])` declaring 2 040 entries
 * whose element offsets all alias the same 64 KiB region. Every offset is in
 * bounds, so nothing about the bytes themselves is malformed — following them
 * is what materializes ~134 MB and aborts the process.
 *
 * Built at a token size here: this test asserts the decoder is never reached,
 * so the suite must never actually hand this shape to ethers.
 */
const aliasedReceiveHeadersCalldata = (entries = 2040): string => {
  const word = (n: number | bigint) => BigInt(n).toString(16).padStart(64, '0');
  let args = word(0x20) + word(entries);
  for (let i = 0; i < entries; i += 1) {
    args += word(entries * 32);
  }
  args += word(64) + '41'.repeat(64);
  return `0xe5400e7b${args}`;
};

const givenTransaction = (data: string, hash = rskTxHash): RskTransaction => ({
  blockHash: '0x00002',
  hash,
  data,
  createdOn: new Date(0),
  blockHeight: 1,
  to: bridge.address,
  receipt: null,
});

const givenBlock = (...transactions: RskTransaction[]): RskBlock => ({
  height: 1,
  hash: '0x00002',
  parentHash: '0x00001',
  transactions,
});

const givenBridgeTx = () =>
  ({
    txHash: rskTxHash,
    blockNumber: 1,
    sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
    blockTimestamp: 0,
    method: {
      name: 'registerBtcTransaction',
      signature: '0x43dc0656',
      arguments: new Map(),
    },
    events: [],
  } as unknown as Transaction);

describe('Service: NodeBridgeDataProvider decode gating', () => {
  let bridgeService: SinonStubbedInstance<BridgeService> & BridgeService;
  let rskNodeService: SinonStubbedInstance<RskNodeService> & RskNodeService;
  let subscriber: SinonStubbedInstance<FilteredBridgeTransactionProcessor>;
  let provider: NodeBridgeDataProvider;

  beforeEach(() => {
    bridgeService = sinon.createStubInstance(
      BridgeService,
    ) as SinonStubbedInstance<BridgeService> & BridgeService;
    rskNodeService = sinon.createStubInstance(
      RskNodeService,
    ) as SinonStubbedInstance<RskNodeService> & RskNodeService;
    subscriber = sinon.createStubInstance(
      PeginDataProcessor,
    ) as SinonStubbedInstance<FilteredBridgeTransactionProcessor>;
    subscriber.getFilters.returns([
      new BridgeDataFilterModel(
        getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION),
      ),
    ]);
    bridgeService.getBridgeTransactionByHash.resolves(givenBridgeTx());
    provider = new NodeBridgeDataProvider(bridgeService, rskNodeService);
    provider.addSubscriber(subscriber);
  });

  describe('selector filtering, before any decode', () => {
    it('decodes a transaction a subscriber asked for', async () => {
      rskNodeService.getTransactionReceipt.resolves({status: 1});

      await provider.process(givenBlock(givenTransaction(subscribedCalldata())));

      sinon.assert.calledOnce(bridgeService.getBridgeTransactionByHash);
      sinon.assert.calledOnce(subscriber.process);
    });

    it('never decodes a method no subscriber asked for', async () => {
      await provider.process(
        givenBlock(givenTransaction(aliasedReceiveHeadersCalldata())),
      );

      sinon.assert.notCalled(bridgeService.getBridgeTransactionByHash);
      sinon.assert.notCalled(subscriber.process);
      // The receipt is not even fetched — the selector alone settles it.
      sinon.assert.notCalled(rskNodeService.getTransactionReceipt);
    });

    it('still delivers everything to a subscriber declaring no filters', async () => {
      subscriber.getFilters.returns([]);
      rskNodeService.getTransactionReceipt.resolves({status: 1});

      await provider.process(givenBlock(givenTransaction(subscribedCalldata())));

      sinon.assert.calledOnce(subscriber.process);
    });
  });

  describe('receipt-status gating', () => {
    const failedStatuses: unknown[] = [0, 0n, false, '0x0', '0', undefined, null];

    failedStatuses.forEach(status => {
      it(`never decodes a transaction whose receipt status is ${String(status)}`, async () => {
        rskNodeService.getTransactionReceipt.resolves({status});

        await provider.process(
          givenBlock(givenTransaction(subscribedCalldata())),
        );

        sinon.assert.notCalled(bridgeService.getBridgeTransactionByHash);
        sinon.assert.notCalled(subscriber.process);
      });
    });

    it('never decodes when there is no receipt at all', async () => {
      rskNodeService.getTransactionReceipt.resolves(null);

      await provider.process(givenBlock(givenTransaction(subscribedCalldata())));

      sinon.assert.notCalled(bridgeService.getBridgeTransactionByHash);
    });

    [1, 1n, true, '0x1', '1'].forEach(status => {
      it(`decodes a transaction whose receipt status is ${String(status)}`, async () => {
        rskNodeService.getTransactionReceipt.resolves({status});

        await provider.process(
          givenBlock(givenTransaction(subscribedCalldata())),
        );

        sinon.assert.calledOnce(bridgeService.getBridgeTransactionByHash);
      });
    });
  });

  describe('aliased-offset calldata regression', () => {
    it('never hands the aliased receiveHeaders payload to the decoder', async () => {
      rskNodeService.getTransactionReceipt.resolves({status: 0});

      await provider.process(
        givenBlock(givenTransaction(aliasedReceiveHeadersCalldata())),
      );

      sinon.assert.notCalled(bridgeService.getBridgeTransactionByHash);
    });

    it('keeps processing the rest of the block after skipping one', async () => {
      rskNodeService.getTransactionReceipt.resolves({status: 1});

      await provider.process(
        givenBlock(
          givenTransaction(aliasedReceiveHeadersCalldata()),
          givenTransaction(subscribedCalldata(), otherTxHash),
        ),
      );

      // The skipped transaction must not abort the sync: the following one is
      // still decoded and delivered.
      sinon.assert.calledOnceWithExactly(
        bridgeService.getBridgeTransactionByHash,
        otherTxHash,
      );
      sinon.assert.calledOnce(subscriber.process);
    });
  });

  describe('Bridge selectors the filters depend on', () => {
    // The app resolves rsk-precompiled-abis at the root while the parser uses
    // its own nested copy. Filtering now happens before the decode, so a
    // selector drifting between the two would silently stop indexing a method
    // rather than merely decoding it and throwing the result away.
    const pinned: [BRIDGE_METHODS, string][] = [
      [BRIDGE_METHODS.REGISTER_BTC_TRANSACTION, '0x43dc0656'],
      [BRIDGE_METHODS.UPDATE_COLLECTIONS, '0x0c5a9990'],
      [BRIDGE_METHODS.ADD_SIGNATURE, '0xf10b9c59'],
      [BRIDGE_METHODS.RELEASE_BTC, '0x80af2871'],
    ];

    pinned.forEach(([method, selector]) => {
      it(`${method} resolves to ${selector}`, () => {
        expect(getBridgeSignature(method)).to.equal(selector);
      });
    });

    it('targets the well-known Bridge address', () => {
      expect(bridge.address).to.equal(
        '0x0000000000000000000000000000000001000006',
      );
    });
  });
});
