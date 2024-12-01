const BLOCKS_PER_DAY = 43200;
export const MONTH = BigInt(BLOCKS_PER_DAY * 30);

export const VESTING_SCHEDULES = [
  // PreSeed
  {
    rateUnlockedAtStart: 15n,
    cliffDuration: 3n * MONTH,
    vestingDuration: 15n * MONTH,
  },
  // KOL
  {
    rateUnlockedAtStart: 10n,
    cliffDuration: 3n * MONTH,
    vestingDuration: 15n * MONTH,
  },
  // PrivateSale
  {
    rateUnlockedAtStart: 0n,
    cliffDuration: 3n * MONTH,
    vestingDuration: 15n * MONTH,
  },
  // PublicSale
  {
    rateUnlockedAtStart: 7n,
    cliffDuration: 3n * MONTH,
    vestingDuration: 12n * MONTH,
  },
  // SocialFiParticipantsAirdrop
  {
    rateUnlockedAtStart: 10n,
    cliffDuration: 3n * MONTH,
    vestingDuration: 12n * MONTH,
  },
  // StrategicPartners
  {
    rateUnlockedAtStart: 0n,
    cliffDuration: 3n * MONTH,
    vestingDuration: 3n * MONTH,
  },
  // Ambassadors
  {
    rateUnlockedAtStart: 0n,
    cliffDuration: 24n * MONTH,
    vestingDuration: 24n * MONTH,
  },
  // Team
  {
    rateUnlockedAtStart: 0n,
    cliffDuration: 12n * MONTH,
    vestingDuration: 36n * MONTH,
  },
];
