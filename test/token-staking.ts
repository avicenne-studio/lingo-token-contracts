import {
  loadFixture,
  mine,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress } from "viem";
import { Interface } from "ethers";
import { STAKING_SCHEDULES, DAY } from "../constants/staking-schedules";

describe("TokenStaking", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    const INITIAL_SUPPLY = 2000n;
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
      INITIAL_SUPPLY,
      treasuryWallet.account.address,
      FEES,
    ]);

    const tokenStaking = await hre.viem.deployContract("TokenStaking", [
      owner.account.address,
      lingoToken.address,
      STAKING_SCHEDULES
    ]);

    const INITIAL_SUPPLY_WEI = INITIAL_SUPPLY * 10n ** 18n;

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
      } = await loadFixture(deployFixture);

      const amountToStake = 100n * 10n ** 18n;
      const duration = 14n * DAY;
      const userAddress = userA.account.address;

      await tokenStakingUserA.write.stake([amountToStake, duration, userAddress]);

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

      await tokenStakingUserA.write.stake([amountToStakeA, lockDurations[0], userAddressA]);
      const stakeBlock1 = BigInt(await time.latestBlock());

      // Just to interfer with userA positions
      await tokenStakingUserB.write.stake([amountToStakeB, lockDurations[0], userAddressB]);

      await tokenStakingUserA.write.stake([amountToStakeA, lockDurations[1], userAddressA]);
      const stakeBlock2 = BigInt(await time.latestBlock());

      const positions = await tokenStakingUserA.read.getStakes([userAddressA]);

      expect(positions).to.have.lengthOf(2);

      expect(positions[0].amount).to.equal(amountToStakeA);
      expect(positions[1].amount).to.equal(amountToStakeA);

      expect(positions[0].unlockBlock).to.equal(stakeBlock1 + lockDurations[0]);
      expect(positions[1].unlockBlock).to.equal(stakeBlock2 + lockDurations[1]);
    });

    it("Should NOT stake if the staking periode is NOT right", async function () {
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

      await tokenStakingUserA.write.stake([amountToStakeA, lockDurations[0], userAddressA]);
      const stakeBlock1 = BigInt(await time.latestBlock());

      // Just to interfer with userA positions
      await tokenStakingUserB.write.stake([amountToStakeB, lockDurations[0], userAddressB]);

      await tokenStakingUserA.write.stake([amountToStakeA, lockDurations[1], userAddressA]);
      const stakeBlock2 = BigInt(await time.latestBlock());

      const positions = await tokenStakingUserA.read.getStakes([userAddressA]);

      expect(positions).to.have.lengthOf(2);

      expect(positions[0].amount).to.equal(amountToStakeA);
      expect(positions[1].amount).to.equal(amountToStakeA);

      expect(positions[0].unlockBlock).to.equal(stakeBlock1 + lockDurations[0]);
      expect(positions[1].unlockBlock).to.equal(stakeBlock2 + lockDurations[1]);
    });

    it("Should NOT stake if the staking periode is NOT right", async function () {
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

      await tokenStakingUserA.write.stake([amountToStakeA, lockDurations[0], userAddressA]);
      const stakeBlock1 = BigInt(await time.latestBlock());

      // Just to interfer with userA positions
      await tokenStakingUserB.write.stake([amountToStakeB, lockDurations[0], userAddressB]);

      await tokenStakingUserA.write.stake([amountToStakeA, lockDurations[1], userAddressA]);
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
        lockDurations
      } = await loadFixture(deployFixture);

      const amountToStake = 100n * 10n ** 18n;
      const userAddress = userA.account.address;

      await expect(tokenStakingUserA.write.stake([amountToStake / 2n, lockDurations[0], userAddress])).to.be.rejected;
    });
  });

  describe("Events", function () {
    it("Should emit an event on Token Stake", async function () {
      const {
        userA,
        tokenStakingUserA,
        publicClient,
      } = await loadFixture(deployFixture);

      const amountToStake = 100n * 10n ** 18n;
      const duration = 14n * DAY;
      const userAddress = userA.account.address;

      const hash = await tokenStakingUserA.write.stake([amountToStake, duration, userAddress]);
      await publicClient.waitForTransactionReceipt({ hash });

      // get the withdrawal events in the latest block
      const withdrawalEvents = await tokenStakingUserA.getEvents.Staked();

      expect(withdrawalEvents).to.have.lengthOf(1);
      expect(withdrawalEvents[0].args.user?.toLowerCase()).to.equal(userAddress);
      expect(withdrawalEvents[0].args.amount).to.equal(amountToStake);
    });
  });
})