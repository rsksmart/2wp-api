import { RegisterPayload } from "../models";

export function validateNonNegativeFields<T extends Object>(
  obj: T,
  fields: (keyof T)[]
): boolean {
  return fields.every((field) => {
    const value = obj[field];
    return (typeof value === 'number' && value >= 0) || (typeof value === 'string' && Number(value) >= 0);
  });
}

export const validateRegisterPayload = (payload: RegisterPayload): string => {
  let isValidBase = false;
  let isValidQuote = false;
  if (!payload.type) return 'Invalid payload, not type set';
  if (payload.type === 'pegin') {
    isValidBase = validateNonNegativeFields(
      payload, payload.provider ? ['value', 'fee']: ['value', 'fee']);
    isValidQuote = payload.quote ? validateNonNegativeFields(payload.quote, [
      'callFeeOnSatoshi','productFeeAmountOnSatoshi', 'timeForDepositInSeconds', 'confirmations',
      'valueOnSatoshi', 'agreementTimestamp', 'penaltyFeeOnWei', 'nonce', 'gasFeeOnWei'
    ]) : true;
  } else {
    isValidBase = validateNonNegativeFields(
      payload, payload.provider ? ['value', 'fee', 'rskGas']: ['value', 'rskGas', 'btcEstimatedFee']);
    isValidQuote = payload.quote ? validateNonNegativeFields(payload.quote, [
      'callFeeOnWei', 'gasFeeOnWei', 'depositConfirmations', 'expireBlocks',
      'productFeeAmountOnWei', 'transferConfirmations',
      'valueOnWei', 'agreementTimestamp', 'nonce', 'penaltyFeeOnWei',
    ]) : true;
  }
  const error = isValidBase && isValidQuote ? '' : 'Invalid payload: negative or non-numeric values found in required fields.';
  return error;
}
