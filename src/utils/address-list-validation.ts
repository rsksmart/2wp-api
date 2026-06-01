import {HttpErrors} from '@loopback/rest';

export function validateAddressList(
  list: string[],
  opts: {maxItems: number; rejectDuplicates: boolean},
): void {
  if (list.length > opts.maxItems) {
    throw new HttpErrors.UnprocessableEntity(
      `addressList exceeds maximum of ${opts.maxItems} items`,
    );
  }
  if (opts.rejectDuplicates) {
    const unique = new Set(list);
    if (unique.size !== list.length) {
      throw new HttpErrors.UnprocessableEntity(
        'addressList must not contain duplicate addresses',
      );
    }
  }
}
