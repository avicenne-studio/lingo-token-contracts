const { describe } = require('mocha');
import { expect } from "chai";
import hre from "hardhat";

import { debitFee } from "../utils/debit-fee";

const { INITIAL_SUPPLY, DECIMALS, FEE } = {
    DECIMALS: 18n,
    INITIAL_SUPPLY: 1_000_000_000n / 2n,
    FEE: 500n, // 5%
};

describe('LINGO Token', async () => {
  let token: any;
  const [owner, user1, user2, user3, treasuryWallet] = await hre.viem.getWalletClients();

  let tokenAs: any;
  let INTERNAL_ROLE: any;
  let EXTERNAL_ROLE: any;

  const publicClient = await hre.viem.getPublicClient();

  beforeEach(async () => {
    token = await hre.viem.deployContract("LingoToken", [
      INITIAL_SUPPLY,
      treasuryWallet.account.address,
      FEE
    ]);

    const MINTER_ROLE = await token.read.MINTER_ROLE();
    INTERNAL_ROLE = await token.read.INTERNAL_ROLE();
    EXTERNAL_ROLE = await token.read.EXTERNAL_ROLE();
    token.write.grantRole([MINTER_ROLE, owner.account.address]);

    tokenAs = (account: any) => {
        return hre.viem.getContractAt("LingoToken", token.address, {
          client: { wallet: account },
        });
      };
  });

  describe('Deployment', async () => {
    it('Ownership transferred from deployer to owner', async () => {
        const DEFAULT_ADMIN_ROLE = await token.read.DEFAULT_ADMIN_ROLE();
        const result = await token.read.hasRole([DEFAULT_ADMIN_ROLE, owner.account.address]);
        expect(result).to.be.true;
    });

    it('Reverts when trying to deploy with initial supply > MAX_SUPPLY', async () => {
      const TOO_LARGE_SUPPLY = 10_000_000_000n

      await expect(
        hre.viem.deployContract("LingoToken", [
          TOO_LARGE_SUPPLY,
          treasuryWallet.account.address,
          FEE,
        ])).to.be.rejected;
    });

    it('Reverts when trying to deploy with zero address as treasury address', async () => {
      await expect(
        hre.viem.deployContract("LingoToken", [
          INITIAL_SUPPLY,
          hre.ethers.ZeroAddress,
          FEE,
        ])).to.be.rejected;
    });
  });

  describe('Metadata', () => {
    it('Token metadata is correct', async () => {
      expect(await token.read.name()).to.equal("Lingo");
      expect(await token.read.symbol()).to.equal("LINGO");
      expect(await token.read.decimals()).to.equals(Number(DECIMALS));
      expect(await token.read.getTransferFee()).to.equals(FEE);
    });
  });

  describe('Balance', () => {
    it('Users can check their balance', async () => {
      expect((await token.read.balanceOf([user1.account.address]))).to.equals(0n);

      const amountToSendBN = 100n * 10n ** DECIMALS;
      // admin to user1.account.address
      await token.write.transfer([user1.account.address, amountToSendBN]);
      expect((await token.read.balanceOf([user1.account.address]))).to.equals(amountToSendBN);
    });
  });

  describe('Access list', () => {
    it('Admin can add several addresses to the external access list', async () => {
      const EXTERNAL_ROLE = await token.read.EXTERNAL_ROLE();
      await token.write.addExternalAccess([[user1.account.address, user2.account.address]]);
      expect(await token.read.hasRole([EXTERNAL_ROLE, user1.account.address])).to.be.true;
      expect(await token.read.hasRole([EXTERNAL_ROLE, user2.account.address])).to.be.true;
    });
    it('Admin can remove addresses from the external access list', async () => {
      const EXTERNAL_ROLE = await token.read.EXTERNAL_ROLE();
      await token.write.addExternalAccess([[user1.account.address, user2.account.address, user3.account.address]]);
      await token.write.revokeAccess([[user1.account.address, user3.account.address]]);
      expect(await token.read.hasRole([EXTERNAL_ROLE, user1.account.address])).to.be.false;
      expect(await token.read.hasRole([EXTERNAL_ROLE, user2.account.address])).to.be.true;
      expect(await token.read.hasRole([EXTERNAL_ROLE, user3.account.address])).to.be.false;
    });

    it('User can NOT add or remove addresses from the external access list', async () => {
      const tokenAsUser1 = await tokenAs(user1);
      await expect(tokenAsUser1.write.addExternalAccess([[user1.account.address]])).to.be.rejected;
      await expect(tokenAsUser1.write.revokeAccess([[user1.account.address]])).to.be.rejected;
    });
    it('Admin can add several addresses to the internal access list', async () => {
      const INTERNAL_ROLE = await token.read.INTERNAL_ROLE();
      await token.write.addInternalAccess([[user1.account.address, user2.account.address]]);
      expect(await token.read.hasRole([INTERNAL_ROLE, user1.account.address])).to.be.true;
      expect(await token.read.hasRole([INTERNAL_ROLE, user2.account.address])).to.be.true;
    });
    it('Admin can remove addresses from the internal access list', async () => {
      const INTERNAL_ROLE = await token.read.INTERNAL_ROLE();
      await token.write.addInternalAccess([[user1.account.address, user2.account.address, user3.account.address]]);
      await token.write.revokeAccess([[user1.account.address, user3.account.address]]);
      expect(await token.read.hasRole([INTERNAL_ROLE, user1.account.address])).to.be.false;
      expect(await token.read.hasRole([INTERNAL_ROLE, user2.account.address])).to.be.true;
      expect(await token.read.hasRole([INTERNAL_ROLE, user3.account.address])).to.be.false;
    });

    it('User can NOT add or remove addresses from the internal access list', async () => {
      const tokenAsUser1 = await tokenAs(user1);
      await expect(tokenAsUser1.write.addInternalAccess([[user1.account.address]])).to.be.rejected;
      await expect(tokenAsUser1.write.revokeAccess([[user1.account.address]])).to.be.rejected;
    });
  });

  describe('Transfer', () => {
    it('Initial supply minted and transferred to owner', async () => {
      expect((await token.read.balanceOf([owner.account.address]))).to.equals(INITIAL_SUPPLY * 10n ** DECIMALS);
    });

    it('Users can transfer tokens to other users', async () => {
      const amountToSendBN = 100n * 10n ** DECIMALS;
      
      // admin to user1.account.address
      await token.write.transfer([user1.account.address, amountToSendBN]);
      expect(await token.read.balanceOf([user1.account.address])).to.equals(amountToSendBN);

      //user1.account.address to user2.account.address
      await (await tokenAs(user1)).write.transfer([user2.account.address, amountToSendBN]);
      const expectedBalanceOfUser2 = await debitFee(token, amountToSendBN);
      
      expect(await token.read.balanceOf([user2.account.address])).to.equals(expectedBalanceOfUser2);
    });

    it('Internal access listed users get no fees when sending and receiving to/from other users', async () => {
      const amountToSendBN = 100n * 10n ** DECIMALS;

      const internalUser = user1;
      const tokenAsInternalUser = await tokenAs(internalUser);
      const randomUser = user2;
      const tokenAsRandomUser = await tokenAs(randomUser);

      await token.write.grantRole([INTERNAL_ROLE, internalUser.account.address]);
      await token.write.mint([internalUser.account.address, amountToSendBN]);
      
      // No fees when sending
      await tokenAsInternalUser.write.transfer([randomUser.account.address, amountToSendBN]);
      expect(await token.read.balanceOf([randomUser.account.address])).to.equals(amountToSendBN);
      
      // No fees when sending
      await tokenAsRandomUser.write.transfer([internalUser.account.address, amountToSendBN]);
      expect(await token.read.balanceOf([internalUser.account.address])).to.equals(amountToSendBN);
    });

    it('External acccess listed users get no fees when receiving from other users', async () => {
      const amountToSendBN = 100n * 10n ** DECIMALS;

      const externalUser = user1;
      const randomUser = user2;
      const tokenAsRandomUser = await tokenAs(randomUser);

      await token.write.grantRole([EXTERNAL_ROLE, externalUser.account.address]);
      await token.write.mint([randomUser.account.address, amountToSendBN]);

      // No fees when sending
      await tokenAsRandomUser.write.transfer([externalUser.account.address, amountToSendBN]);
      expect(await token.read.balanceOf([externalUser.account.address])).to.equals(amountToSendBN);
    });

    it('External acccess listed users get fees when sending to other users', async () => {
      const amountToSendBN = 100n * 10n ** DECIMALS;

      const externalUser = user1;
      const tokenAsExternalUser = await tokenAs(externalUser);
      const randomUser = user2;

      await token.write.grantRole([EXTERNAL_ROLE, externalUser.account.address]);
      await token.write.mint([externalUser.account.address, amountToSendBN]);

      await tokenAsExternalUser.write.transfer([randomUser.account.address, amountToSendBN]);
      const expectedBalanceOfRandomUser = await debitFee(token, amountToSendBN);
      
      expect(await token.read.balanceOf([randomUser.account.address])).to.equals(expectedBalanceOfRandomUser);
    });

    it('Event emitted when tokens are transferred', async () => {
      const amountToSendBN = 100n * 10n ** DECIMALS;
      const hash = await token.write.transfer([user1.account.address, amountToSendBN]);

      await publicClient.waitForTransactionReceipt({ hash });

      const transferEvents = await token.getEvents.Transfer();

      expect(transferEvents.length).to.equals(1);
      expect(transferEvents[0].args.from.toLowerCase()).to.equals(owner.account.address);
      expect(transferEvents[0].args.to.toLowerCase()).to.equals(user1.account.address);
      expect(transferEvents[0].args.value).to.equals(amountToSendBN);
    });

    it('Reverts if user tries to transfer tokens without enough balance', async () => {
      const amountToSendBN = 100n * 10n ** DECIMALS;
      await expect(
        (await tokenAs(user3)).write.transfer([user2.account.address, amountToSendBN])
      ).to.be.rejected;
    });

    it('Reverts if user tries to transfer tokens to zero address', async () => {
      const amountToSendBN = 10n * 10n ** DECIMALS;
      await expect(token.write.transfer([hre.ethers.ZeroAddress, amountToSendBN])).to.be.rejected;
    });
  });

  describe('Allowance', () => {
    it('Users can check their allowance', async () => {
      expect(await token.read.allowance([owner.account.address, user1.account.address])).to.equals(0n);

      const amountToSendBN = 1000n * 10n ** DECIMALS;
      // approving allowance
      await token.write.approve([user1.account.address, amountToSendBN]);
      // checking allowance
      expect(await token.read.allowance([owner.account.address, user1.account.address])).to.equals(amountToSendBN);
    });

    it('Approve transfer of available tokens by third-party', async () => {
      const amountToSendBN = 1000n * 10n ** DECIMALS;
      const balanceOfOwner = await token.read.balanceOf([owner.account.address]);
      const balanceOfUser1 = await token.read.balanceOf([user1.account.address]);
      const balanceOfUser2 = await token.read.balanceOf([user2.account.address]);
      // approving allowance
      await token.write.approve([user1.account.address, amountToSendBN]);
      // checking allowance

      expect((await token.read.allowance([owner.account.address, user1.account.address]))).to.equals(amountToSendBN);
      // verifying transaction of approved tokens
      await (await tokenAs(user1)).write.transferFrom([owner.account.address, user2.account.address, amountToSendBN]);

      expect(await token.read.balanceOf([owner.account.address])).to.equals(balanceOfOwner - amountToSendBN);

      expect(await token.read.balanceOf([user1.account.address])).to.equals(balanceOfUser1);

      expect(await token.read.balanceOf([user2.account.address])).to.equals(balanceOfUser2 + amountToSendBN);
    });

    it('Event emitted someone approves transfer of available tokens by third-party', async () => {
      const amountToSendBN = 1000n * 10n ** DECIMALS;

      const hash = await token.write.approve([user1.account.address, amountToSendBN]);

      await publicClient.waitForTransactionReceipt({ hash });

      const approvalEvents = await token.getEvents.Approval();

      expect(approvalEvents.length).to.equals(1);
      expect(approvalEvents[0].args.owner.toLowerCase()).to.equals(owner.account.address);
      expect(approvalEvents[0].args.spender.toLowerCase()).to.equals(user1.account.address);
      expect(approvalEvents[0].args.value).to.equals(amountToSendBN);
    });

    it('Revert when trying to approve unavailable tokens by third-party', async () => {
      const amountToSendBN = 1000n * 10n ** DECIMALS;
      // approving allowance
      await (await tokenAs(user1)).write.approve([user2.account.address, amountToSendBN]);
      // checking allowance
      expect(await token.read.allowance([user1.account.address, user2.account.address])).to.equals(amountToSendBN);
      // verifying transaction of approved tokens
      await expect(
        (await tokenAs(user2)).write.transferFrom([user1.account.address, user3.account.address, amountToSendBN])
      ).to.be.rejected;
    });

    it('Revert when trying to transfer more than allowed tokens by third-party', async () => {
      const amountToSendBN = 1000n * 10n ** DECIMALS;
      // approving allowance
      await token.write.approve([user1.account.address, amountToSendBN]);
      // checking allowance
      expect(await token.read.allowance([owner.account.address, user1.account.address])).to.equals(amountToSendBN);
      // verifying transaction of approved tokens
      await expect(
        (await tokenAs(user1)).write.transferFrom(owner.account.address, user2.account.address, amountToSendBN + 1000n)
      ).to.be.rejected;
    });
  });

  describe('Mint', () => {
    it('Minter can mint tokens upto the max supply', async () => {
      const amountToMintBN = 500n * 10n ** DECIMALS;
      const ownerBalanceBeforeMintBN = await token.read.balanceOf([owner.account.address]);

      await token.write.mint([owner.account.address, amountToMintBN]);
      expect(await token.read.balanceOf([owner.account.address])).to.equals(ownerBalanceBeforeMintBN + amountToMintBN);
    });

    it('Reverts if try to mint over max supply', async () => {
      const amountToMintBN = 2n * INITIAL_SUPPLY * 10n ** DECIMALS;
      await expect(token.write.mint([owner.account.address, amountToMintBN])).to.be.rejected;
    });

    it('Reverts when non owner tries to mint tokens', async () => {
      const amountToBurnBN = 1000n * 10n ** DECIMALS;
      await token.write.burn([amountToBurnBN]);

      const amountToMintBN = 500n * 10n ** DECIMALS;
      await expect((await tokenAs(user1)).write.mint([owner.account.address, amountToMintBN])).to.be.rejected;
    });
  });

  describe('Burn', () => {
    it('Users can burn their own tokens', async () => {
      const amountToBurnBN = 500n * 10n ** DECIMALS;
      const ownerInitBalanceBN = await token.read.balanceOf([owner.account.address]);

      await token.write.burn([amountToBurnBN]);
      expect((await token.read.balanceOf([owner.account.address]))).to.equals(ownerInitBalanceBN - amountToBurnBN);
    });

    it('Reverts when users tries to burn unavailable tokens', async () => {
      const amountToBurnBN = 500n * 10n ** DECIMALS;
      await expect((await tokenAs(user1)).write.burn([amountToBurnBN])).to.be.rejected;
    });

    it('Users can burn allowed tokens from another user', async () => {
      const allowanceAmountBN = 1000n * 10n ** DECIMALS;
      const amountToBurnBN = 500n * 10n ** DECIMALS;
      const ownerInitBalanceBN = await token.read.balanceOf([owner.account.address]);
      await token.write.approve([user1.account.address, allowanceAmountBN]);
      expect(await token.read.allowance([owner.account.address, user1.account.address])).to.equals(allowanceAmountBN);
      await (await tokenAs(user1)).write.burnFrom([owner.account.address, amountToBurnBN]);
      expect(await token.read.balanceOf([owner.account.address])).to.equals(ownerInitBalanceBN - amountToBurnBN);
      expect(
        await token.read.allowance([owner.account.address, user1.account.address])).to.equals(
          allowanceAmountBN - amountToBurnBN
        );
    });

    it('Reverts when users tries to burn tokens more than allowed', async () => {
      const allowanceAmountBN = 500n * 10n ** DECIMALS;
      const amountToBurnBN = 1000n * 10n ** DECIMALS;
      await token.write.approve([user1.account.address, allowanceAmountBN]);
      expect((await token.read.allowance([owner.account.address, user1.account.address]))).to.equals(allowanceAmountBN);
      await expect(
        (await tokenAs(user1)).write.burnFrom(owner.account.address, amountToBurnBN)
      ).to.be.rejected;
    });
  });

  describe('Transaction Fee', () => {
    it('Anyone can read current fee percentage', async () => {
      expect(await token.read.getTransferFee()).to.equals(FEE);
    });

    it('Owner can update fee percentage', async () => {
      expect(await token.read.getTransferFee()).to.equals(FEE);

      const NEW_FEE = 200n;
      await token.write.setTransferFee([NEW_FEE]);

      expect(await token.read.getTransferFee()).to.equals(NEW_FEE);
    });

    it('Event emitted when fee percentage updated', async () => {
      const NEW_FEE = 200n;

      const hash = await token.write.setTransferFee([NEW_FEE]);
      
      await publicClient.waitForTransactionReceipt({ hash });

      const transferFeeUpdatedEvents = await token.getEvents.TransferFeeUpdated();

      expect(transferFeeUpdatedEvents.length).to.equals(1);
      expect(transferFeeUpdatedEvents[0].args.fee).to.equals(NEW_FEE);
    });

    it('Reverts when non owner tries to update fee percentage', async () => {
      const NEW_FEE = 200n;

      await expect((await tokenAs(user1)).write.setTransferFee([NEW_FEE])).to.be.rejected;
    });

    it('Reverts when tries to update fee percentage outside the limit 0% - 5%', async () => {
      const NEW_FEE = 600n;

      await expect(token.write.setTransferFee([NEW_FEE])).to.be.rejected;
    });
  });

  describe('Treasury Wallet', () => {
    it('Owner can read current treasury wallet', async () => {
      expect((await token.read.getTreasuryWalletAddress()).toLowerCase()).to.equals(treasuryWallet.account.address);
    });

    it('Owner can update treasury wallet', async () => {
      await token.write.setTreasuryWalletAddress([user3.account.address]);
      expect((await token.read.getTreasuryWalletAddress()).toLowerCase()).to.equals(user3.account.address);
    });

    it('Event emitted when treasury wallet updated', async () => {
      const hash = await token.write.setTreasuryWalletAddress([user3.account.address]);

      await publicClient.waitForTransactionReceipt({ hash });

      const treasuryWalletUpdatedEvents = await token.getEvents.TreasuryWalletUpdated();

      expect(treasuryWalletUpdatedEvents.length).to.equals(1);
      expect(treasuryWalletUpdatedEvents[0].args.account.toLowerCase()).to.equals(user3.account.address);
    });

    it('Fee is debited and sent to treasury wallet on transactions', async () => {
      const amountToSendBN = 100n * 10n ** DECIMALS;

      expect(await token.read.balanceOf([treasuryWallet.account.address])).to.equals(0n);

      // admin to user1.account.address
      await token.write.transfer([user1.account.address, amountToSendBN]);
      expect(await token.read.balanceOf([user1.account.address])).to.equals(amountToSendBN);

      //user1.account.address to user2.account.address
      await (await tokenAs(user1)).write.transfer([user2.account.address, amountToSendBN]);
      const expectedBalanceOfUser2 = await debitFee(token, amountToSendBN);
      expect(await token.read.balanceOf([user2.account.address])).to.equals(expectedBalanceOfUser2);

      const fee = amountToSendBN - expectedBalanceOfUser2;
      expect(await token.read.balanceOf([treasuryWallet.account.address])).to.equals(fee);
    });

    it('Reverts when non owner tries to update treasury wallet', async () => {
      await expect(
        (await tokenAs(user1)).write.setTreasuryWalletAddress([user3.account.address])
      ).to.be.rejected;
    });

    it('Reverts when owner tries to update treasury wallet with zero address', async () => {
      await expect(token.write.setTreasuryWalletAddress([hre.ethers.ZeroAddress])).to.be.rejected;
    });
  });
});