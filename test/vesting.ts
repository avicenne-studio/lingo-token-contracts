import {
  loadFixture,
  mine,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress } from "viem";
import { VESTING_SCHEDULES, DAY } from "../constants/vesting-schedules";
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
      kolRoundAUser,
      kolRoundBUser,
      kolRoundFreeAllocationUser,
      lingoIslandsAirdropUser,
      lingoIslandsAirdropFirstClassUser,
      partnersAirdropUser,
      partnersAirdropFirstClassUser,
      privateRound3MPostTGEUnlockUser,
      privateRoundAUser,
      privateRoundBUser,
      privateRoundCUser,
      privateRoundDUser,
      privateRoundEUser,
      privateRoundFUser,
      publicPresaleUser,
      publicPresaleFirstClassUser,
      publicRoundUser,
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
      BigInt(LAST_BLOCK) + 1n * DAY,
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
      kolRoundAUser,
      kolRoundBUser,
      kolRoundFreeAllocationUser,
      lingoIslandsAirdropUser,
      lingoIslandsAirdropFirstClassUser,
      partnersAirdropUser,
      partnersAirdropFirstClassUser,
      privateRound3MPostTGEUnlockUser,
      privateRoundAUser,
      privateRoundBUser,
      privateRoundCUser,
      privateRoundDUser,
      privateRoundEUser,
      privateRoundFUser,
      publicPresaleUser,
      publicPresaleFirstClassUser,
      publicRoundUser,
      teamUser,
      publicClient,
    };
  }

  async function deployAndInitializeFixture() {
    const { tokenVesting, ...fixture } = await loadFixture(deployFixture);

    const ALLOCATION_AMOUNT = BigInt(1_000n * 10n ** 18n);

    const accounts = [
      fixture.kolRoundAUser,
      fixture.kolRoundBUser,
      fixture.kolRoundFreeAllocationUser,
      fixture.lingoIslandsAirdropUser,
      fixture.lingoIslandsAirdropFirstClassUser,
      fixture.partnersAirdropUser,
      fixture.partnersAirdropFirstClassUser,
      fixture.privateRound3MPostTGEUnlockUser,
      fixture.privateRoundAUser,
      fixture.privateRoundBUser,
      fixture.privateRoundCUser,
      fixture.privateRoundDUser,
      fixture.privateRoundEUser,
      fixture.privateRoundFUser,
      fixture.publicPresaleUser,
      fixture.publicPresaleFirstClassUser,
      fixture.publicRoundUser,
      fixture.teamUser,
    ];

    const values = accounts.map((account, i) => [
      account.account.address,
      i,
      ALLOCATION_AMOUNT * BigInt(i + 1),
    ]);

    // kolRoundBUser is also a SocialFi participant
    values.push([accounts[1].account.address, Beneficiary.LingoIslandsAirdrop, BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT])

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
        BigInt(LAST_BLOCK) + 1n * DAY,
      ])).to.rejected;
    });
  });

  describe("Merkle Tree", function () {
    it("Should validate the Merkle Proof if the Proof is valid", async function () {
      const { kolRoundBUser, tree, ALLOCATION_AMOUNT } = await loadFixture(
        deployAndInitializeFixture,
      );

      const proof = getMerkleProof(tree, kolRoundBUser.account.address, Beneficiary.KOLRoundB);

      const leaf = [
        kolRoundBUser.account.address,
        Beneficiary.KOLRoundB,
        BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT,
      ];

      expect(tree.verify(leaf, proof)).to.be.true;
    });

    it("Should NOT set the Merkle Root if the call is NOT the owner", async function () {
      const { tree, lingoToken, tokenStaking, teamUser } = await loadFixture(
        deployAndInitializeFixture,
      );

      const LAST_BLOCK = await time.latestBlock();

      const tokenVesting = await hre.viem.deployContract("TokenVesting", [
        // random user is owner
        teamUser.account.address,
        lingoToken.address,
        tokenStaking.address,
        VESTING_SCHEDULES,
        BigInt(LAST_BLOCK) + 1n * DAY]);

      await expect(tokenVesting.write.setMerkleRoot([tree.root as `0x${string}`])).to.be.rejected;
    });
    it("Should NOT edit the Merkle Root", async function () {
      const { tokenVesting, tree } = await loadFixture(
        deployAndInitializeFixture,
      );

      await expect(tokenVesting.write.setMerkleRoot([tree.root as `0x${string}`])).to.be.rejected;
    });

    it("Should NOT validate the Merkle Proof if the Proof is NOT valid", async function () {
      const { kolRoundBUser, tree, ALLOCATION_AMOUNT } = await loadFixture(
        deployAndInitializeFixture,
      );
      const proof = getMerkleProof(tree, kolRoundBUser.account.address, Beneficiary.KOLRoundB);

      const leaf = [
        kolRoundBUser.account.address,
        Beneficiary.KOLRoundB,
        BigInt(Beneficiary.KOLRoundA) * ALLOCATION_AMOUNT,
      ];

      expect(tree.verify(leaf, proof)).to.be.false;
    });

    it("Should claim token if Merkle Proof is valid", async function () {
      const {
        tokenVestingAs,
        lingoToken,
        kolRoundBUser,
        tree,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const kolRoundBUserAddress = kolRoundBUser.account.address;

      const proof = getMerkleProof(tree, kolRoundBUserAddress, Beneficiary.KOLRoundB);

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);
      await mine(VESTING_SCHEDULES[Beneficiary.KOLRoundB].vestingDuration);

      await tokenVestingAsKOLRoundB.write.claimTokens([
        proof,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      const kolRoundBUserBalance = await lingoToken.read.balanceOf([
        kolRoundBUserAddress,
      ]);

      expect(kolRoundBUserBalance).to.equal(allocation);
    });

    it("Should NOT claim token if Merkle Proof is NOT valid", async function () {
      const {
        tokenVestingAs,
        lingoIslandsAirdropUser,
        tree,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const lingoIslandsAirdropUserAddress = lingoIslandsAirdropUser.account.address;

      const proof = getMerkleProof(tree, lingoIslandsAirdropUserAddress, Beneficiary.LingoIslandsAirdrop);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.KOLRoundB];

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY + vestingDuration);

      await expect(tokenVestingAsKOLRoundB.write.claimTokens([
        proof,
        Beneficiary.KOLRoundB,
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
        kolRoundBUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const kolRoundBUserAddress = kolRoundBUser.account.address;

      const proof = getMerkleProof(tree, kolRoundBUserAddress, Beneficiary.KOLRoundB);

      const { rateUnlockedAtStart, cliffDuration, vestingDuration } = VESTING_SCHEDULES[Beneficiary.KOLRoundB];

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);

      await mine(cliffDuration + (vestingDuration - cliffDuration) / 2n);

      const claimableToken = await tokenVestingAsKOLRoundB.read.claimableTokenOf([
        kolRoundBUserAddress,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      const amountUnlockedAtStart = (rateUnlockedAtStart * allocation) / 100n;

      const expectedClaimableToken = amountUnlockedAtStart + (allocation - amountUnlockedAtStart) / 2n;

      await tokenVestingAsKOLRoundB.write.claimTokens([
        proof,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      const kolRoundBUserBalance = await lingoToken.read.balanceOf([
        kolRoundBUserAddress,
      ]);

      expect(claimableToken).to.be.equal(expectedClaimableToken);
      expect(kolRoundBUserBalance).to.be.equal(claimableToken);
    });

    it("Should release unlockedAtStart during Cliff", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        kolRoundBUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const kolRoundBUserAddress = kolRoundBUser.account.address;

      const proof = getMerkleProof(tree, kolRoundBUserAddress, Beneficiary.KOLRoundB);

      const { rateUnlockedAtStart, cliffDuration } = VESTING_SCHEDULES[Beneficiary.KOLRoundB];

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);

      await mine(cliffDuration / 2n);

      const claimableToken = await tokenVestingAsKOLRoundB.read.claimableTokenOf([
        kolRoundBUserAddress,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      await tokenVestingAsKOLRoundB.write.claimTokens([
        proof,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      const amountUnlockedAtStart = (rateUnlockedAtStart * allocation) / 100n;

      const kolRoundBUserBalance = await lingoToken.read.balanceOf([
        kolRoundBUserAddress,
      ]);

      expect(claimableToken).to.be.equal(amountUnlockedAtStart);
      expect(kolRoundBUserBalance).to.be.equal(claimableToken);
    });

    it("Should release 100% of the allocation after vesting", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        kolRoundBUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const kolRoundBUserAddress = kolRoundBUser.account.address;

      const proof = getMerkleProof(tree, kolRoundBUserAddress, Beneficiary.KOLRoundB);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.KOLRoundB];

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);

      await mine(vestingDuration);

      const claimableToken = await tokenVestingAsKOLRoundB.read.claimableTokenOf([
        kolRoundBUserAddress,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      await tokenVestingAsKOLRoundB.write.claimTokens([
        proof,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      const kolRoundBUserBalance = await lingoToken.read.balanceOf([
        kolRoundBUserAddress,
      ]);

      expect(claimableToken).to.be.equal(allocation);
      expect(kolRoundBUserBalance).to.be.equal(claimableToken);
    });

    it("Should release 0% of the allocation after vesting", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        kolRoundBUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const kolRoundBUserAddress = kolRoundBUser.account.address;

      const proof = getMerkleProof(tree, kolRoundBUserAddress, Beneficiary.KOLRoundB);

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      await mine(0);

      const claimableToken = await tokenVestingAsKOLRoundB.read.claimableTokenOf([
        kolRoundBUserAddress,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      await expect(tokenVestingAsKOLRoundB.write.claimTokens([
        proof,
        Beneficiary.KOLRoundB,
        allocation,
      ])).to.be.rejected;

      const kolRoundBUserBalance = await lingoToken.read.balanceOf([
        kolRoundBUserAddress,
      ]);

      expect(claimableToken).to.be.equal(0n);
      expect(kolRoundBUserBalance).to.be.equal(0n);
    });

    it("Should stake 100% of the allocation after vesting when calling claimAndStakeTokens", async function () {
      const {
        tokenStaking,
        tokenVestingAs,
        tree,
        kolRoundBUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const kolRoundBUserAddress = kolRoundBUser.account.address;

      const proof = getMerkleProof(tree, kolRoundBUserAddress, Beneficiary.KOLRoundB);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.KOLRoundB];

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);

      await mine(vestingDuration);

      const claimableToken = await tokenVestingAsKOLRoundB.read.claimableTokenOf([
        kolRoundBUserAddress,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      const durationIndex = 1n;
      const lockDuration = await tokenStaking.read.lockDurations([durationIndex]);

      await tokenVestingAsKOLRoundB.write.claimAndStakeTokens([
        proof,
        Beneficiary.KOLRoundB,
        allocation,
        durationIndex,
        lockDuration
      ]);

      const positions = await tokenStaking.read.getStakes([kolRoundBUserAddress]);

      expect(claimableToken).to.be.equal(allocation);

      expect(positions[0].amount).to.equal(allocation);
    });

    it("Should stake unlockedAtStart during Cliff when calling claimAndStakeTokens", async function () {
      const {
        tokenStaking,
        tokenVestingAs,
        tree,
        kolRoundBUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const kolRoundBUserAddress = kolRoundBUser.account.address;

      const proof = getMerkleProof(tree, kolRoundBUserAddress, Beneficiary.KOLRoundB);

      const { rateUnlockedAtStart, cliffDuration } = VESTING_SCHEDULES[Beneficiary.KOLRoundB];

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);

      await mine(cliffDuration / 2n);

      const claimableToken = await tokenVestingAsKOLRoundB.read.claimableTokenOf([
        kolRoundBUserAddress,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      const durationIndex = 1n;
      const lockDuration = await tokenStaking.read.lockDurations([durationIndex]);

      await tokenVestingAsKOLRoundB.write.claimAndStakeTokens([
        proof,
        Beneficiary.KOLRoundB,
        allocation,
        durationIndex,
        lockDuration
      ]);

      const amountUnlockedAtStart = (rateUnlockedAtStart * allocation) / 100n;

      const positions = await tokenStaking.read.getStakes([kolRoundBUserAddress]);

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
        privateRound3MPostTGEUnlockUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPrivateRound3MPostTGEUnlock = await tokenVestingAs(Beneficiary.PrivateRound3MPostTGEUnlock);

      const privateRound3MPostTGEUnlockUserAddress = privateRound3MPostTGEUnlockUser.account.address;

      const proof = getMerkleProof(tree, privateRound3MPostTGEUnlockUserAddress, Beneficiary.PrivateRound3MPostTGEUnlock);

      const { cliffDuration } = VESTING_SCHEDULES[Beneficiary.PrivateRound3MPostTGEUnlock];

      const allocation = BigInt(Beneficiary.PrivateRound3MPostTGEUnlock + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);

      await mine(cliffDuration);

      const claimableToken = await tokenVestingAsPrivateRound3MPostTGEUnlock.read.claimableTokenOf([
        privateRound3MPostTGEUnlockUserAddress,
        Beneficiary.PrivateRound3MPostTGEUnlock,
        allocation,
      ]);

      await tokenVestingAsPrivateRound3MPostTGEUnlock.write.claimTokens([
        proof,
        Beneficiary.PrivateRound3MPostTGEUnlock,
        allocation,
      ]);

      const privateRound3MPostTGEUnlockUserBalance = await lingoToken.read.balanceOf([
        privateRound3MPostTGEUnlockUserAddress,
      ]);

      expect(claimableToken).to.be.equal(allocation);
      expect(privateRound3MPostTGEUnlockUserBalance).to.be.equal(claimableToken);
    });

    it("Should release unlockedAtStart during Cliff", async function () {
      const {
        tokenVestingAs,
        privateRound3MPostTGEUnlockUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPrivateRound3MPostTGEUnlock = await tokenVestingAs(Beneficiary.PrivateRound3MPostTGEUnlock);

      const privateRound3MPostTGEUnlockUserAddress = privateRound3MPostTGEUnlockUser.account.address;

      const { cliffDuration } = VESTING_SCHEDULES[Beneficiary.PrivateRound3MPostTGEUnlock];

      const allocation = BigInt(Beneficiary.PrivateRound3MPostTGEUnlock + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);

      await mine(cliffDuration / 2n);

      const claimableToken = await tokenVestingAsPrivateRound3MPostTGEUnlock.read.claimableTokenOf([
        privateRound3MPostTGEUnlockUserAddress,
        Beneficiary.PrivateRound3MPostTGEUnlock,
        allocation,
      ]);

      expect(claimableToken).to.be.equal(0n);
    });

    it("Should release 100% of the allocation after vesting", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        privateRound3MPostTGEUnlockUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPrivateRound3MPostTGEUnlock = await tokenVestingAs(Beneficiary.PrivateRound3MPostTGEUnlock);

      const privateRound3MPostTGEUnlockUserAddress = privateRound3MPostTGEUnlockUser.account.address;

      const proof = getMerkleProof(tree, privateRound3MPostTGEUnlockUserAddress, Beneficiary.PrivateRound3MPostTGEUnlock);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.PrivateRound3MPostTGEUnlock];

      const allocation = BigInt(Beneficiary.PrivateRound3MPostTGEUnlock + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);

      await mine(vestingDuration);

      const claimableToken = await tokenVestingAsPrivateRound3MPostTGEUnlock.read.claimableTokenOf([
        privateRound3MPostTGEUnlockUserAddress,
        Beneficiary.PrivateRound3MPostTGEUnlock,
        allocation,
      ]);

      await tokenVestingAsPrivateRound3MPostTGEUnlock.write.claimTokens([
        proof,
        Beneficiary.PrivateRound3MPostTGEUnlock,
        allocation,
      ]);

      const privateRound3MPostTGEUnlockUserBalance = await lingoToken.read.balanceOf([
        privateRound3MPostTGEUnlockUserAddress,
      ]);

      expect(claimableToken).to.be.equal(allocation);
      expect(privateRound3MPostTGEUnlockUserBalance).to.be.equal(claimableToken);
    });

    it("Should release 0% of the allocation after vesting", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        privateRound3MPostTGEUnlockUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPrivateRound3MPostTGEUnlock = await tokenVestingAs(Beneficiary.PrivateRound3MPostTGEUnlock);

      const privateRound3MPostTGEUnlockUserAddress = privateRound3MPostTGEUnlockUser.account.address;

      const proof = getMerkleProof(tree, privateRound3MPostTGEUnlockUserAddress, Beneficiary.PrivateRound3MPostTGEUnlock);

      const allocation = BigInt(Beneficiary.PrivateRound3MPostTGEUnlock + 1) * ALLOCATION_AMOUNT;

      await mine(0);

      const claimableToken = await tokenVestingAsPrivateRound3MPostTGEUnlock.read.claimableTokenOf([
        privateRound3MPostTGEUnlockUserAddress,
        Beneficiary.PrivateRound3MPostTGEUnlock,
        allocation,
      ]);

      await expect(tokenVestingAsPrivateRound3MPostTGEUnlock.write.claimTokens([
        proof,
        Beneficiary.PrivateRound3MPostTGEUnlock,
        allocation,
      ])).to.be.rejected;

      const privateRound3MPostTGEUnlockUserBalance = await lingoToken.read.balanceOf([
        privateRound3MPostTGEUnlockUserAddress,
      ]);

      expect(claimableToken).to.be.equal(0n);
      expect(privateRound3MPostTGEUnlockUserBalance).to.be.equal(0n);
    });

    it("Should stake 100% of the allocation after vesting when calling claimAndStakeTokens", async function () {
      const {
        tokenStaking,
        tokenVestingAs,
        tree,
        privateRound3MPostTGEUnlockUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPrivateRound3MPostTGEUnlock = await tokenVestingAs(Beneficiary.PrivateRound3MPostTGEUnlock);

      const privateRound3MPostTGEUnlockUserAddress = privateRound3MPostTGEUnlockUser.account.address;

      const proof = getMerkleProof(tree, privateRound3MPostTGEUnlockUserAddress, Beneficiary.PrivateRound3MPostTGEUnlock);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.PrivateRound3MPostTGEUnlock];

      const allocation = BigInt(Beneficiary.PrivateRound3MPostTGEUnlock + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);

      await mine(vestingDuration);

      const claimableToken = await tokenVestingAsPrivateRound3MPostTGEUnlock.read.claimableTokenOf([
        privateRound3MPostTGEUnlockUserAddress,
        Beneficiary.PrivateRound3MPostTGEUnlock,
        allocation,
      ]);

      const durationIndex = 1n;
      const lockDuration = await tokenStaking.read.lockDurations([durationIndex]);

      await tokenVestingAsPrivateRound3MPostTGEUnlock.write.claimAndStakeTokens([
        proof,
        Beneficiary.PrivateRound3MPostTGEUnlock,
        allocation,
        durationIndex,
        lockDuration
      ]);

      const positions = await tokenStaking.read.getStakes([privateRound3MPostTGEUnlockUserAddress]);

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
        kolRoundBUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const investorAddress = kolRoundBUser.account.address;

      const proof = getMerkleProof(tree, investorAddress, Beneficiary.KOLRoundB);
      const proofSocialFi = getMerkleProof(tree, investorAddress, Beneficiary.LingoIslandsAirdrop);

      const { rateUnlockedAtStart, cliffDuration, vestingDuration } = VESTING_SCHEDULES[Beneficiary.KOLRoundB];
      const { rateUnlockedAtStart: rateUnlockedAtStartSocialFi, cliffDuration: cliffDurationSocialFi, vestingDuration: vestingDurationSocialFi } = VESTING_SCHEDULES[Beneficiary.LingoIslandsAirdrop];

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      const amountUnlockedAtStart = (rateUnlockedAtStart * allocation) / 100n;
      const amountUnlockedAtStartSocialFi = (rateUnlockedAtStartSocialFi * allocation) / 100n;

      const expectedClaimableToken = amountUnlockedAtStart + (allocation - amountUnlockedAtStart) / 2n;
      const expectedClaimableTokenSocialFi = amountUnlockedAtStartSocialFi + (allocation - amountUnlockedAtStartSocialFi) / 2n;

      const halfVestingDurationSocialFi = cliffDurationSocialFi + (vestingDurationSocialFi - cliffDurationSocialFi) / 2n;

      await mine(1n * DAY);
      await mine(halfVestingDurationSocialFi);

      const claimableTokenSocialFi = await tokenVestingAsKOLRoundB.read.claimableTokenOf([
        investorAddress,
        Beneficiary.LingoIslandsAirdrop,
        allocation,
      ]);

      await tokenVestingAsKOLRoundB.write.claimTokens([
        proofSocialFi,
        Beneficiary.LingoIslandsAirdrop,
        allocation,
      ]);

      const userBalanceAfterSocialFiClaim = await lingoToken.read.balanceOf([
        investorAddress,
      ]);

      expect(claimableTokenSocialFi).to.be.equal(expectedClaimableTokenSocialFi);
      expect(userBalanceAfterSocialFiClaim).to.be.equal(claimableTokenSocialFi);

      await mine((cliffDuration + (vestingDuration - cliffDuration) / 2n) - halfVestingDurationSocialFi);

      const claimableToken = await tokenVestingAsKOLRoundB.read.claimableTokenOf([
        investorAddress,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      await tokenVestingAsKOLRoundB.write.claimTokens([
        proof,
        Beneficiary.KOLRoundB,
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
        kolRoundBUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const kolRoundBUserAddress = kolRoundBUser.account.address;

      const proof = getMerkleProof(tree, kolRoundBUserAddress, Beneficiary.KOLRoundB);

      const { rateUnlockedAtStart, cliffDuration } = VESTING_SCHEDULES[Beneficiary.KOLRoundB];

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);

      await mine(cliffDuration / 2n);

      const claimableToken = await tokenVestingAsKOLRoundB.read.claimableTokenOf([
        kolRoundBUserAddress,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      await tokenVestingAsKOLRoundB.write.claimTokens([
        proof,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      const amountUnlockedAtStart = (rateUnlockedAtStart * allocation) / 100n;

      const kolRoundBUserBalance = await lingoToken.read.balanceOf([
        kolRoundBUserAddress,
      ]);

      expect(claimableToken).to.be.equal(amountUnlockedAtStart);
      expect(kolRoundBUserBalance).to.be.equal(claimableToken);
    });

    it("Should release 100% of the allocation after vesting", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        kolRoundBUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const kolRoundBUserAddress = kolRoundBUser.account.address;

      const proof = getMerkleProof(tree, kolRoundBUserAddress, Beneficiary.KOLRoundB);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.KOLRoundB];

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);

      await mine(vestingDuration);

      const claimableToken = await tokenVestingAsKOLRoundB.read.claimableTokenOf([
        kolRoundBUserAddress,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      await tokenVestingAsKOLRoundB.write.claimTokens([
        proof,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      const kolRoundBUserBalance = await lingoToken.read.balanceOf([
        kolRoundBUserAddress,
      ]);

      expect(claimableToken).to.be.equal(allocation);
      expect(kolRoundBUserBalance).to.be.equal(claimableToken);
    });

    it("Should release 0% of the allocation after vesting", async function () {
      const {
        lingoToken,
        tokenVestingAs,
        tree,
        kolRoundBUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const kolRoundBUserAddress = kolRoundBUser.account.address;

      const proof = getMerkleProof(tree, kolRoundBUserAddress, Beneficiary.KOLRoundB);

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      await mine(0);

      const claimableToken = await tokenVestingAsKOLRoundB.read.claimableTokenOf([
        kolRoundBUserAddress,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      await expect(tokenVestingAsKOLRoundB.write.claimTokens([
        proof,
        Beneficiary.KOLRoundB,
        allocation,
      ])).to.be.rejected;

      const kolRoundBUserBalance = await lingoToken.read.balanceOf([
        kolRoundBUserAddress,
      ]);

      expect(claimableToken).to.be.equal(0n);
      expect(kolRoundBUserBalance).to.be.equal(0n);
    });

    it("Should stake 100% of the allocation after vesting when calling claimAndStakeTokens", async function () {
      const {
        tokenStaking,
        tokenVestingAs,
        tree,
        kolRoundBUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const kolRoundBUserAddress = kolRoundBUser.account.address;

      const proof = getMerkleProof(tree, kolRoundBUserAddress, Beneficiary.KOLRoundB);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.KOLRoundB];

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);

      await mine(vestingDuration);

      const claimableToken = await tokenVestingAsKOLRoundB.read.claimableTokenOf([
        kolRoundBUserAddress,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      const durationIndex = 1n;
      const lockDuration = await tokenStaking.read.lockDurations([durationIndex]);

      await tokenVestingAsKOLRoundB.write.claimAndStakeTokens([
        proof,
        Beneficiary.KOLRoundB,
        allocation,
        durationIndex,
        lockDuration
      ]);

      const positions = await tokenStaking.read.getStakes([kolRoundBUserAddress]);

      expect(claimableToken).to.be.equal(allocation);

      expect(positions[0].amount).to.equal(allocation);
    });

    it("Should stake unlockedAtStart during Cliff when calling claimAndStakeTokens", async function () {
      const {
        tokenStaking,
        tokenVestingAs,
        tree,
        kolRoundBUser,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const kolRoundBUserAddress = kolRoundBUser.account.address;

      const proof = getMerkleProof(tree, kolRoundBUserAddress, Beneficiary.KOLRoundB);

      const { rateUnlockedAtStart, cliffDuration } = VESTING_SCHEDULES[Beneficiary.KOLRoundB];

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);

      await mine(cliffDuration / 2n);

      const claimableToken = await tokenVestingAsKOLRoundB.read.claimableTokenOf([
        kolRoundBUserAddress,
        Beneficiary.KOLRoundB,
        allocation,
      ]);

      const durationIndex = 1n;
      const lockDuration = await tokenStaking.read.lockDurations([durationIndex]);

      await tokenVestingAsKOLRoundB.write.claimAndStakeTokens([
        proof,
        Beneficiary.KOLRoundB,
        allocation,
        durationIndex,
        lockDuration
      ]);

      const amountUnlockedAtStart = (rateUnlockedAtStart * allocation) / 100n;

      const positions = await tokenStaking.read.getStakes([kolRoundBUserAddress]);

      expect(claimableToken).to.be.equal(amountUnlockedAtStart);

      expect(positions[0].amount).to.equal(amountUnlockedAtStart);
    });
  });

  describe("Events", function () {
    it("Should emit an event on Token Releases", async function () {
      const {
        tokenVestingAs,
        tree,
        kolRoundBUser,
        publicClient,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsKOLRoundB = await tokenVestingAs(Beneficiary.KOLRoundB);

      const kolRoundBUserAddress = kolRoundBUser.account.address;

      const proof = getMerkleProof(tree, kolRoundBUserAddress, Beneficiary.KOLRoundB);

      const allocation = BigInt(Beneficiary.KOLRoundB + 1) * ALLOCATION_AMOUNT;

      await mine(1n * DAY);
      await mine(VESTING_SCHEDULES[Beneficiary.KOLRoundB].vestingDuration);

      const hash = await tokenVestingAsKOLRoundB.write.claimTokens([
        proof,
        Beneficiary.KOLRoundB,
        allocation,
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      // get the withdrawal events in the latest block
      const withdrawalEvents =
        await tokenVestingAsKOLRoundB.getEvents.TokensReleased();

      expect(withdrawalEvents).to.have.lengthOf(1);
      expect(withdrawalEvents[0].args.beneficiary?.toLowerCase()).to.equal(
        kolRoundBUserAddress,
      );
      expect(withdrawalEvents[0].args.amount).to.equal(allocation);
    });
  });
});
