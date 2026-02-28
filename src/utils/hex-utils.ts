export const ensure0x = (value: string) => value.startsWith('0x') ? value : `0x${  value}`;

export const remove0x = (value: string) => !value.startsWith('0x') ? value : value.substring(2)

export const ensureRskHashLength = (hash: string) => {
  const {length} = hash;
  if(length === 64) {
    return hash;
  } if (length === 63) {
    return `0${  hash}`;
  } if (length === 66) {
    return remove0x(hash);
  }
}
