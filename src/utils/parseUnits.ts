import { formatUnits } from 'ethers';

export const stringWeiToDecimalString = (value: string) => {
    if(value === '0') return '0';
    return formatUnits(BigInt(value), 18);
};
export const stringSatoshiToDecimalString = (value: string) => {
    if(value === '0') return '0';
    return formatUnits(BigInt(value), 8);
};