// Token
export const INITIAL_SUPPLY = 100_000_000n * 10n ** 18n; // 100M = 10% of MAX_SUPPLY
export const TREASURY_WALLET_ADDRESS = process.env.TREASURY_WALLET_ADDRESS || "";
export const FEE = 500n; // 5%

// Vesting
export const START_BLOCK = 0;