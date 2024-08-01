export const MONTH = BigInt(195090);

export const VESTING_SCHEDULES = [
  // PreSeed
  {
    unlockedAtStart: 15n,
    cliffDuration: 3n * MONTH,
    vestingDuration: 15n * MONTH,
  },
  // KOL
  {
    unlockedAtStart: 10n,
    cliffDuration: 3n * MONTH,
    vestingDuration: 15n * MONTH,
  },
  // PrivateSale
  {
    unlockedAtStart: 0n,
    cliffDuration: 3n * MONTH,
    vestingDuration: 15n * MONTH,
  },
  // PublicSale
  {
    unlockedAtStart: 7n,
    cliffDuration: 3n * MONTH,
    vestingDuration: 12n * MONTH,
  },
  // SocialFiParticipantsAirdrop
  {
    unlockedAtStart: 10n,
    cliffDuration: 3n * MONTH,
    vestingDuration: 12n * MONTH,
  },
  // StrategicPartners
  {
    unlockedAtStart: 0n,
    cliffDuration: 3n * MONTH,
    vestingDuration: 3n * MONTH,
  },
  // Ambassadors
  {
    unlockedAtStart: 0n,
    cliffDuration: 24n * MONTH,
    vestingDuration: 24n * MONTH,
  },
  // Team
  {
    unlockedAtStart: 0n,
    cliffDuration: 12n * MONTH,
    vestingDuration: 36n * MONTH,
  },
];
