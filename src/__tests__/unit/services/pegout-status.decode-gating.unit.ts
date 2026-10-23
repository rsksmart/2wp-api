import {expect} from '@loopback/testlab';
import sinon, {SinonStubbedInstance} from 'sinon';
import {
  PegoutStatusDbDataModel,
  PegoutStatuses,
} from '../../../models/rsk/pegout-status-data-model';
import {RskTransaction} from '../../../models/rsk/rsk-transaction.model';
import {PegoutStatusDataService} from '../../../services/pegout-status-data-services/pegout-status-data.service';
import {PegoutStatusService} from '../../../services/pegout-status/pegout-status.service';
import {RskNodeService} from '../../../services/rsk-node.service';
import {BRIDGE_METHODS, getBridgeSignature} from '../../../utils/bridge-utils';

const rskTxHash =
  '0xd2852f38fedf1915978715b8a0dc0670040ac4e9065989c810a5bf29c1e006fb';

const givenRskTransaction = (receipt: unknown): RskTransaction =>
  ({
    blockHash: '0x00002',
    hash: rskTxHash,
    // A pegout method. This used to be `receiveHeaders`, which the route now
    // refuses by selector before the receipt is even considered — and would
    // therefore have made these pass for the wrong reason.
    data: getBridgeSignature(BRIDGE_METHODS.RELEASE_BTC),
    createdOn: new Date(0),
    blockHeight: 1,
    to: '0x0000000000000000000000000000000001000006',
    value: 0,
    from: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
    receipt,
  } as unknown as RskTransaction);

/**
 * `GET /tx-status-by-type/{txId}/pegout` falls back to re-parsing the
 * transaction on a database miss. That fallback is unauthenticated and
 * re-triggerable after every restart, so it must never hand calldata to the ABI
 * decoder unless the EVM executed the transaction successfully — see
 * `isSuccessfulReceipt`.
 */
describe('Service: PegoutStatusService decode gating', () => {
  let pegoutStatusDataService: SinonStubbedInstance<PegoutStatusDataService>;
  let rskNodeService: SinonStubbedInstance<RskNodeService> & RskNodeService;
  let service: PegoutStatusService;

  beforeEach(() => {
    pegoutStatusDataService = {
      getLastByOriginatingRskTxHashNewest: sinon.stub().resolves(null),
    } as unknown as SinonStubbedInstance<PegoutStatusDataService>;
    rskNodeService = sinon.createStubInstance(
      RskNodeService,
    ) as SinonStubbedInstance<RskNodeService> & RskNodeService;
    service = new PegoutStatusService(
      pegoutStatusDataService as unknown as PegoutStatusDataService,
      rskNodeService,
    );
  });

  describe('transactions the EVM did not execute successfully', () => {
    const failedStatuses: unknown[] = [0, 0n, false, '0x0', '0'];

    failedStatuses.forEach(status => {
      it(`reports NOT_FOUND without parsing when status is ${String(status)}`, async () => {
        rskNodeService.getTransaction.resolves(givenRskTransaction({status}));

        const result = await service.getPegoutStatusByRskTxHash(rskTxHash);

        expect(result.status).to.equal(PegoutStatuses.NOT_FOUND);
        sinon.assert.notCalled(rskNodeService.getBridgeTransaction);
      });
    });

    it('fails closed on a receipt with no status field', async () => {
      rskNodeService.getTransaction.resolves(givenRskTransaction({}));

      const result = await service.getPegoutStatusByRskTxHash(rskTxHash);

      expect(result.status).to.equal(PegoutStatuses.NOT_FOUND);
      sinon.assert.notCalled(rskNodeService.getBridgeTransaction);
    });

    it('fails closed on an unrecognized status value', async () => {
      rskNodeService.getTransaction.resolves(givenRskTransaction({status: '0x2'}));

      const result = await service.getPegoutStatusByRskTxHash(rskTxHash);

      expect(result.status).to.equal(PegoutStatuses.NOT_FOUND);
      sinon.assert.notCalled(rskNodeService.getBridgeTransaction);
    });
  });

  describe('a transaction the node does not return', () => {
    it('answers NOT_FOUND, and answers at all', async () => {
      // `getTransaction` throws when the node has no such transaction, so this
      // branch is unreachable today. Unreachable is not the same as harmless:
      // the guard below it has no `else`, so the next line dereferences the
      // falsy value and the surrounding catch turns a programming error into a
      // status. And it must not be fixed with a bare `return` either — this code
      // runs inside a `.then()` that resolves at the end, so returning early
      // would leave the request hanging, which is the defect phase 06 removed
      // from this very service.
      rskNodeService.getTransaction.resolves(undefined as never);

      const result = await service.getPegoutStatusByRskTxHash(rskTxHash);

      expect(result.status).to.equal(PegoutStatuses.NOT_FOUND);
      sinon.assert.notCalled(rskNodeService.getBridgeTransaction);
    }).timeout(2000);
  });

  describe('transactions the EVM executed successfully', () => {
    [1, 1n, true, '0x1', '1'].forEach(status => {
      it(`parses the transaction when status is ${String(status)}`, async () => {
        rskNodeService.getTransaction.resolves(givenRskTransaction({status}));
        rskNodeService.getBridgeTransaction.resolves(undefined);

        const result = await service.getPegoutStatusByRskTxHash(rskTxHash);

        // The transaction itself, not its hash: the parser must decode the
        // bytes this service already fetched and bounded, not a copy it goes
        // and fetches for itself.
        sinon.assert.calledOnce(rskNodeService.getBridgeTransaction);
        expect(
          rskNodeService.getBridgeTransaction.firstCall.args[0].hash,
        ).to.equal(rskTxHash);
        // The parser found nothing usable, which is the existing NOT_FOUND path
        // — the point here is that parsing was attempted at all.
        expect(result.status).to.equal(PegoutStatuses.NOT_FOUND);
      });
    });
  });

  describe('transactions that are not yet mined', () => {
    it('reports PENDING without parsing when there is no receipt', async () => {
      rskNodeService.getTransaction.resolves(givenRskTransaction(null));

      const result = await service.getPegoutStatusByRskTxHash(rskTxHash);

      expect(result.status).to.equal(PegoutStatuses.PENDING);
      sinon.assert.notCalled(rskNodeService.getBridgeTransaction);
    });
  });

  describe('database hits', () => {
    it('does not touch the node when a stored status exists', async () => {
      pegoutStatusDataService.getLastByOriginatingRskTxHashNewest.resolves({
        status: PegoutStatuses.RELEASE_BTC,
        rskTxHash,
      } as unknown as PegoutStatusDbDataModel);

      await service.getPegoutStatusByRskTxHash(rskTxHash);

      sinon.assert.notCalled(rskNodeService.getTransaction);
      sinon.assert.notCalled(rskNodeService.getBridgeTransaction);
    });
  });
});
