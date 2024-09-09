import {
  loadFixture,
  mine,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress } from "viem";
import { VESTING_SCHEDULES, MONTH } from "../constants/vesting-schedules";
import { getMerkleProof, getMerkleTree } from "../utils/merkle-tree";
import { Beneficiary } from "../types/beneficiary";

describe("TokenVesting", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
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

    const LAST_BLOCK = await time.latestBlock();

    const tokenVesting = await hre.viem.deployContract("TokenVesting", [
      owner.account.address,
      lingoToken.address,
      VESTING_SCHEDULES,
      BigInt(LAST_BLOCK) + 1n * MONTH,
    ]);

    const MINTER_ROLE = await lingoToken.read.MINTER_ROLE();

    await lingoToken.write.grantRole([MINTER_ROLE, tokenVesting.address]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      lingoToken,
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

    const tokenVestingAs = (beneficiary: Beneficiary) => {
      return hre.viem.getContractAt("TokenVesting", tokenVesting.address, {
        client: { wallet: accounts[beneficiary] },
      });
    };

    const tree = getMerkleTree(values);

    const merkleProofs = values.map((user) =>
      getMerkleProof(tree, user[0] as `0x${string}`),
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
  });

  describe("Merkle Tree", function () {
    it("Should validate the Merkle Proof if the Proof is valid", async function () {
      const { preSeedUser, tree, ALLOCATION_AMOUNT } = await loadFixture(
        deployAndInitializeFixture,
      );

      const proof = getMerkleProof(tree, preSeedUser.account.address);

      const leaf = [
        preSeedUser.account.address,
        Beneficiary.PreSeed,
        BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT,
      ];

      expect(tree.verify(leaf, proof)).to.be.true;
    });

    it("Should NOT change the Merkle Proof if the call is NOT the owner", async function () {
      const { tokenVestingAs, tree, preSeedUser } = await loadFixture(
        deployAndInitializeFixture,
      );

      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const preSeedUserAddress = preSeedUser.account.address;

      await expect(tokenVestingAsPreSeed.write.setMerkleRoot([tree.root as `0x${string}`])).to.be.rejected;
    });

    it("Should NOT validate the Merkle Proof if the Proof is NOT valid", async function () {
      const { preSeedUser, tree, ALLOCATION_AMOUNT } = await loadFixture(
        deployAndInitializeFixture,
      );
      const proof = getMerkleProof(tree, preSeedUser.account.address);

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

      const proof = getMerkleProof(tree, preSeedUserAddress);

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
        lingoToken,
        socialFiAirdropUser,
        tree,
        ALLOCATION_AMOUNT,
      } = await loadFixture(deployAndInitializeFixture);
      const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

      const socialFiAirdropUserAddress = socialFiAirdropUser.account.address;

      const proof = getMerkleProof(tree, socialFiAirdropUserAddress);

      const { vestingDuration } = VESTING_SCHEDULES[Beneficiary.PreSeed];

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH + vestingDuration);

      await expect(tokenVestingAsPreSeed.write.claimTokens([
        proof,
        Beneficiary.PreSeed,
        allocation,
      ])).to.rejectedWith("Invalid Merkle proof");
    });
  });

  describe("Token Relase", function () {
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

      const proof = getMerkleProof(tree, preSeedUserAddress);

      const { unlockedAtStart, cliffDuration, vestingDuration } = VESTING_SCHEDULES[Beneficiary.PreSeed];

      const allocation = BigInt(Beneficiary.PreSeed + 1) * ALLOCATION_AMOUNT;

      await mine(1n * MONTH);

      await mine(cliffDuration + (vestingDuration - cliffDuration) / 2n);
      
      const claimableToken = await tokenVestingAsPreSeed.read.claimableTokenOf([
        preSeedUserAddress,
        Beneficiary.PreSeed,
        allocation,
      ]);

      const amountUnlockedAtStart = (unlockedAtStart * allocation) / 100n;

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

      const proof = getMerkleProof(tree, preSeedUserAddress);

      const { unlockedAtStart, cliffDuration } = VESTING_SCHEDULES[Beneficiary.PreSeed];

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

      const amountUnlockedAtStart = (unlockedAtStart * allocation) / 100n;

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

      const proof = getMerkleProof(tree, preSeedUserAddress);

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

      const proof = getMerkleProof(tree, preSeedUserAddress);

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
      ])).to.rejectedWith("No tokens available for claim");

      const preSeedUserBalance = await lingoToken.read.balanceOf([
        preSeedUserAddress,
      ]);

      expect(claimableToken).to.be.equal(0n);
      expect(preSeedUserBalance).to.be.equal(0n);
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

      const proof = getMerkleProof(tree, preSeedUserAddress);

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
