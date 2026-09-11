import {expect} from '@loopback/testlab';
import {
  NON_REFUNDABLE_PEGIN_REASONS,
  REJECTED_PEGIN_REASONS,
  UNKNOWN_REASON_NAME,
  errorCategoryOf,
  nonRefundablePeginReasonName,
  rejectedPeginReasonName,
} from '../../../../models/atlas/atlas-pegin-reasons';

describe('Model: atlas-pegin-reasons', () => {

  // The names come from rskj's RejectedPeginReason, verified against
  // rsksmart/rskj@161c3f1. A value rskj adds later falls back to UNKNOWN.
  it('maps every RejectedPeginReason value to its rskj name', () => {
    expect(REJECTED_PEGIN_REASONS).to.eql({
      '1': 'PEGIN_CAP_SURPASSED',
      '2': 'LEGACY_PEGIN_MULTISIG_SENDER',
      '3': 'LEGACY_PEGIN_UNDETERMINED_SENDER',
      '4': 'PEGIN_V1_INVALID_PAYLOAD',
      '5': 'INVALID_AMOUNT',
    });
    for (const [reason, name] of Object.entries(REJECTED_PEGIN_REASONS)) {
      expect(rejectedPeginReasonName(reason)).to.equal(name);
    }
  });

  it('maps every NonRefundablePeginReason value to its rskj name', () => {
    expect(NON_REFUNDABLE_PEGIN_REASONS).to.eql({
      '1': 'LEGACY_PEGIN_UNDETERMINED_SENDER',
      '2': 'PEGIN_V1_REFUND_ADDRESS_NOT_SET',
      '3': 'INVALID_AMOUNT',
      '4': 'OUTPUTS_SENT_TO_DIFFERENT_TYPES_OF_FEDS',
    });
    for (const [reason, name] of Object.entries(NON_REFUNDABLE_PEGIN_REASONS)) {
      expect(nonRefundablePeginReasonName(reason)).to.equal(name);
    }
  });

  it('categorizes INVALID_AMOUNT as validation, not protocol_violation', () => {
    expect(errorCategoryOf('INVALID_AMOUNT')).to.equal('validation');
  });

  it('categorizes an undetermined or multisig sender as protocol_violation', () => {
    expect(errorCategoryOf('LEGACY_PEGIN_UNDETERMINED_SENDER')).to.equal('protocol_violation');
    expect(errorCategoryOf('LEGACY_PEGIN_MULTISIG_SENDER')).to.equal('protocol_violation');
  });

  it('categorizes a payload or cap rejection as validation', () => {
    expect(errorCategoryOf('PEGIN_V1_INVALID_PAYLOAD')).to.equal('validation');
    expect(errorCategoryOf('PEGIN_CAP_SURPASSED')).to.equal('validation');
  });

  it('falls back to UNKNOWN and validation for a reason rskj does not have yet', () => {
    for (const reason of ['6', '99', '', undefined]) {
      expect(rejectedPeginReasonName(reason)).to.equal(UNKNOWN_REASON_NAME);
    }
    expect(errorCategoryOf(UNKNOWN_REASON_NAME)).to.equal('validation');
  });

  it('reports no name at all when the unrefundable log is absent', () => {
    expect(nonRefundablePeginReasonName(undefined)).to.be.undefined();
    expect(nonRefundablePeginReasonName('')).to.be.undefined();
  });

  it('names an unrefundable reason rskj does not have yet as UNKNOWN', () => {
    expect(nonRefundablePeginReasonName('9')).to.equal(UNKNOWN_REASON_NAME);
  });

  // This is the bug the translation table exists to prevent: the two logs carry
  // different enums in the same position, so a bare number is meaningless.
  it('keeps the two enums apart: reason 3 differs per event name', () => {
    expect(rejectedPeginReasonName('3')).to.equal('LEGACY_PEGIN_UNDETERMINED_SENDER');
    expect(nonRefundablePeginReasonName('3')).to.equal('INVALID_AMOUNT');
  });

});
