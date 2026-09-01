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

    it('builds exactly one swap.created', () => {
      const events = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.LOCKED), context);

      expect(events).to.have.length(1);
      expect(events[0].event_type).to.equal(AtlasEventType.SWAP_CREATED);
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

    it('validates against the JSON Schema', () => {
      PeginAtlasEventBuilder.build(givenPegin(PeginStatus.LOCKED), context).forEach(expectValid);
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
      expect(data.error_category).to.equal('validation');
      expect(data.error_code).to.equal('PEGIN_REJECTION_3');
    });

    it('marks an unrefundable rejection as terminal', () => {
      const [, rejected] = PeginAtlasEventBuilder.build(
        givenPegin(PeginStatus.REJECTED_NO_REFUND),
        {unrefundableReason: '1'},
      );
      const data = rejected.data as SwapRejectedData;

      expect(data.refund_applicable).to.be.false();
      expect(data.error_category).to.equal('protocol_violation');
      expect(data.error_code).to.equal('PEGIN_UNREFUNDABLE_1');
    });

    it('falls back to UNKNOWN when the Bridge reason is absent', () => {
      const [, refundable] = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.REJECTED_REFUND), {});
      const [, terminal] = PeginAtlasEventBuilder.build(givenPegin(PeginStatus.REJECTED_NO_REFUND), {});

      expect((refundable.data as SwapRejectedData).error_code).to.equal('PEGIN_REJECTION_UNKNOWN');
      expect((terminal.data as SwapRejectedData).error_code).to.equal('PEGIN_UNREFUNDABLE_UNKNOWN');
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
      PeginAtlasEventBuilder.build(givenPegin(PeginStatus.REJECTED_NO_REFUND), {unrefundableReason: '1'})
        .forEach(expectValid);
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

});
