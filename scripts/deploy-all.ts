import hre from "hardhat";
import TokenModule from "../ignition/modules/deploy-token";
import StakingModule from "../ignition/modules/deploy-staking";
import VestingModule from "../ignition/modules/deploy-vesting";
import {FEE, INITIAL_SUPPLY} from "../constants/contracts";
import {VESTING_SCHEDULES} from "../constants/vesting-schedules";
import {STAKING_SCHEDULES} from "../constants/staking-schedules";
import {getMerkleTree, parseCSVToAllocationArray} from "../utils/merkle-tree";

async function main() {
    const TREASURY_WALLET_ADDRESS = process.env.TREASURY_WALLET_ADDRESS || "";
    const MULTISIG_ADDRESS = (hre.network.name == "base-mainnet" ? process.env.BASE_MULTISIG_ADDRESS : process.env.SEPOLIA_BASE_MULTISIG_ADDRESS) as `0x${string}`;

    console.log(`Deploying to network: ${hre.network.name}...`);

    const publicClient = await hre.viem.getPublicClient();

    const LAST_BLOCK = await publicClient.getBlockNumber();

    const allocations = await parseCSVToAllocationArray('lingo-allocations.csv');
    const merkleTree = getMerkleTree(allocations);

    console.log("Merkle tree created successfully. 🎉", merkleTree.root);

    const { token } = await hre.ignition.deploy(TokenModule, {
        parameters: { Token : { treasuryWalletAddress: TREASURY_WALLET_ADDRESS } }
    });

    const [deployer] = await hre.viem.getWalletClients();
    const deployerAddress = deployer.account.address;

    console.log(`Owner address: ${deployerAddress}`);

    console.log(`Token deployed to: ${token.address} 🎉`);

    const { staking } = await hre.ignition.deploy(StakingModule, {
        parameters: { Staking : { ownerAddress: deployerAddress, tokenAddress: token.address } }
    });
    console.log(`Staking deployed to: ${staking.address} 🎉`);

    const { vesting } = await hre.ignition.deploy(VestingModule, {
        parameters: { Vesting : { ownerAddress: deployerAddress, tokenAddress: token.address, stakingAddress: staking.address, startBlock: LAST_BLOCK } }
    });

    let transactionCount = await publicClient.getTransactionCount({ address: deployerAddress })
    console.log(`Vesting deployed to: ${vesting.address} 🎉`);


    await token.write.setVestingContractAddress([vesting.address], { nonce: transactionCount++ });
    console.log("Vesting contract address set on token contract ✅");

    await vesting.write.setMerkleRoot([merkleTree.root as `0x${string}`], { nonce: transactionCount++ });
    console.log("Merkle root set on vesting contract ✅");

    const MINTER_ROLE = await token.read.MINTER_ROLE();
    const DEFAULT_ADMIN_ROLE = await token.read.DEFAULT_ADMIN_ROLE();

    await token.write.grantRole([MINTER_ROLE, MULTISIG_ADDRESS], { nonce: transactionCount++ });
    console.log("MINTER_ROLE granted to Multisig ✅");

    await token.write.grantRole([DEFAULT_ADMIN_ROLE, MULTISIG_ADDRESS], { nonce: transactionCount++ });
    console.log("DEFAULT_ADMIN_ROLE granted to Multisig ✅");

    await token.write.renounceRole([DEFAULT_ADMIN_ROLE, deployerAddress], { nonce: transactionCount++ });
    console.log("Deployer has renounced DEFAULT_ADMIN_ROLE ✅");

    await staking.write.transferOwnership([MULTISIG_ADDRESS], { nonce: transactionCount++ });
    console.log("Staking contract ownership transferred to Multisig ✅");

    if(hre.network.name === "hardhat") return;

    console.log("Verifying contracts...");

    await hre.run("verify:verify", {
        address: token.address,
        constructorArguments: [
            INITIAL_SUPPLY,
            TREASURY_WALLET_ADDRESS,
            FEE
        ],
    });

    console.log("Token contract verified ✅");

    await hre.run("verify:verify", {
        address: staking.address,
        constructorArguments: [
            deployerAddress,
            token.address,
            STAKING_SCHEDULES
        ],
    });

    console.log("Staking contract verified ✅");

    await hre.run("verify:verify", {
        address: vesting.address,
        constructorArguments: [
            deployerAddress,
            token.address,
            staking.address,
            VESTING_SCHEDULES,
            LAST_BLOCK
        ],
    });

    console.log("Vesting contract verified ✅");
}

main().catch(console.error);