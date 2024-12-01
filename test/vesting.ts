import {
  loadFixture,
  mine,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress } from "viem";
import { VESTING_SCHEDULES, MONTH } from "../constants/vesting-schedules";
import { STAKING_SCHEDULES } from "../constants/staking-schedules";
import { getMerkleProof, getMerkleTree } from "../utils/merkle-tree";
import { Beneficiary } from "../types/beneficiary";

describe("TokenVesting", function () {
  async function deployFixture() {
    const INITIAL_SUPPLY = BigInt(1_000n);
    const TOTAL_SUPPLY = BigInt(1_000_000_000n * 10n ** 18n);
    const FEES = BigInt(500n);

    // Contracts are deployed using the first signer/account by default
    const [
      owner,
      preSeedUser,
      kolRoundUser,
      privateSaleUser,
      publicSaleUser,
      socialFiAirdropUser,
      strategicPartnersUser,
      ambassadorsUser,
      teamUser,
      treasuryWallet,
    ] = await hre.viem.getWalletClients();

    const lingoToken = await hre.viem.deployContract("LingoToken", [
      INITIAL_SUPPLY,
      treasuryWallet.account.address,
      FEES,
    ]);

    const tokenStaking = await hre.viem.deployContract("TokenStaking", [
      owner.account.address,
      lingoToken.address,
      STAKING_SCHEDULES
    ]);

    const LAST_BLOCK = await time.latestBlock();

    const tokenVesting = await hre.viem.deployContract("TokenVesting", [
      owner.account.address,
      lingoToken.address,
      tokenStaking.address,
      VESTING_SCHEDULES,
      BigInt(LAST_BLOCK) + 1n * MONTH,
    ]);

    const INTERNAL_ROLE = await lingoToken.read.INTERNAL_ROLE();

    await lingoToken.write.setVestingContractAddress([tokenVesting.address]);
    await lingoToken.write.grantRole([INTERNAL_ROLE, tokenStaking.address]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      lingoToken,
      tokenStaking,
      tokenVesting,
      TOTAL_SUPPLY,
      owner,
      preSeedUser,
      kolRoundUser,
      privateSaleUser,
      publicSaleUser,
      socialFiAirdropUser,
      strategicPartnersUser,
      ambassadorsUser,
      teamUser,
      publicClient,
    };
  }

  async function deployAndInitializeFixture() {
    const { tokenVesting, ...fixture } = await loadFixture(deployFixture);

    const ALLOCATION_AMOUNT = BigInt(1_000n * 10n ** 18n);

    const accounts = [
      fixture.preSeedUser,
      fixture.kolRoundUser,
      fixture.privateSaleUser,
      fixture.publicSaleUser,
      fixture.socialFiAirdropUser,
      fixture.strategicPartnersUser,
      fixture.ambassadorsUser,
      fixture.teamUser,
    ];

    const values = accounts.map((account, i) => [
      account.account.address,
      i,
      ALLOCATION_AMOUNT * BigInt(i + 1),
    ]);

    values.push([accounts[0].account.address, Beneficiary.SocialFiParticipantsAirdrop,  ALLOCATION_AMOUNT])

    const tokenVestingAs = (beneficiary: Beneficiary) => {
      return hre.viem.getContractAt("TokenVesting", tokenVesting.address, {
        client: { wallet: accounts[beneficiary] },
      });
    };

    const tree = getMerkleTree(values);

    const merkleProofs = values.map((user) =>
      getMerkleProof(tree, user[0] as `0x${string}`, user[1] as Beneficiary),
    );

    await tokenVesting.write.setMerkleRoot([tree.root as `0x${string}`]);

    return {
      tokenVesting,
      tokenVestingAs,
      ...fixture,
      tree,
      merkleProofs,
      ALLOCATION_AMOUNT,
    };
  }

  describe("Deployment", function () {
    it("Should set the right Allocations", async function () {
      const { tokenVesting } = await loadFixture(deployFixture);

      for (let i = 0; i < VESTING_SCHEDULES.length; i++) {
        expect(await tokenVesting.read.vestingSchedules([i])).to.deep.equal(
          Object.values(VESTING_SCHEDULES[i]),
        );
      }
    });

    it("Should set the right owner", async function () {
      const { tokenVesting, owner } = await loadFixture(deployFixture);

      expect(await tokenVesting.read.owner()).to.equal(
        getAddress(owner.account.address),
      );
    });

    it("Should not deploy if schedule are missing", async function () {
      const INITIAL_SUPPLY = BigInt(1_000n);
      const FEES = BigInt(500n);

      const [
        owner,
        treasuryWallet,
      ] = await hre.viem.getWalletClients();

      const lingoToken = await hre.viem.deployContract("LingoToken", [
        INITIAL_SUPPLY,
        treasuryWallet.account.address,
        FEES,
      ]);

      const tokenStaking = await hre.viem.deployContract("TokenStaking", [
        owner.account.address,
        lingoToken.address,
        STAKING_SCHEDULES
      ]);

      const LAST_BLOCK = await time.latestBlock();

      const wrongVestingSchedules = VESTING_SCHEDULES.slice(0, -1);

      await expect(hre.viem.deployContract("TokenVesting", [
        owner.account.address,
        lingoToken.address,
        tokenStaking.address,
        wrongVestingSchedules,
        BigInt(LAST_BLOCK) + 1n * MONTH,
      ])).to.rejected;
    });
  });

  describe("Merkle Tree", function () {
    it("Should validate the Merkle Proof if the Proof is valid", async function () {
      const { preSeedUser, tree, ALLOCATION_AMOUNT } = await loadFixture(
        deployAndInitializeFixture,
      );

      const proof = getMerkleProof(tree, preSeedUser.account.address, Beneficiary.PreSeed);

      const leaf = [
        preSeedUser.account.address,
        Beneficiary.PreSeed,
        BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT,
      ];

      expect(tree.verify(leaf, proof)).to.be.true;
    });

    it("Should NOT set the Merkle Root if the call is NOT the owner", async function () {
      const { tree, lingoToken, tokenStaking, ambassadorsUser } = await loadFixture(
        deployAndInitializeFixture,
      );

      const LAST_BLOCK = await time.latestBlock();

      const tokenVesting = await hre.viem.deployContract("TokenVesting", [
        // random user is owner
        ambassadorsUser.account.address,
        lingoToken.address,
        tokenStaking.address,
        VESTING_SCHEDULES,
        BigInt(LAST_BLOCK) + 1n * MONTH]);

      await expect(tokenVesting.write.setMerkleRoot([tree.root as `0x${string}`])).to.be.rejected;
    });
    it("Should NOT edit the Merkle Root", async function () {
      const { tokenVesting, tree } = await loadFixture(
        deployAndInitializeFixture,
      );

      await expect(tokenVesting.write.setMerkleRoot([tree.root as `0x${string}`])).to.be.rejected;
    });

    it("Should NOT validate the Merkle Proof if the Proof is NOT valid", async function () {
      const { preSeedUser, tree, ALLOCATION_AMOUNT } = await loadFixture(
        deployAndInitializeFixture,
      );
      const proof = getMerkleProof(tree, preSeedUser.account.address, Beneficiary.PreSeed);

      const leaf = [
        preSeedUser.account.address,
        Beneficiary.PreSeed,
        BigInt(Beneficiary.Ambassadors) * ALLOCATION_AMOUNT,
      ];

      expect(tree.verify(leaf, proof)).to.be.false;
    });

    it("Should claim token if Merkle Proof is valid", async function () {
      const {
        tokenVestingAs,
        lingoToken,
        preSeedUser,
        tree,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const preSeedUserAddress = preSeedUser.account.address;

      const proof = getMerkleProof(tree, preSeedUserAddress, Beneficiary.PreSeed);

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(200n * MONTH);

      await tokenVestingAsPreSeed.write.claimTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
      ]);

      const preSeedUserBalance = await lingoToken.read.balanceOf([
        preSeedUserAddress,
      ]);

      expect(preSeedUserBalance).to.equal(allocation);
    });

    it("Should NOT claim token if Merkle Proof is NOT valid", async function () {
      const {
        tokenVestingAs,
        socialFiAirdropUser,
        tree,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const socialFiAirdropUserAddress = socialFiAirdropUser.account.address;

      const proof = getMerkleProof(tree, socialFiAirdropUserAddress, Beneficiary.SocialFiParticipantsAirdrop);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.PreSeed];

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH + vestingDuration);

      await expect(tokenVestingAsPreSeed.write.claimTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
      ])).to.be.rejected;
    });
  });

  describe("Token Release", function () {
    it("Should release TGE + 50% of the allocation after Cliff +50% of (vesting period - cliff)", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        preSeedUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const preSeedUserAddress = preSeedUser.account.address;

      const proof = getMerkleProof(tree, preSeedUserAddress, Beneficiary.PreSeed);

      const { rateUnlockedAtStart, cliffDuration, vestingDuration } = VESTING_SCHEDULES[Beneficiary.PreSeed];

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH);

      await mine(cliffDuration + (vestingDuration - cliffDuration) / 2n);

      const claimableToken = await tokenVestingAsPreSeed.read.claimableTokenOf([
        preSeedUserAddress,
        Beneficiary.PreSeed,
        allocation,
      ]);

      const amountUnlockedAtStart = (rateUnlockedAtStart * allocation) / 100n;

      const expectedClaimableToken = amountUnlockedAtStart + (allocation - amountUnlockedAtStart) / 2n;

      await tokenVestingAsPreSeed.write.claimTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
      ]);

      const preSeedUserBalance = await lingoToken.read.balanceOf([
        preSeedUserAddress,
      ]);

      expect(claimableToken).to.be.equal(expectedClaimableToken);
      expect(preSeedUserBalance).to.be.equal(claimableToken);
    });

    it("Should release unlockedAtStart during Cliff", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        preSeedUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const preSeedUserAddress = preSeedUser.account.address;

      const proof = getMerkleProof(tree, preSeedUserAddress, Beneficiary.PreSeed);

      const { rateUnlockedAtStart, cliffDuration } = VESTING_SCHEDULES[Beneficiary.PreSeed];

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH);

      await mine(cliffDuration / 2n);

      const claimableToken = await tokenVestingAsPreSeed.read.claimableTokenOf([
        preSeedUserAddress,
        Beneficiary.PreSeed,
        allocation,
      ]);

      await tokenVestingAsPreSeed.write.claimTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
      ]);

      const amountUnlockedAtStart = (rateUnlockedAtStart * allocation) / 100n;

      const preSeedUserBalance = await lingoToken.read.balanceOf([
        preSeedUserAddress,
      ]);

      expect(claimableToken).to.be.equal(amountUnlockedAtStart);
      expect(preSeedUserBalance).to.be.equal(claimableToken);
    });

    it("Should release 100% of the allocation after vesting", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        preSeedUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const preSeedUserAddress = preSeedUser.account.address;

      const proof = getMerkleProof(tree, preSeedUserAddress, Beneficiary.PreSeed);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.PreSeed];

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH);

      await mine(vestingDuration);

      const claimableToken = await tokenVestingAsPreSeed.read.claimableTokenOf([
        preSeedUserAddress,
        Beneficiary.PreSeed,
        allocation,
      ]);

      await tokenVestingAsPreSeed.write.claimTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
      ]);

      const preSeedUserBalance = await lingoToken.read.balanceOf([
        preSeedUserAddress,
      ]);

      expect(claimableToken).to.be.equal(allocation);
      expect(preSeedUserBalance).to.be.equal(claimableToken);
    });

    it("Should release 0% of the allocation after vesting", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        preSeedUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const preSeedUserAddress = preSeedUser.account.address;

      const proof = getMerkleProof(tree, preSeedUserAddress, Beneficiary.PreSeed);

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(0);

      const claimableToken = await tokenVestingAsPreSeed.read.claimableTokenOf([
        preSeedUserAddress,
        Beneficiary.PreSeed,
        allocation,
      ]);

      await expect(tokenVestingAsPreSeed.write.claimTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
      ])).to.be.rejected;

      const preSeedUserBalance = await lingoToken.read.balanceOf([
        preSeedUserAddress,
      ]);

      expect(claimableToken).to.be.equal(0n);
      expect(preSeedUserBalance).to.be.equal(0n);
    });

    it("Should stake 100% of the allocation after vesting when calling claimAndStakeTokens", async function () {
      const {
        tokenStaking,
        tokenVestingAs,
        tree,
        preSeedUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const preSeedUserAddress = preSeedUser.account.address;

      const proof = getMerkleProof(tree, preSeedUserAddress, Beneficiary.PreSeed);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.PreSeed];

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH);

      await mine(vestingDuration);

      const claimableToken = await tokenVestingAsPreSeed.read.claimableTokenOf([
        preSeedUserAddress,
        Beneficiary.PreSeed,
        allocation,
      ]);

      const durationIndex = 1n;
      const lockDuration = await tokenStaking.read.lockDurations([durationIndex]);

      await tokenVestingAsPreSeed.write.claimAndStakeTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
        durationIndex,
        lockDuration
      ]);

      const positions = await tokenStaking.read.getStakes([preSeedUserAddress]);

      expect(claimableToken).to.be.equal(allocation);

      expect(positions[0].amount).to.equal(allocation);
    });

    it("Should stake unlockedAtStart during Cliff when calling claimAndStakeTokens", async function () {
      const {
        tokenStaking,
        tokenVestingAs,
        tree,
        preSeedUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const preSeedUserAddress = preSeedUser.account.address;

      const proof = getMerkleProof(tree, preSeedUserAddress, Beneficiary.PreSeed);

      const { rateUnlockedAtStart, cliffDuration } = VESTING_SCHEDULES[Beneficiary.PreSeed];

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH);

      await mine(cliffDuration / 2n);

      const claimableToken = await tokenVestingAsPreSeed.read.claimableTokenOf([
        preSeedUserAddress,
        Beneficiary.PreSeed,
        allocation,
      ]);

      const durationIndex = 1n;
      const lockDuration = await tokenStaking.read.lockDurations([durationIndex]);

      await tokenVestingAsPreSeed.write.claimAndStakeTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
        durationIndex,
        lockDuration
      ]);

      const amountUnlockedAtStart = (rateUnlockedAtStart * allocation) / 100n;

      const positions = await tokenStaking.read.getStakes([preSeedUserAddress]);

      expect(claimableToken).to.be.equal(amountUnlockedAtStart);

      expect(positions[0].amount).to.equal(amountUnlockedAtStart);
    });
  });

  describe("Token Release with Cliff no linear vesting", function () {
    it("Should release TGE + 50% of the allocation after Cliff +50% of (vesting period - cliff)", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        strategicPartnersUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsStrategicPartners = await tokenVestingAs(Beneficiary.StrategicPartners);

      const strategicPartnersUserAddress = strategicPartnersUser.account.address;

      const proof = getMerkleProof(tree, strategicPartnersUserAddress, Beneficiary.StrategicPartners);

      const { cliffDuration } = VESTING_SCHEDULES[Beneficiary.StrategicPartners];

      const allocation = BigInt(Beneficiary.StrategicPartners + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH);

      await mine(cliffDuration);

      const claimableToken = await tokenVestingAsStrategicPartners.read.claimableTokenOf([
        strategicPartnersUserAddress,
        Beneficiary.StrategicPartners,
        allocation,
      ]);

      await tokenVestingAsStrategicPartners.write.claimTokens([
        proof,
        Beneficiary.StrategicPartners,
        allocation,
      ]);

      const strategicPartnersUserBalance = await lingoToken.read.balanceOf([
        strategicPartnersUserAddress,
      ]);

      expect(claimableToken).to.be.equal(allocation);
      expect(strategicPartnersUserBalance).to.be.equal(claimableToken);
    });

    it("Should release unlockedAtStart during Cliff", async function () {
      const {
        tokenVestingAs,
        strategicPartnersUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsStrategicPartners = await tokenVestingAs(Beneficiary.StrategicPartners);

      const strategicPartnersUserAddress = strategicPartnersUser.account.address;

      const { cliffDuration } = VESTING_SCHEDULES[Beneficiary.StrategicPartners];

      const allocation = BigInt(Beneficiary.StrategicPartners + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH);

      await mine(cliffDuration / 2n);

      const claimableToken = await tokenVestingAsStrategicPartners.read.claimableTokenOf([
        strategicPartnersUserAddress,
        Beneficiary.StrategicPartners,
        allocation,
      ]);

      expect(claimableToken).to.be.equal(0n);
    });

    it("Should release 100% of the allocation after vesting", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        strategicPartnersUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsStrategicPartners = await tokenVestingAs(Beneficiary.StrategicPartners);

      const strategicPartnersUserAddress = strategicPartnersUser.account.address;

      const proof = getMerkleProof(tree, strategicPartnersUserAddress, Beneficiary.StrategicPartners);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.StrategicPartners];

      const allocation = BigInt(Beneficiary.StrategicPartners + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH);

      await mine(vestingDuration);

      const claimableToken = await tokenVestingAsStrategicPartners.read.claimableTokenOf([
        strategicPartnersUserAddress,
        Beneficiary.StrategicPartners,
        allocation,
      ]);

      await tokenVestingAsStrategicPartners.write.claimTokens([
        proof,
        Beneficiary.StrategicPartners,
        allocation,
      ]);

      const strategicPartnersUserBalance = await lingoToken.read.balanceOf([
        strategicPartnersUserAddress,
      ]);

      expect(claimableToken).to.be.equal(allocation);
      expect(strategicPartnersUserBalance).to.be.equal(claimableToken);
    });

    it("Should release 0% of the allocation after vesting", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        strategicPartnersUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsStrategicPartners = await tokenVestingAs(Beneficiary.StrategicPartners);

      const strategicPartnersUserAddress = strategicPartnersUser.account.address;

      const proof = getMerkleProof(tree, strategicPartnersUserAddress, Beneficiary.StrategicPartners);

      const allocation = BigInt(Beneficiary.StrategicPartners + 1) * ALLOCATION_AMOUNT;

      await mine(0);

      const claimableToken = await tokenVestingAsStrategicPartners.read.claimableTokenOf([
        strategicPartnersUserAddress,
        Beneficiary.StrategicPartners,
        allocation,
      ]);

      await expect(tokenVestingAsStrategicPartners.write.claimTokens([
        proof,
        Beneficiary.StrategicPartners,
        allocation,
      ])).to.be.rejected;

      const strategicPartnersUserBalance = await lingoToken.read.balanceOf([
        strategicPartnersUserAddress,
      ]);

      expect(claimableToken).to.be.equal(0n);
      expect(strategicPartnersUserBalance).to.be.equal(0n);
    });

    it("Should stake 100% of the allocation after vesting when calling claimAndStakeTokens", async function () {
      const {
        tokenStaking,
        tokenVestingAs,
        tree,
        strategicPartnersUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsStrategicPartners = await tokenVestingAs(Beneficiary.StrategicPartners);

      const strategicPartnersUserAddress = strategicPartnersUser.account.address;

      const proof = getMerkleProof(tree, strategicPartnersUserAddress, Beneficiary.StrategicPartners);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.StrategicPartners];

      const allocation = BigInt(Beneficiary.StrategicPartners + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH);

      await mine(vestingDuration);

      const claimableToken = await tokenVestingAsStrategicPartners.read.claimableTokenOf([
        strategicPartnersUserAddress,
        Beneficiary.StrategicPartners,
        allocation,
      ]);

      const durationIndex = 1n;
      const lockDuration = await tokenStaking.read.lockDurations([durationIndex]);

      await tokenVestingAsStrategicPartners.write.claimAndStakeTokens([
        proof,
        Beneficiary.StrategicPartners,
        allocation,
        durationIndex,
        lockDuration
      ]);

      const positions = await tokenStaking.read.getStakes([strategicPartnersUserAddress]);

      expect(claimableToken).to.be.equal(allocation);

      expect(positions[0].amount).to.equal(allocation);
    });
  });

  describe("Token Release, if the user also a SocialFi participant", function () {
    it("Should release TGE + 50% of the allocation after Cliff +50% of (vesting period - cliff)", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        preSeedUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const investorAddress = preSeedUser.account.address;

      const proof = getMerkleProof(tree, investorAddress, Beneficiary.PreSeed);
      const proofSocialFi = getMerkleProof(tree, investorAddress, Beneficiary.SocialFiParticipantsAirdrop);

      const { rateUnlockedAtStart, cliffDuration, vestingDuration } = VESTING_SCHEDULES[Beneficiary.PreSeed];
      const { rateUnlockedAtStart: rateUnlockedAtStartSocialFi, cliffDuration: cliffDurationSocialFi, vestingDuration: vestingDurationSocialFi } = VESTING_SCHEDULES[Beneficiary.SocialFiParticipantsAirdrop];

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      const amountUnlockedAtStart = (rateUnlockedAtStart * allocation) / 100n;
      const amountUnlockedAtStartSocialFi = (rateUnlockedAtStartSocialFi * allocation) / 100n;

      const expectedClaimableToken = amountUnlockedAtStart + (allocation - amountUnlockedAtStart) / 2n;
      const expectedClaimableTokenSocialFi = amountUnlockedAtStartSocialFi + (allocation - amountUnlockedAtStartSocialFi) / 2n;

      const halfVestingDurationSocialFi = cliffDurationSocialFi + (vestingDurationSocialFi - cliffDurationSocialFi) / 2n;
      await mine(1n * MONTH);
      await mine(halfVestingDurationSocialFi);

      const claimableTokenSocialFi = await tokenVestingAsPreSeed.read.claimableTokenOf([
        investorAddress,
        Beneficiary.SocialFiParticipantsAirdrop,
        allocation,
      ]);

      await tokenVestingAsPreSeed.write.claimTokens([
        proofSocialFi,
        Beneficiary.SocialFiParticipantsAirdrop,
        allocation,
      ]);

      const userBalanceAfterSocialFiClaim = await lingoToken.read.balanceOf([
        investorAddress,
      ]);

      expect(claimableTokenSocialFi).to.be.equal(expectedClaimableTokenSocialFi);
      expect(userBalanceAfterSocialFiClaim).to.be.equal(claimableTokenSocialFi);

      await mine((cliffDuration + (vestingDuration - cliffDuration) / 2n) - halfVestingDurationSocialFi);

      const claimableToken = await tokenVestingAsPreSeed.read.claimableTokenOf([
        investorAddress,
        Beneficiary.PreSeed,
        allocation,
      ]);

      await tokenVestingAsPreSeed.write.claimTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
      ]);

      const userBalance = await lingoToken.read.balanceOf([
        investorAddress,
      ]);

      expect(claimableToken).to.be.equal(expectedClaimableToken);
      expect(userBalance).to.be.equal(claimableToken + claimableTokenSocialFi);
    });

    it("Should release unlockedAtStart during Cliff", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        preSeedUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const preSeedUserAddress = preSeedUser.account.address;

      const proof = getMerkleProof(tree, preSeedUserAddress, Beneficiary.PreSeed);

      const { rateUnlockedAtStart, cliffDuration } = VESTING_SCHEDULES[Beneficiary.PreSeed];

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH);

      await mine(cliffDuration / 2n);

      const claimableToken = await tokenVestingAsPreSeed.read.claimableTokenOf([
        preSeedUserAddress,
        Beneficiary.PreSeed,
        allocation,
      ]);

      await tokenVestingAsPreSeed.write.claimTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
      ]);

      const amountUnlockedAtStart = (rateUnlockedAtStart * allocation) / 100n;

      const preSeedUserBalance = await lingoToken.read.balanceOf([
        preSeedUserAddress,
      ]);

      expect(claimableToken).to.be.equal(amountUnlockedAtStart);
      expect(preSeedUserBalance).to.be.equal(claimableToken);
    });

    it("Should release 100% of the allocation after vesting", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        preSeedUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const preSeedUserAddress = preSeedUser.account.address;

      const proof = getMerkleProof(tree, preSeedUserAddress, Beneficiary.PreSeed);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.PreSeed];

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH);

      await mine(vestingDuration);

      const claimableToken = await tokenVestingAsPreSeed.read.claimableTokenOf([
        preSeedUserAddress,
        Beneficiary.PreSeed,
        allocation,
      ]);

      await tokenVestingAsPreSeed.write.claimTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
      ]);

      const preSeedUserBalance = await lingoToken.read.balanceOf([
        preSeedUserAddress,
      ]);

      expect(claimableToken).to.be.equal(allocation);
      expect(preSeedUserBalance).to.be.equal(claimableToken);
    });

    it("Should release 0% of the allocation after vesting", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        preSeedUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const preSeedUserAddress = preSeedUser.account.address;

      const proof = getMerkleProof(tree, preSeedUserAddress, Beneficiary.PreSeed);

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(0);

      const claimableToken = await tokenVestingAsPreSeed.read.claimableTokenOf([
        preSeedUserAddress,
        Beneficiary.PreSeed,
        allocation,
      ]);

      await expect(tokenVestingAsPreSeed.write.claimTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
      ])).to.be.rejected;

      const preSeedUserBalance = await lingoToken.read.balanceOf([
        preSeedUserAddress,
      ]);

      expect(claimableToken).to.be.equal(0n);
      expect(preSeedUserBalance).to.be.equal(0n);
    });

    it("Should stake 100% of the allocation after vesting when calling claimAndStakeTokens", async function () {
      const {
        tokenStaking,
        tokenVestingAs,
        tree,
        preSeedUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const preSeedUserAddress = preSeedUser.account.address;

      const proof = getMerkleProof(tree, preSeedUserAddress, Beneficiary.PreSeed);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.PreSeed];

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH);

      await mine(vestingDuration);

      const claimableToken = await tokenVestingAsPreSeed.read.claimableTokenOf([
        preSeedUserAddress,
        Beneficiary.PreSeed,
        allocation,
      ]);

      const durationIndex = 1n;
      const lockDuration = await tokenStaking.read.lockDurations([durationIndex]);

      await tokenVestingAsPreSeed.write.claimAndStakeTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
        durationIndex,
        lockDuration
      ]);

      const positions = await tokenStaking.read.getStakes([preSeedUserAddress]);

      expect(claimableToken).to.be.equal(allocation);

      expect(positions[0].amount).to.equal(allocation);
    });

    it("Should stake unlockedAtStart during Cliff when calling claimAndStakeTokens", async function () {
      const {
        tokenStaking,
        tokenVestingAs,
        tree,
        preSeedUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const preSeedUserAddress = preSeedUser.account.address;

      const proof = getMerkleProof(tree, preSeedUserAddress, Beneficiary.PreSeed);

      const { rateUnlockedAtStart, cliffDuration } = VESTING_SCHEDULES[Beneficiary.PreSeed];

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH);

      await mine(cliffDuration / 2n);

      const claimableToken = await tokenVestingAsPreSeed.read.claimableTokenOf([
        preSeedUserAddress,
        Beneficiary.PreSeed,
        allocation,
      ]);

      const durationIndex = 1n;
      const lockDuration = await tokenStaking.read.lockDurations([durationIndex]);

      await tokenVestingAsPreSeed.write.claimAndStakeTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
        durationIndex,
        lockDuration
      ]);

      const amountUnlockedAtStart = (rateUnlockedAtStart * allocation) / 100n;

      const positions = await tokenStaking.read.getStakes([preSeedUserAddress]);

      expect(claimableToken).to.be.equal(amountUnlockedAtStart);

      expect(positions[0].amount).to.equal(amountUnlockedAtStart);
    });
  });

  describe("Events", function () {
    it("Should emit an event on Token Releases", async function () {
      const {
        tokenVestingAs,
        tree,
        preSeedUser,
        publicClient,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const preSeedUserAddress = preSeedUser.account.address;

      const proof = getMerkleProof(tree, preSeedUserAddress, Beneficiary.PreSeed);

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(20n * MONTH);

      const hash = await tokenVestingAsPreSeed.write.claimTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      // get the withdrawal events in the latest block
      const withdrawalEvents =
        await tokenVestingAsPreSeed.getEvents.TokensReleased();

      expect(withdrawalEvents).to.have.lengthOf(1);
      expect(withdrawalEvents[0].args.beneficiary?.toLowerCase()).to.equal(
        preSeedUserAddress,
      );
      expect(withdrawalEvents[0].args.amount).to.equal(allocation);
    });
  });
});
