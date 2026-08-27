import {expect} from '@loopback/testlab';
import Ajv, {ValidateFunction} from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import {
  ATLAS_SCHEMA_VERSION,
  ATLAS_SOURCE,
  ATLAS_SWAP_TYPE,
  AtlasEvent,
  AtlasEventType,
  SwapCompletedData,
  SwapCreatedData,
  SwapPendingData,
  SwapRejectedData,
} from '../../../../models/atlas/atlas-event.model';
import {PegoutAtlasEventBuilder} from '../../../../services/atlas/pegout-atlas-event.builder';
import {
  PegoutStatusDbDataModel,
  PegoutStatuses,
  RejectedPegoutReason,
} from '../../../../models/rsk/pegout-status-data-model';

const SCHEMA_PATH = path.resolve(process.cwd(), 'schemas/atlas-swap-event.schema.json');

const originatingRskTxHash = '0x8e0b47b0c60f7e02b41ee1b7d4f0d4e3f9a1c2b3d4e5f60718293a4b5c6d7e8f';
const rskSenderAddress = '0x40d2878B98A9C5A5b7bc3B2FC0e26dfDefCfe737';
const btcTxHash = '0d3b1a1c4a3f8e6d5c4b3a29180706f5e4d3c2b1a09f8e7d6c5b4a3928170605';
const receivedCreatedOn = new Date('2024-05-01T10:00:00.000Z');

function givenPegout(data: Partial<PegoutStatusDbDataModel>): PegoutStatusDbDataModel {
  const pegout = new PegoutStatusDbDataModel();
  pegout.originatingRskTxHash = originatingRskTxHash;
  pegout.rskTxHash = originatingRskTxHash;
  pegout.rskSenderAddress = rskSenderAddress;
  pegout.createdOn = receivedCreatedOn;
  pegout.valueRequestedInSatoshis = 10000000;
  return Object.assign(pegout, data);
}

describe('Service: PegoutAtlasEventBuilder', () => {
  const originalNetwork = process.env.NETWORK;
  const originalConfirmations = process.env.RSK_PEGOUT_MINIMUM_CONFIRMATIONS;
  let validate: ValidateFunction;

  before(() => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    const ajv = new Ajv({allErrors: true, strict: false});
    addFormats(ajv);
    validate = ajv.compile(schema);
  });

  beforeEach(() => {
    process.env.NETWORK = 'testnet';
    process.env.RSK_PEGOUT_MINIMUM_CONFIRMATIONS = '10';
  });

  after(() => {
    process.env.NETWORK = originalNetwork;
    process.env.RSK_PEGOUT_MINIMUM_CONFIRMATIONS = originalConfirmations;
  });

  function expectValidAgainstSchema(event: AtlasEvent | null) {
    expect(event).to.not.be.null();
    const valid = validate(event);
    expect(validate.errors ?? []).to.be.empty();
    expect(valid).to.be.true();
  }

  describe('swap.created', () => {
    const pegout = () => givenPegout({status: PegoutStatuses.RECEIVED});

    it('builds the full payload from a RECEIVED status', () => {
      const event = PegoutAtlasEventBuilder.build(pegout())!;
      expect(event.event_type).to.equal(AtlasEventType.SWAP_CREATED);
      expect(event.swap_id).to.equal(originatingRskTxHash);
      expect(event.swap_type).to.equal(ATLAS_SWAP_TYPE);
      expect(event.source).to.equal(ATLAS_SOURCE);
      expect(event.schema_version).to.equal(ATLAS_SCHEMA_VERSION);
      expect(event.emitted_at).to.equal(receivedCreatedOn.toISOString());
      expect(event.data as SwapCreatedData).to.eql({
        provider: 'powpeg',
        source_chain: 'rootstock_testnet',
        destination_chain: 'bitcoin_testnet',
        input_asset: 'RBTC',
        output_asset: 'BTC',
        input_amount: '0.10000000',
        input_amount_usd: null,
        wallet_address: rskSenderAddress,
        wallet_type: null,
        quote_id: null,
      });
    });

    it('uses mainnet chain ids when NETWORK is mainnet', () => {
      process.env.NETWORK = 'mainnet';
      const data = PegoutAtlasEventBuilder.build(pegout())!.data as SwapCreatedData;
      expect(data.source_chain).to.equal('rootstock_mainnet');
      expect(data.destination_chain).to.equal('bitcoin_mainnet');
    });

    it('validates against the JSON Schema', () => {
      expectValidAgainstSchema(PegoutAtlasEventBuilder.build(pegout()));
    });
  });

  describe('swap.pending', () => {
    const pegout = () => givenPegout({
      status: PegoutStatuses.WAITING_FOR_CONFIRMATION,
      rskTxHash: `${originatingRskTxHash}_0`,
      createdOn: new Date('2024-05-01T10:01:00.000Z'),
    });

    it('reads expected_confirmations from the environment', () => {
      process.env.RSK_PEGOUT_MINIMUM_CONFIRMATIONS = '4000';
      const event = PegoutAtlasEventBuilder.build(pegout())!;
      expect(event.event_type).to.equal(AtlasEventType.SWAP_PENDING);
      expect(event.data as SwapPendingData).to.eql({
        source_tx_hash: originatingRskTxHash,
        deposit_address: null,
        expected_confirmations: 4000,
      });
    });

    it('falls back to zero confirmations when the variable is unset', () => {
      delete process.env.RSK_PEGOUT_MINIMUM_CONFIRMATIONS;
      const data = PegoutAtlasEventBuilder.build(pegout())!.data as SwapPendingData;
      expect(data.expected_confirmations).to.equal(0);
    });

    it('validates against the JSON Schema', () => {
      expectValidAgainstSchema(PegoutAtlasEventBuilder.build(pegout()));
    });
  });

  describe('swap.completed', () => {
    const completedOn = new Date(receivedCreatedOn.getTime() + 184000);
    const pegout = () => givenPegout({
      status: PegoutStatuses.RELEASE_BTC,
      rskTxHash: `${originatingRskTxHash}___0`,
      btcTxHash,
      createdOn: completedOn,
      valueRequestedInSatoshis: 10000000,
      valueInSatoshisToBeReceived: 9995000,
    });

    it('computes output_amount, fee and duration_ms', () => {
      const event = PegoutAtlasEventBuilder.build(pegout(), {receivedCreatedOn})!;
      expect(event.event_type).to.equal(AtlasEventType.SWAP_COMPLETED);
      expect(event.data as SwapCompletedData).to.eql({
        destination_tx_hash: btcTxHash,
        output_amount: '0.09995000',
        output_amount_usd: null,
        fee: '0.00005000',
        duration_ms: 184000,
      });
    });

    it('leaves duration_ms null when the RECEIVED timestamp is unknown', () => {
      const data = PegoutAtlasEventBuilder.build(pegout())!.data as SwapCompletedData;
      expect(data.duration_ms).to.be.null();
    });

    it('validates against the JSON Schema', () => {
      expectValidAgainstSchema(PegoutAtlasEventBuilder.build(pegout(), {receivedCreatedOn}));
    });
  });

  describe('swap.rejected', () => {
    const reasons: RejectedPegoutReason[] = ['LOW_AMOUNT', 'CALLER_CONTRACT', 'FEE_ABOVE_VALUE'];

    reasons.forEach(reason => {
      it(`maps the ${reason} rejection reason`, () => {
        const event = PegoutAtlasEventBuilder.build(
          givenPegout({status: PegoutStatuses.REJECTED, reason}),
        )!;
        expect(event.event_type).to.equal(AtlasEventType.SWAP_REJECTED);
        expect(event.data as SwapRejectedData).to.eql({
          error_category: 'validation',
          error_code: reason,
          error_message: 'Pegout request rejected by the Bridge',
          refund_applicable: false,
        });
        expectValidAgainstSchema(event);
      });
    });

    it('falls back to UNKNOWN when the Bridge reason is not recognized', () => {
      const event = PegoutAtlasEventBuilder.build(
        givenPegout({status: PegoutStatuses.REJECTED}),
      )!;
      expect((event.data as SwapRejectedData).error_code).to.equal('UNKNOWN');
      expectValidAgainstSchema(event);
    });
  });

  describe('out of scope statuses', () => {
    [
      PegoutStatuses.WAITING_FOR_SIGNATURE,
      PegoutStatuses.SIGNED,
      PegoutStatuses.PENDING,
      PegoutStatuses.NOT_FOUND,
      PegoutStatuses.NOT_PEGOUT_TX,
    ].forEach(status => {
      it(`builds no event for ${status}`, () => {
        expect(PegoutAtlasEventBuilder.build(givenPegout({status}))).to.be.null();
      });
    });
  });

  describe('swap_id regression', () => {
    const mutatedHashes = [
      {suffix: '_0', status: PegoutStatuses.WAITING_FOR_CONFIRMATION},
      {suffix: '__1', status: PegoutStatuses.WAITING_FOR_SIGNATURE},
      {suffix: '___2', status: PegoutStatuses.RELEASE_BTC},
    ];

    mutatedHashes.forEach(({suffix, status}) => {
      it(`keeps swap_id as originatingRskTxHash when rskTxHash ends in ${suffix}`, () => {
        const pegout = givenPegout({
          status,
          rskTxHash: `${originatingRskTxHash}${suffix}`,
          btcTxHash,
          valueInSatoshisToBeReceived: 9995000,
        });
        const event = PegoutAtlasEventBuilder.build(pegout);
        if (event === null) {
          // WAITING_FOR_SIGNATURE is deliberately out of scope.
          expect(status).to.equal(PegoutStatuses.WAITING_FOR_SIGNATURE);
          return;
        }
        expect(event.swap_id).to.equal(originatingRskTxHash);
        expect(event.swap_id).to.not.containEql(suffix);
      });
    });
  });

  describe('amount conversion', () => {
    it('renders 12345678 satoshis with eight decimals', () => {
      expect(PegoutAtlasEventBuilder.toDecimalAmount(12345678)).to.equal('0.12345678');
    });

    it('renders zero with eight decimals', () => {
      expect(PegoutAtlasEventBuilder.toDecimalAmount(0)).to.equal('0.00000000');
    });

    it('renders a single satoshi without losing precision', () => {
      expect(PegoutAtlasEventBuilder.toDecimalAmount(1)).to.equal('0.00000001');
    });

    it('renders large values without losing precision', () => {
      expect(PegoutAtlasEventBuilder.toDecimalAmount(2100000000000000)).to.equal('21000000.00000000');
      expect(PegoutAtlasEventBuilder.toDecimalAmount(999999999999999)).to.equal('9999999.99999999');
    });

    it('treats a missing amount as zero', () => {
      expect(PegoutAtlasEventBuilder.toDecimalAmount(undefined)).to.equal('0.00000000');
    });
  });

  describe('usd fields', () => {
    it('leaves every *_usd field null', () => {
      const events = [
        PegoutAtlasEventBuilder.build(givenPegout({status: PegoutStatuses.RECEIVED}))!,
        PegoutAtlasEventBuilder.build(givenPegout({
          status: PegoutStatuses.RELEASE_BTC,
          btcTxHash,
          valueInSatoshisToBeReceived: 9995000,
        }))!,
      ];
      for (const event of events) {
        const data = event.data as unknown as Record<string, unknown>;
        for (const key of Object.keys(data).filter(k => k.endsWith('_usd'))) {
          expect(data[key]).to.be.null();
        }
      }
    });
  });

  it('generates a distinct event_id per event', () => {
    const first = PegoutAtlasEventBuilder.build(givenPegout({status: PegoutStatuses.RECEIVED}))!;
    const second = PegoutAtlasEventBuilder.build(givenPegout({status: PegoutStatuses.RECEIVED}))!;
    expect(first.event_id).to.not.equal(second.event_id);
  });
});
