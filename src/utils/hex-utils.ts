export const ensure0x = (value: string) => {
  return value.startsWith('0x') ? value : '0x' + value;
};

export const remove0x = (value: string) => {
  return !value.startsWith('0x') ? value : value.substring(2);
}

export const ensureRskHashLength = (hash: string) => {
  const length = hash.length;
  if(length === 64) {
    return hash;
  } else if (length === 63) {
    return '0' + hash;
  } else if (length === 66) {
    return remove0x(hash);
  }
}
