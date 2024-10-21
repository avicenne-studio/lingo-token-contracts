const { describe } = require('mocha');
import { expect } from "chai";
import hre from "hardhat";

import { debitFee } from "../utils/debit-fee";

const { TOTAL_SUPPLY, DECIMALS, FEE, ZERO_ADDRESS } = {
    DECIMALS: 18n,
    TOTAL_SUPPLY: 1000000000n,
    FEE: 500n, // 5%
    ZERO_ADDRESS: '0x0000000000000000000000000000000000000000',
};

describe('LINGO Token', async () => {
  let token: any;
  const [owner, user1, user2, user3, treasuryWallet] = await hre.viem.getWalletClients();
  const TOTAL_SUPPLY_WEI = TOTAL_SUPPLY * 10n ** DECIMALS;
  let tokenAs: any;
  const publicClient = await hre.viem.getPublicClient();

  beforeEach(async () => {
    token = await hre.viem.deployContract("LingoToken", [
        TOTAL_SUPPLY,
        treasuryWallet.account.address,
        FEE
    ]);

    const MINTER_ROLE = await token.read.MINTER_ROLE();
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

  describe('Transfer', () => {
    it('Initial supply minted and transferred to owner', async () => {
      expect((await token.read.balanceOf([owner.account.address]))).to.equals(TOTAL_SUPPLY_WEI);
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
      await expect(token.write.transfer([ZERO_ADDRESS, amountToSendBN])).to.be.rejected;
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
      const amountToBurnBN = 1000n * 10n ** DECIMALS;
      await token.write.burn([amountToBurnBN]);

      const amountToMintBN = 500n * 10n ** DECIMALS;
      const ownerBalanceBeforeMintBN = await token.read.balanceOf([owner.account.address]);

      await token.write.mint([owner.account.address, amountToMintBN]);
      expect(await token.read.balanceOf([owner.account.address])).to.equals(ownerBalanceBeforeMintBN + amountToMintBN);
    });

    it('Reverts if try to mint over max supply', async () => {
      const amountToMintBN = 500n * 10n ** DECIMALS;
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
      await expect(token.write.setTreasuryWalletAddress([ZERO_ADDRESS])).to.be.rejected;
    });
  });
});