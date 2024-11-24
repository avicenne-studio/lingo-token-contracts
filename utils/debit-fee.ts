export const debitFee = async (token: any, amount: bigint): Promise<bigint> => {
  const amountBigInt = BigInt(amount);
  const feePercentage = await token.read.transferFee();
  
  return amountBigInt - (amountBigInt * BigInt(feePercentage) / BigInt(10000));
};
