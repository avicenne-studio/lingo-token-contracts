// Token
export const INITIAL_SUPPLY = (1_000_000_000n / 2n) * 10n ** 18n; // 500M = 50% of MAX_SUPPLY
export const TREASURY_WALLET_ADDRESS = process.env.TREASURY_WALLET_ADDRESS || "";
export const FEE = 500n; // 5%

// Vesting
export const START_BLOCK = 0;