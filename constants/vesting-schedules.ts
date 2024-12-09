export const DAY = BigInt(43200); // Blocks per day on Base

export const VESTING_SCHEDULES = [
    // KOLRoundA
    {
        rateUnlockedAtStart: 10n,
        cliffDuration: 90n * DAY,
        vestingDuration: 450n * DAY
    },

    // KOLRoundB
    {
        rateUnlockedAtStart: 15n,
        cliffDuration: 90n * DAY,
        vestingDuration: 450n * DAY
    },

    // KOLRoundFreeAllocation
    {
        rateUnlockedAtStart: 100n,
        cliffDuration: 0n * DAY,
        vestingDuration: 0n * DAY
    },

    // LingoIslandsAirdrop
    {
        rateUnlockedAtStart: 10n,
        cliffDuration: 90n * DAY,
        vestingDuration: 360n * DAY
    },

    // LingoIslandsAirdropFirstClass
    {
        rateUnlockedAtStart: 20n,
        cliffDuration: 90n * DAY,
        vestingDuration: 360n * DAY
    },

    // PartnersAirdrop
    {
        rateUnlockedAtStart: 10n,
        cliffDuration: 90n * DAY,
        vestingDuration: 360n * DAY
    },

    // PartnersAirdropFirstClass
    {
        rateUnlockedAtStart: 20n,
        cliffDuration: 90n * DAY,
        vestingDuration: 360n * DAY
    },

    // PrivateRound3MPostTGEUnlock
    {
        rateUnlockedAtStart: 0n,
        cliffDuration: 90n * DAY,
        vestingDuration: 90n * DAY
    },

    // PrivateRoundA
    {
        rateUnlockedAtStart: 30n,
        cliffDuration: 90n * DAY,
        vestingDuration: 180n * DAY
    },

    // PrivateRoundB
    {
        rateUnlockedAtStart: 10n,
        cliffDuration: 90n * DAY,
        vestingDuration: 180n * DAY
    },

    // PrivateRoundC
    {
        rateUnlockedAtStart: 10n,
        cliffDuration: 90n * DAY,
        vestingDuration: 540n * DAY
    },

    // PrivateRoundD
    {
        rateUnlockedAtStart: 15n,
        cliffDuration: 90n * DAY,
        vestingDuration: 450n * DAY
    },

    // PrivateRoundE
    {
        rateUnlockedAtStart: 0n,
        cliffDuration: 90n * DAY,
        vestingDuration: 540n * DAY
    },

    // PrivateRoundF
    {
        rateUnlockedAtStart: 0n,
        cliffDuration: 90n * DAY,
        vestingDuration: 450n * DAY
    },

    // PublicPresale
    {
        rateUnlockedAtStart: 10n,
        cliffDuration: 90n * DAY,
        vestingDuration: 360n * DAY
    },

    // PublicPresaleFirstClass
    {
        rateUnlockedAtStart: 20n,
        cliffDuration: 90n * DAY,
        vestingDuration: 360n * DAY
    },

    // PublicRound
    {
        rateUnlockedAtStart: 10n,
        cliffDuration: 90n * DAY,
        vestingDuration: 360n * DAY
    },

    // Team
    {
        rateUnlockedAtStart: 0n,
        cliffDuration: 360n * DAY,
        vestingDuration: 1080n * DAY
    },
];
