export const ensure0x = (value: string) => {
  return value.startsWith('0x') ? value : '0x' + value;
};

export const remove0x = (value: string) => {
  return !value.startsWith('0x') ? value : value.substring(2);
};
