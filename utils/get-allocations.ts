export const getAllocations = (supply: bigint) => {

    const MONTH = BigInt(30 * 24 * 60 * 60);

    return [
        // PreSeed
        {
            totalAllocation: supply / 100n,
            unlockedAtStart: (supply * 15n) / 10000n,
            cliffDuration: 3n * MONTH,
            vestingDuration: 15n * MONTH,
        },
        // KOL
        {
            totalAllocation: (supply) / 100n,
            unlockedAtStart: (supply * 10n) / 10000n,
            cliffDuration: 3n * MONTH,
            vestingDuration: 15n * MONTH,
        },
        // PrivateSale
        {
            totalAllocation: (supply * 13n) / 100n,
            unlockedAtStart: 0n,
            cliffDuration: 3n * MONTH,
            vestingDuration: 15n * MONTH,
        },
        // PublicSale
        {
            totalAllocation: (supply * 7n) / 100n,
            unlockedAtStart: (supply * 7n * 10n) / 10000n,
            cliffDuration: 3n * MONTH,
            vestingDuration: 12n * MONTH,
        },
        // SocialFiParticipantsAirdrop
        {
            totalAllocation: (supply) / 100n,
            unlockedAtStart: (supply * 10n) / 10000n,
            cliffDuration: 3n * MONTH,
            vestingDuration: 12n * MONTH,
        },
        // StrategicPartners
        {
            totalAllocation: (supply) / 100n,
            unlockedAtStart: 0n,
            cliffDuration: 3n * MONTH,
            vestingDuration: 3n * MONTH,
        },
        // Ambassadors
        {
            totalAllocation: (supply * 7n) / 100n,
            unlockedAtStart: 0n,
            cliffDuration: 24n * MONTH,
            vestingDuration: 24n * MONTH,
        },
        // Team
        {
            totalAllocation: (supply * 15n) / 100n,
            unlockedAtStart: 0n,
            cliffDuration: 12n * MONTH,
            vestingDuration: 36n * MONTH,
        }];
}
