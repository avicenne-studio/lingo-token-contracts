import {
  loadFixture,
  mine,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress } from "viem";
import { STAKING_SCHEDULES, DAY } from "../constants/staking-schedules";

describe("TokenStaking", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    const INITIAL_SUPPLY_WEI = 2000n * 10n ** 18n;
    const TOTAL_SUPPLY = BigInt(1_000_000_000n * 10n ** 18n);
    const FEES = BigInt(500n);

    // Contracts are deployed using the first signer/account by default
    const [
      owner,
      userA,
      userB,
      treasuryWallet,
    ] = await hre.viem.getWalletClients();

    const lingoToken = await hre.viem.deployContract("LingoToken", [
      INITIAL_SUPPLY_WEI,
      treasuryWallet.account.address,
      FEES,
    ]);

    const tokenStaking = await hre.viem.deployContract("TokenStaking", [
      owner.account.address,
      lingoToken.address,
      STAKING_SCHEDULES
    ]);


    await lingoToken.write.transfer([userA.account.address, INITIAL_SUPPLY_WEI / 2n]);
    await lingoToken.write.transfer([userB.account.address, INITIAL_SUPPLY_WEI / 2n]);

    const publicClient = await hre.viem.getPublicClient();

    const lingoTokenUserA = await hre.viem.getContractAt("LingoToken", lingoToken.address, {
        client: { wallet: userA },
    });
    const lingoTokenUserB = await hre.viem.getContractAt("LingoToken", lingoToken.address, {
        client: { wallet: userB },
    });

    await lingoTokenUserA.write.approve([tokenStaking.address, INITIAL_SUPPLY_WEI / 2n]);
    await lingoTokenUserB.write.approve([tokenStaking.address, INITIAL_SUPPLY_WEI / 2n]);

    const INTERNAL_ROLE = await lingoToken.read.INTERNAL_ROLE();
    await lingoToken.write.grantRole([INTERNAL_ROLE, tokenStaking.address]);

    const tokenStakingUserA = await hre.viem.getContractAt("TokenStaking", tokenStaking.address, {
        client: { wallet: userA },
    });

    const tokenStakingUserB = await hre.viem.getContractAt("TokenStaking", tokenStaking.address, {
        client: { wallet: userB },
    });

    const lockDurationsCount = await tokenStaking.read.lockDurationsCount();

    const lockDurations = await Promise.all(
      Array(Number(lockDurationsCount))
        .fill(0n)  
        .map(async (_, i) => {        
          return tokenStaking.read.lockDurations([BigInt(i)]);
        })
    );

    return {
      lingoToken,
      tokenStaking,
      TOTAL_SUPPLY,
      owner,
      userA,
      userB,
      tokenStakingUserA,
      tokenStakingUserB,
      lockDurations,
      publicClient,
    };
  }

  describe("Getters & setters", function () {
    it("Should set the right owner", async function () {
      const { tokenStaking, owner } = await loadFixture(deployFixture);

      expect(await tokenStaking.read.owner()).to.equal(
        getAddress(owner.account.address),
      );
    });

    it("Should be initialized with the right Durations", async function () {
      const { tokenStaking } = await loadFixture(deployFixture);

      for (let i = 0; i < STAKING_SCHEDULES.length; i++) {
        expect(await tokenStaking.read.lockDurations([BigInt(i)])).to.deep.equal(
          STAKING_SCHEDULES[i],
        );
      }
    });

    it("Should NOT update Duration if the caller is NOT the owner", async function () {
      const { tokenStakingUserA } = await loadFixture(deployFixture);
      
      await expect(tokenStakingUserA.write.updateLockDurations([STAKING_SCHEDULES])).to.be.rejected;
    });

    it("Should update Duration if the caller is the owner", async function () {
      const { tokenStaking } = await loadFixture(deployFixture);
      
      await tokenStaking.write.updateLockDurations([STAKING_SCHEDULES]);

      for (let i = 0; i < STAKING_SCHEDULES.length; i++) {
        expect(await tokenStaking.read.lockDurations([BigInt(i)])).to.deep.equal(
          STAKING_SCHEDULES[i],
        );
      }
    });
  });

  describe("Token Staking", function () {
    it("Should create a position when token are staked", async function () {
      const {
        userA,
        tokenStakingUserA,
        lockDurations,
      } = await loadFixture(deployFixture);

      const amountToStake = 100n * 10n ** 18n;
      const durationIndex = 1n;
      const lockDuration = lockDurations[Number(durationIndex)];
      const userAddress = userA.account.address;

      await tokenStakingUserA.write.stake([amountToStake, durationIndex, lockDuration, userAddress]);

      const positions = await tokenStakingUserA.read.getStakes([userAddress]);

      expect(positions[0].amount).to.equal(amountToStake);
    });

    it("Should create several position when token are staked", async function () {
      const {
        userA,
        userB,
        tokenStakingUserA,
        tokenStakingUserB,
        lockDurations
      } = await loadFixture(deployFixture);

      const amountToStakeA = 100n * 10n ** 18n;
      const amountToStakeB = 300n * 10n ** 18n;

      const userAddressA = userA.account.address;
      const userAddressB = userB.account.address;

      const durationIndexA = 0n;
      const lockDurationA = lockDurations[Number(durationIndexA)];

      const durationIndexB = 1n;
      const lockDurationB = lockDurations[Number(durationIndexB)];

      await tokenStakingUserA.write.stake([amountToStakeA, durationIndexA, lockDurationA, userAddressA]);
      const stakeBlock1 = BigInt(await time.latestBlock());

      // Just to interfer with userA positions
      await tokenStakingUserB.write.stake([amountToStakeB, durationIndexA, lockDurationA, userAddressB]);

      await tokenStakingUserA.write.stake([amountToStakeA, durationIndexB, lockDurationB, userAddressA]);
      const stakeBlock2 = BigInt(await time.latestBlock());

      const positions = await tokenStakingUserA.read.getStakes([userAddressA]);

      expect(positions).to.have.lengthOf(2);

      expect(positions[0].amount).to.equal(amountToStakeA);
      expect(positions[1].amount).to.equal(amountToStakeA);

      expect(positions[0].unlockBlock).to.equal(stakeBlock1 + lockDurations[0]);
      expect(positions[1].unlockBlock).to.equal(stakeBlock2 + lockDurations[1]);
    });

    it("Should NOT stake if the amount is NOT enough", async function () {
      const {
        userA,
        tokenStakingUserA,
        lockDurations,
      } = await loadFixture(deployFixture);

      const userAddress = userA.account.address;

      const amountToStake = 100_000n;
      const durationIndex = 0n;
      const lockDuration = lockDurations[Number(durationIndex)];

      await expect(tokenStakingUserA.write.stake([amountToStake, durationIndex, lockDuration, userAddress])).to.be.rejected;
    });

    it("Should NOT stake if the contract is not internal", async function () {
      const {
        lingoToken,
        owner,
        lockDurations,
        userA,
      } = await loadFixture(deployFixture);

      const tokenStaking = await hre.viem.deployContract("TokenStaking", [
        owner.account.address,
        lingoToken.address,
        STAKING_SCHEDULES
      ]);

      const userAddress = userA.account.address;

      const amountToStake = 100_000n * 10n ** 18n;
      const durationIndex = 0n;
      const lockDuration = lockDurations[Number(durationIndex)];

      await expect(tokenStaking.write.stake([amountToStake, durationIndex, lockDuration, userAddress])).to.be.rejected;
    });

    it("Should NOT stake if the period index is invalid", async function () {
      const {
        userA,
        tokenStakingUserA,
        lockDurations,
      } = await loadFixture(deployFixture);

      const userAddress = userA.account.address;

      const amountToStake = 1000n * 10n ** 18n;

      const durationIndex = 4n;
      const lockDuration = lockDurations[2];

      await expect(tokenStakingUserA.write.stake([amountToStake, durationIndex, lockDuration, userAddress])).to.be.rejected;
    });

    it("Should NOT stake if the period duration is invalid", async function () {
      const {
        userA,
        tokenStakingUserA,
        lockDurations,
      } = await loadFixture(deployFixture);

      const userAddress = userA.account.address;

      const amountToStake = 1000n * 10n ** 18n;

      const durationIndex = 2n;
      const lockDuration = lockDurations[1];

      await expect(tokenStakingUserA.write.stake([amountToStake, durationIndex, lockDuration, userAddress])).to.be.rejected;
    });
  });

  describe("Token Unstaking", function () {
    it("Should NOT unstake if the caller has no position", async function () {
      const {
        tokenStakingUserA,
      } = await loadFixture(deployFixture);

      await expect(tokenStakingUserA.write.unstake([0n])).to.be.rejected;
    });

    it("Should NOT unstake if the locking period is ongoing", async function () {
      const {
        userA,
        tokenStakingUserA,
        lockDurations
      } = await loadFixture(deployFixture);

      const amountToStake = 100n * 10n ** 18n;
      const userAddress = userA.account.address;

      const durationIndex = 0n;
      const lockDuration = lockDurations[Number(durationIndex)];

      await tokenStakingUserA.write.stake([amountToStake, durationIndex, lockDuration, userAddress]);

      await expect(tokenStakingUserA.write.unstake([durationIndex])).to.be.rejected;
    });

    it("Should unstake if the locking period is over", async function () {
      const {
        lingoToken,
        userA,
        tokenStakingUserA,
        lockDurations
      } = await loadFixture(deployFixture);

      const amountToStake = 100n * 10n ** 18n;
      const userAddress = userA.account.address;

      const durationIndex = 0n;
      const lockDuration = lockDurations[Number(durationIndex)];

      await tokenStakingUserA.write.stake([amountToStake, durationIndex, lockDuration, userAddress]);
      const balanceBefore = await lingoToken.read.balanceOf([userAddress]);

      await mine(lockDuration);

      await tokenStakingUserA.write.unstake([durationIndex])

      const balanceAfter = await lingoToken.read.balanceOf([userAddress]);

      const positions = await tokenStakingUserA.read.getStakes([userAddress]);

      expect(positions).to.be.empty;
      expect(balanceAfter - balanceBefore).to.equal(amountToStake);
    });

    it("Should not unstake if the position index is wrong", async function () {
      const {
        userA,
        tokenStakingUserA,
        lockDurations
      } = await loadFixture(deployFixture);

      const amountToStake = 100n * 10n ** 18n;
      const userAddress = userA.account.address;

      const durationIndex = 0n;
      const lockDuration = lockDurations[Number(durationIndex)];

      await tokenStakingUserA.write.stake([amountToStake, durationIndex, lockDuration, userAddress]);
      await mine(lockDuration);

      await expect(tokenStakingUserA.write.unstake([durationIndex + 1n])).to.be.rejected;
    });

    it("Should NOT unstake twice the same position", async function () {
      const {
        userA,
        tokenStakingUserA,
        lockDurations
      } = await loadFixture(deployFixture);

      const amountToStake = 100n * 10n ** 18n;
      const userAddress = userA.account.address;


      const durationIndex = 0n;
      const lockDuration = lockDurations[Number(durationIndex)];

      await tokenStakingUserA.write.stake([amountToStake, durationIndex, lockDuration, userAddress]);

      await mine(lockDurations[0]);

      await tokenStakingUserA.write.unstake([durationIndex]);

      await expect(tokenStakingUserA.write.unstake([durationIndex])).to.be.rejected;
    });

    it("Should correctly update positions after unstaking one", async function () {
      const {
        userA,
        tokenStakingUserA,
        lockDurations
      } = await loadFixture(deployFixture);

      const amountToStake = 100n * 10n ** 18n;
      const userAddress = userA.account.address;

      // Stake three positions with different lock durations
      const durationIndex0 = 0n;
      const durationIndex1 = 1n;
      const durationIndex2 = 2n;

      await tokenStakingUserA.write.stake([amountToStake, durationIndex0, lockDurations[Number(durationIndex0)], userAddress]);
      const stakeBlock1 = BigInt(await time.latestBlock());

      await tokenStakingUserA.write.stake([amountToStake, durationIndex1, lockDurations[Number(durationIndex1)], userAddress]);
      const stakeBlock2 = BigInt(await time.latestBlock());

      await tokenStakingUserA.write.stake([amountToStake, durationIndex2, lockDurations[Number(durationIndex2)], userAddress]);
      const stakeBlock3 = BigInt(await time.latestBlock());

      // Retrieve initial positions
      let positions = await tokenStakingUserA.read.getStakes([userAddress]);
      expect(positions).to.have.lengthOf(3);

      await mine(lockDurations[1]);

      // Unstake the position at index 1 (middle position)
      await tokenStakingUserA.write.unstake([1n]);

      // Retrieve updated positions
      positions = await tokenStakingUserA.read.getStakes([userAddress]);
      expect(positions).to.have.lengthOf(2);

      // Check that the last position was moved to index 1
      expect(positions[0].amount).to.equal(amountToStake);
      expect(positions[1].amount).to.equal(amountToStake);

      expect(positions[0].unlockBlock).to.equal(stakeBlock1 + lockDurations[0]); // original first position
      expect(positions[1].unlockBlock).to.equal(stakeBlock3 + lockDurations[2]); // moved last position
    });
  });

  describe("Events", function () {
    it("Should emit an event on Token Stake", async function () {
      const {
        userA,
        tokenStakingUserA,
        publicClient,
        lockDurations,
      } = await loadFixture(deployFixture);

      const amountToStake = 100n * 10n ** 18n;
      const durationIndex = 0n
      const lockDuration = lockDurations[Number(durationIndex)];
      const userAddress = userA.account.address;

      const hash = await tokenStakingUserA.write.stake([amountToStake, durationIndex, lockDuration, userAddress]);
      await publicClient.waitForTransactionReceipt({ hash });

      // get the withdrawal events in the latest block
      const withdrawalEvents = await tokenStakingUserA.getEvents.Staked();

      expect(withdrawalEvents).to.have.lengthOf(1);
      expect(withdrawalEvents[0].args.user?.toLowerCase()).to.equal(userAddress);
      expect(withdrawalEvents[0].args.amount).to.equal(amountToStake);
    });

    it("Should emit an event on Token Unstake", async function () {
      const {
        userA,
        tokenStakingUserA,
        publicClient,
        lockDurations
      } = await loadFixture(deployFixture);

      const amountToStake = 100n * 10n ** 18n;
      const durationIndex = 0n
      const lockDuration = lockDurations[Number(durationIndex)];
      const userAddress = userA.account.address;

      await tokenStakingUserA.write.stake([amountToStake, durationIndex, lockDuration, userAddress]);

      await mine(lockDurations[Number(durationIndex)]);

      const hash = await tokenStakingUserA.write.unstake([durationIndex]);
      await publicClient.waitForTransactionReceipt({ hash });

      // get the withdrawal events in the latest block
      const withdrawalEvents = await tokenStakingUserA.getEvents.Unstaked();

      expect(withdrawalEvents).to.have.lengthOf(1);
      expect(withdrawalEvents[0].args.user?.toLowerCase()).to.equal(userAddress);
      expect(withdrawalEvents[0].args.amount).to.equal(amountToStake);
    });

    it("Should emit an event on LockDurationsUpdated", async function () {
      const {
        userA,
        tokenStaking,
        publicClient,
      } = await loadFixture(deployFixture);

      const newDurations = [1n, 2n, 3n];

      const hash = await tokenStaking.write.updateLockDurations([newDurations]);
      await publicClient.waitForTransactionReceipt({ hash });

      // get the withdrawal events in the latest block
      const withdrawalEvents = await tokenStaking.getEvents.LockDurationsUpdated();

      expect(withdrawalEvents).to.have.lengthOf(1);
      expect(withdrawalEvents[0].args.durations).to.deep.equal(newDurations);
    });
  });
})