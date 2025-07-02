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
    const isValidBase = validateNonNegativeFields(payload, ['value', 'fee']);
    const isValidQuote = payload.quote
      ? validateNonNegativeFields(payload.quote, [
        'callFeeOnWei', 'gasFeeOnWei', 'depositConfirmations', 'expireBlocks',
        'productFeeAmountOnWei', 'transferConfirmations',
        'valueOnWei', 'agreementTimestamp', 'nonce', 'penaltyFeeOnWei',
    ])
      : true;
    const error = isValidBase && isValidQuote ? '' : 'Invalid payload: negative or non-numeric values found in required fields.';
    return error;
  }
