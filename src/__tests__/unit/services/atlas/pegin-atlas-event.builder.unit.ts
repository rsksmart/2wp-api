import {expect} from '@loopback/testlab';
import Ajv, {ValidateFunction} from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import {
  ATLAS_SCHEMA_VERSION,
  ATLAS_SOURCE,
  ATLAS_SWAP_TYPE,
  AtlasEventType,
  SwapCompletedData,
  SwapCreatedData,
  SwapRejectedData,
} from '../../../../models/atlas/atlas-event.model';
import {
  PeginAtlasEventBuilder,
  PeginAtlasEventContext,
} from '../../../../services/atlas/pegin-atlas-event.builder';
import {
  PeginStatus,
  PeginStatusDataModel,
} from '../../../../models/rsk/pegin-status-data.model';
import ExtendedBridgeTx from '../../../../services/extended-bridge-tx';

const SCHEMA_PATH = path.resolve(process.cwd(), 'schemas/atlas-swap-event.schema.json');

const btcTxId = '0x1f789f91cb5cb6f76b91f19adcc89233f3447d7228d8798c4e94ef09fd6d8950';
const createdOn = new Date('2024-05-01T10:00:00.000Z');
const receiver = '0x2D623170Cb518434af6c02602334610f194818c1';

function givenPegin(status: PeginStatus): PeginStatusDataModel {
  const pegin = new PeginStatusDataModel();
  pegin.btcTxId = btcTxId;
  pegin.status = status;
  pegin.createdOn = createdOn;
  pegin.rskTxId = '0xd2852f38fedf1915978715b8a0dc0670040ac4e9065989c810a5bf29c1e006fb';
  pegin.rskBlockHeight = 1;
  pegin.rskRecipient = receiver;
  return pegin;
}

/**
 * A `registerBtcTransaction` transaction carrying exactly `events`, which is
 * all `extractContext` reads.
 */
function givenTx(events: Array<{name: string; arguments: Record<string, unknown>}>) {
  return <ExtendedBridgeTx> <unknown> {
    txHash: '0xd2852f38fedf1915978715b8a0dc0670040ac4e9065989c810a5bf29c1e006fb',
    blockNumber: 1,
    createdOn: createdOn,
    events,
  };
}

describe('Service: PeginAtlasEventBuilder', () => {
  const originalNetwork = process.env.NETWORK;
  let validate: ValidateFunction;

  before(() => {
    const ajv = new Ajv({allErrors: true});
    addFormats(ajv);
    validate = ajv.compile(JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')));
  });

  beforeEach(() => {
    process.env.NETWORK = 'testnet';
  });

  after(() => {
    if (originalNetwork === undefined) {
      delete process.env.NETWORK;
    } else {
      process.env.NETWORK = originalNetwork;
    }
  });

  const expectValid = (event: unknown) => {
    if (!validate(event)) {
      throw new Error(`event does not match the schema: ${JSON.stringify(validate.errors)}`);
    }
  };

  describe('LOCKED', () => {
    const context: PeginAtlasEventContext = {
      amountInSatoshis: '50000000',
      rskRecipient: receiver,
    };

    it('builds swap.created then swap.completed for a LOCKED pegin', () => {
      const events = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.LOCKED), context);

      expect(events).to.have.length(2);
      expect(events[0].event_type).to.equal(AtlasEventType.SWAP_CREATED);
      expect(events[1].event_type).to.equal(AtlasEventType.SWAP_COMPLETED);
      expect(events[0].swap_id).to.equal(events[1].swap_id);
    });

    // A peg-in is credited in the same Rootstock transaction the daemon is
    // reading, so the destination tx is that one, not the Bitcoin deposit.
    it('points destination_tx_hash at the Rootstock transaction, normalized', () => {
      const pegin = givenPegin(PeginStatus.LOCKED);
      pegin.rskTxId = '0xD2852F38FEDF1915978715B8A0DC0670040AC4E9065989C810A5BF29C1E006FB';

      const [, completed] = PeginAtlasEventBuilder.build(pegin, context);

      expect((completed.data as SwapCompletedData).destination_tx_hash)
        .to.equal('0xd2852f38fedf1915978715b8a0dc0670040ac4e9065989c810a5bf29c1e006fb');
    });

    it('reports the whole amount as output_amount and a zero fee', () => {
      const [created, completed] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.LOCKED),
        context,
      );
      const completedData = completed.data as SwapCompletedData;

      // The Bridge credits the full amount that was sent; there is no peg-in
      // fee to subtract.
      expect(completedData.output_amount).to.equal('0.50000000');
      expect(completedData.output_amount).to.equal((created.data as SwapCreatedData).input_amount);
      expect(completedData.fee).to.equal('0.00000000');
      expect(completedData.output_amount_usd).to.be.null();
    });

    // The daemon only sees Rootstock: when the deposit was broadcast on Bitcoin
    // is unknown, and a zero would drag the average duration down.
    it('leaves duration_ms null: the Bitcoin broadcast time is unknown', () => {
      const [, completed] = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.LOCKED), context);

      expect((completed.data as SwapCompletedData).duration_ms).to.be.null();
    });

    it('gives the two events distinct event_ids', () => {
      const [created, completed] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.LOCKED),
        context,
      );

      expect(created.event_id).to.not.equal(completed.event_id);
    });

    it('fills the envelope from the persisted status', () => {
      const [event] = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.LOCKED), context);

      expect(event.swap_id).to.equal(btcTxId);
      expect(event.swap_type).to.equal(ATLAS_SWAP_TYPE);
      expect(event.source).to.equal(ATLAS_SOURCE);
      expect(event.schema_version).to.equal(ATLAS_SCHEMA_VERSION);
      expect(event.emitted_at).to.equal('2024-05-01T10:00:00.000Z');
    });

    it('points the chains from Bitcoin to Rootstock', () => {
      const [event] = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.LOCKED), context);
      const data = event.data as SwapCreatedData;

      expect(data.source_chain).to.equal('bitcoin_testnet');
      expect(data.destination_chain).to.equal('rootstock_testnet');
      expect(data.input_asset).to.equal('BTC');
      expect(data.output_asset).to.equal('RBTC');
    });

    it('uses mainnet chain ids when NETWORK is mainnet', () => {
      process.env.NETWORK = 'mainnet';
      const [event] = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.LOCKED), context);
      const data = event.data as SwapCreatedData;

      expect(data.source_chain).to.equal('bitcoin_mainnet');
      expect(data.destination_chain).to.equal('rootstock_mainnet');
    });

    it('leaves every *_usd field, wallet_type and quote_id null', () => {
      const [event] = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.LOCKED), context);
      const data = event.data as SwapCreatedData;

      expect(data.input_amount_usd).to.be.null();
      expect(data.wallet_type).to.be.null();
      expect(data.quote_id).to.be.null();
    });

    it('validates both against the JSON Schema', () => {
      const events = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.LOCKED), context);

      expect(events).to.have.length(2);
      events.forEach(expectValid);
    });
  });

  describe('amount conversion', () => {
    const amountOf = (amountInSatoshis?: string) => {
      const [event] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.LOCKED),
        {amountInSatoshis, rskRecipient: receiver},
      );
      return (event.data as SwapCreatedData).input_amount;
    };

    // `pegin_btc` / `lock_btc` report satoshis, unlike the peg-out logs which
    // report weis. Verified on testnet: block 7140002 logged amount=50000000
    // and credited the receiver 0.5 RBTC.
    it('reads the peg-in amount as satoshis, not weis', () => {
      expect(amountOf('50000000')).to.equal('0.50000000');
    });

    it('renders a single satoshi', () => {
      expect(amountOf('1')).to.equal('0.00000001');
    });

    it('renders a whole unit without losing precision', () => {
      expect(amountOf('100000000')).to.equal('1.00000000');
    });

    it('renders a missing amount as zero', () => {
      expect(amountOf(undefined)).to.equal('0.00000000');
    });

    it('does not collapse a realistic peg-in to zero', () => {
      for (const satoshis of ['50000000', '500000', '510000']) {
        expect(amountOf(satoshis)).to.not.equal('0.00000000');
      }
    });
  });

  describe('rejections', () => {
    it('emits swap.created before swap.rejected', () => {
      const events = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.REJECTED_REFUND), {});

      expect(events).to.have.length(2);
      expect(events[0].event_type).to.equal(AtlasEventType.SWAP_CREATED);
      expect(events[1].event_type).to.equal(AtlasEventType.SWAP_REJECTED);
      expect(events[0].swap_id).to.equal(events[1].swap_id);
    });

    it('marks a refundable rejection as such', () => {
      const [, rejected] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_REFUND),
        {rejectedReason: '3'},
      );
      const data = rejected.data as SwapRejectedData;

      expect(data.refund_applicable).to.be.true();
      expect(data.error_category).to.equal('protocol_violation');
      expect(data.error_code).to.equal('LEGACY_PEGIN_UNDETERMINED_SENDER');
    });

    it('marks an unrefundable rejection as terminal', () => {
      const [, rejected] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_NO_REFUND),
        {rejectedReason: '5', unrefundableReason: '3'},
      );
      const data = rejected.data as SwapRejectedData;

      expect(data.refund_applicable).to.be.false();
      expect(data.error_category).to.equal('validation');
      expect(data.error_code).to.equal('INVALID_AMOUNT');
    });

    it('falls back to UNKNOWN when the Bridge reason is absent', () => {
      const [, refundable] = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.REJECTED_REFUND), {});
      const [, terminal] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_NO_REFUND),
        {unrefundableReason: '1'},
      );

      expect((refundable.data as SwapRejectedData).error_code).to.equal('UNKNOWN');
      expect((refundable.data as SwapRejectedData).error_category).to.equal('validation');
      expect((terminal.data as SwapRejectedData).error_code).to.equal('UNKNOWN');
    });

    it('uses the rejected_pegin reason as the error_code in both branches', () => {
      const [, refundable] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_REFUND),
        {rejectedReason: '4'},
      );
      // The unrefundable reason names a different enum value for the same
      // number; the code must still come from rejected_pegin, the root cause.
      const [, terminal] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_NO_REFUND),
        {rejectedReason: '4', unrefundableReason: '3'},
      );

      expect((refundable.data as SwapRejectedData).error_code).to.equal('PEGIN_V1_INVALID_PAYLOAD');
      expect((terminal.data as SwapRejectedData).error_code).to.equal('PEGIN_V1_INVALID_PAYLOAD');
    });

    it('keeps both raw reason numbers in the error_message', () => {
      const [, rejected] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_NO_REFUND),
        {rejectedReason: '5', unrefundableReason: '3'},
      );
      const {error_message: message} = rejected.data as SwapRejectedData;

      expect(message).to.match(/rejected_pegin reason=5/);
      expect(message).to.match(/unrefundable_pegin reason=3/);
    });

    it('names the unrefundable reason in the error_message', () => {
      const [, rejected] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_NO_REFUND),
        {rejectedReason: '5', unrefundableReason: '2'},
      );
      const {error_message: message} = rejected.data as SwapRejectedData;

      expect(message).to.match(/PEGIN_V1_REFUND_ADDRESS_NOT_SET/);
      expect(message).to.match(/not refundable/);
    });

    it('validates every error_code against the schema enum', () => {
      for (const rejectedReason of ['1', '2', '3', '4', '5', '6', undefined]) {
        PeginAtlasEventBuilder.build(
          givenPegin(PeginStatus.REJECTED_REFUND),
          {rejectedReason},
        ).forEach(expectValid);

        for (const unrefundableReason of ['1', '2', '3', '4', '9']) {
          PeginAtlasEventBuilder.build(
            givenPegin(PeginStatus.REJECTED_NO_REFUND),
            {rejectedReason, unrefundableReason},
          ).forEach(expectValid);
        }
      }
    });

    it('travels without amount or wallet, which the rejection logs do not carry', () => {
      const [created] = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.REJECTED_REFUND), {});
      const data = created.data as SwapCreatedData;

      expect(data.input_amount).to.equal('0.00000000');
      expect(data.wallet_address).to.be.null();
    });

    it('validates both events against the JSON Schema', () => {
      PeginAtlasEventBuilder.build(givenPegin(PeginStatus.REJECTED_REFUND), {rejectedReason: '3'})
        .forEach(expectValid);
      PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_NO_REFUND),
        {rejectedReason: '5', unrefundableReason: '3'},
      ).forEach(expectValid);
    });
  });

  it('builds no event for an unknown status', () => {
    const pegin = givenPegin('SOMETHING_ELSE' as PeginStatus);

    expect(PeginAtlasEventBuilder.build(pegin, {})).to.be.empty();
  });

  it('generates a distinct event_id per event', () => {
    const first = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.LOCKED), {});
    const second = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.LOCKED), {});

    expect(first[0].event_id).to.not.equal(second[0].event_id);
  });

  it('throws when NETWORK is not configured instead of guessing the network', () => {
    delete process.env.NETWORK;

    expect(() => PeginAtlasEventBuilder.build(givenPegin(PeginStatus.LOCKED), {})).to.throw(/NETWORK/);
  });

  describe('rejection with no refund branch', () => {
    // The Bridge logged the rejection and then no refund branch at all: no
    // release_requested, no unrefundable_pegin. The code names what was
    // observed, not the suspected cause, which the logs do not carry.
    it('uses PEGIN_REJECTED_NO_REFUND_BRANCH when the unrefundable reason is absent', () => {
      const [, rejected] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_NO_REFUND),
        {rejectedReason: '3'},
      );
      const data = rejected.data as SwapRejectedData;

      expect(data.error_code).to.equal('PEGIN_REJECTED_NO_REFUND_BRANCH');
      expect(data.refund_applicable).to.be.false();
      expect(data.error_message).to.match(/no refund branch/i);
      expect(data.error_message).to.match(/rejected_pegin reason=3/);
    });

    it('derives the category from the rejected_pegin reason it does have', () => {
      const senderViolation = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_NO_REFUND),
        {rejectedReason: '2'},
      )[1].data as SwapRejectedData;
      const amountRejection = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_NO_REFUND),
        {rejectedReason: '5'},
      )[1].data as SwapRejectedData;

      expect(senderViolation.error_category).to.equal('protocol_violation');
      expect(amountRejection.error_category).to.equal('validation');
      expect(senderViolation.error_code).to.equal('PEGIN_REJECTED_NO_REFUND_BRANCH');
      expect(amountRejection.error_code).to.equal('PEGIN_REJECTED_NO_REFUND_BRANCH');
    });

    it('keeps naming the reason when the unrefundable log is present', () => {
      const [, rejected] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_NO_REFUND),
        {rejectedReason: '3', unrefundableReason: '1'},
      );

      expect((rejected.data as SwapRejectedData).error_code)
        .to.equal('LEGACY_PEGIN_UNDETERMINED_SENDER');
    });

    it('validates against the JSON Schema', () => {
      for (const rejectedReason of ['1', '2', '3', '4', '5', '7', undefined]) {
        PeginAtlasEventBuilder.build(
          givenPegin(PeginStatus.REJECTED_NO_REFUND),
          {rejectedReason},
        ).forEach(expectValid);
      }
    });
  });

  describe('extractContext', () => {
    const peginBtc = (amount: string) => ({
      name: 'pegin_btc',
      arguments: {receiver, btcTxHash: btcTxId, amount, protocolVersion: '1'},
    });

    const lockBtc = (amount: string) => ({
      name: 'lock_btc',
      arguments: {
        receiver,
        senderBtcAddress: 'mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8',
        btcTxHash: btcTxId,
        amount,
      },
    });

    const rejectedPegin = (reason: string) => ({
      name: 'rejected_pegin',
      arguments: {btcTxHash: btcTxId, reason},
    });

    const releaseRequested = (amount: string) => ({
      name: 'release_requested',
      arguments: {
        rskTxHash: '0xd2852f38fedf1915978715b8a0dc0670040ac4e9065989c810a5bf29c1e006fb',
        btcTxHash: btcTxId,
        amount,
      },
    });

    const unrefundablePegin = (reason: string) => ({
      name: 'unrefundable_pegin',
      arguments: {btcTxHash: btcTxId, reason},
    });

    // `release_requested.amount` is `computeTotalAmountSent(btcTx)` on the
    // Bridge side: what the user sent to the federation, in satoshis. It is the
    // only place a refundable rejection reports an amount at all.
    it('reads the amount from release_requested when there is no pegin_btc', () => {
      const context = PeginAtlasEventBuilder.extractContext(
        givenTx([rejectedPegin('4'), releaseRequested('50000000')]),
      );

      expect(context.amountInSatoshis).to.equal('50000000');
    });

    it('prefers the pegin_btc amount over release_requested when both are present', () => {
      const context = PeginAtlasEventBuilder.extractContext(
        givenTx([peginBtc('50000000'), releaseRequested('1')]),
      );

      expect(context.amountInSatoshis).to.equal('50000000');
    });

    it('prefers the lock_btc amount over release_requested when both are present', () => {
      const context = PeginAtlasEventBuilder.extractContext(
        givenTx([lockBtc('50000000'), releaseRequested('1')]),
      );

      expect(context.amountInSatoshis).to.equal('50000000');
    });

    it('reads release_requested.amount as satoshis, not weis', () => {
      const [created] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_REFUND),
        PeginAtlasEventBuilder.extractContext(
          givenTx([rejectedPegin('4'), releaseRequested('50000000')]),
        ),
      );

      expect((created.data as SwapCreatedData).input_amount).to.equal('0.50000000');
    });

    it('still reports zero for an unrefundable rejection, which carries no amount', () => {
      const context = PeginAtlasEventBuilder.extractContext(
        givenTx([rejectedPegin('5'), unrefundablePegin('3')]),
      );
      const [created] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_NO_REFUND),
        context,
      );

      expect(context.amountInSatoshis).to.be.undefined();
      expect((created.data as SwapCreatedData).input_amount).to.equal('0.00000000');
    });

    it('reports both reasons when the Bridge emitted both logs', () => {
      const context = PeginAtlasEventBuilder.extractContext(
        givenTx([rejectedPegin('5'), unrefundablePegin('3')]),
      );

      expect(context.rejectedReason).to.equal('5');
      expect(context.unrefundableReason).to.equal('3');
    });
  });

  describe('identifier normalization', () => {
    it('normalizes the swap_id of every event it builds', () => {
      const pegin = givenPegin(PeginStatus.REJECTED_REFUND);
      pegin.btcTxId = '1F789F91CB5CB6F76B91F19ADCC89233F3447D7228D8798C4E94EF09FD6D8950';

      const events = PeginAtlasEventBuilder.build(pegin, {rejectedReason: '3'});

      expect(events).to.have.length(2);
      events.forEach(event => {
        expect(event.swap_id).to.equal(
          '0x1f789f91cb5cb6f76b91f19adcc89233f3447d7228d8798c4e94ef09fd6d8950',
        );
      });
    });

    it('normalizes the Rootstock recipient used as wallet_address', () => {
      const [event] = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.LOCKED), {
        amountInSatoshis: '50000000',
        rskRecipient: '0x2D623170Cb518434af6c02602334610f194818c1',
      });

      expect((event.data as SwapCreatedData).wallet_address)
        .to.equal('0x2d623170cb518434af6c02602334610f194818c1');
    });

    it('leaves a Bitcoin sender address untouched, since base58 is case sensitive', () => {
      const [event] = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.LOCKED), {
        amountInSatoshis: '50000000',
        senderBtcAddress: 'mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8',
      });

      expect((event.data as SwapCreatedData).wallet_address)
        .to.equal('mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8');
    });
  });

});
