import {expect} from '@loopback/testlab';
import {atlasEventId} from '../../../../models/atlas/atlas-event-id';
import {AtlasEventType} from '../../../../models/atlas/atlas-event.model';

/** The `event_id` pattern of schemas/atlas-swap-event.schema.json. */
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
/** Version 5 in the 13th nibble, RFC 4122 variant in the 17th. */
const UUID_V5_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const SWAP_ID = '0x8e0b47b0c60f7e02b41ee1b7d4f0d4e3f9a1c2b3d4e5f60718293a4b5c6d7e8f';
const RSK_TX_HASH = '0x5b2f1a0c9d8e7f60514233a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8';

describe('Model: atlasEventId', () => {

  it('derives the same id for the same event, which is what makes deduplication work', () => {
    const first = atlasEventId(SWAP_ID, AtlasEventType.SWAP_CREATED, RSK_TX_HASH);
    const second = atlasEventId(SWAP_ID, AtlasEventType.SWAP_CREATED, RSK_TX_HASH);

    expect(first).to.equal(second);
  });

  it('produces an id the schema accepts', () => {
    const id = atlasEventId(SWAP_ID, AtlasEventType.SWAP_COMPLETED, RSK_TX_HASH);

    expect(id).to.match(UUID_PATTERN);
  });

  // A consumer reading the version nibble is entitled to find a real one.
  it('produces a well formed version 5 uuid, not a hash cut into shape', () => {
    const id = atlasEventId(SWAP_ID, AtlasEventType.SWAP_COMPLETED, RSK_TX_HASH);

    expect(id).to.match(UUID_V5_PATTERN);
  });

  it('separates the transitions of one swap', () => {
    const ids = [
      AtlasEventType.SWAP_CREATED,
      AtlasEventType.SWAP_PENDING,
      AtlasEventType.SWAP_COMPLETED,
      AtlasEventType.SWAP_REJECTED,
    ].map(eventType => atlasEventId(SWAP_ID, eventType, RSK_TX_HASH));

    expect(new Set(ids).size).to.equal(ids.length);
  });

  it('separates two swaps reporting the same transition', () => {
    const other = `${SWAP_ID.slice(0, -1)}0`;

    expect(atlasEventId(SWAP_ID, AtlasEventType.SWAP_CREATED, RSK_TX_HASH))
      .to.not.equal(atlasEventId(other, AtlasEventType.SWAP_CREATED, RSK_TX_HASH));
  });

  // The batched peg-outs of one Bridge transaction differ only by the index the
  // processor appends to `rskTxHash`, so that part has to reach the digest.
  it('separates two transitions differing only by the rsk transaction', () => {
    const batched = `${RSK_TX_HASH}___1`;

    expect(atlasEventId(SWAP_ID, AtlasEventType.SWAP_COMPLETED, RSK_TX_HASH))
      .to.not.equal(atlasEventId(SWAP_ID, AtlasEventType.SWAP_COMPLETED, batched));
  });

  // Same reasoning as normalizeSwapId: one transaction spelled two ways is one
  // event, and must not be published twice under two ids.
  it('ignores the spelling of the hashes it is given', () => {
    const id = atlasEventId(SWAP_ID, AtlasEventType.SWAP_CREATED, RSK_TX_HASH);

    expect(atlasEventId(SWAP_ID.toUpperCase().replace('0X', '0x'), AtlasEventType.SWAP_CREATED, ` ${RSK_TX_HASH} `))
      .to.equal(id);
  });

  it('still derives an id when there is no rsk transaction to name', () => {
    const id = atlasEventId(SWAP_ID, AtlasEventType.SWAP_CREATED, undefined);

    expect(id).to.match(UUID_PATTERN);
    expect(atlasEventId(SWAP_ID, AtlasEventType.SWAP_CREATED, null)).to.equal(id);
  });

});
