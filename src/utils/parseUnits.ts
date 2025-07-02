import { formatUnits } from 'ethers';

export const stringWeiToDecimalString = (value: string) => {
    if(value === '0') return '0';
    return formatUnits(BigInt(value), 18);
};
export const stringSatoshiToDecimalString = (value: string) => {
    if (Number.isNaN(value) || Number.isNaN(parseFloat(value))) return '0';
    if(BigInt(value) <= 0) return '0';
    return formatUnits(BigInt(value), 8);
};