import hre from "hardhat";
import TokenModule from "../ignition/modules/deploy-token";
import StakingModule from "../ignition/modules/deploy-staking";
import VestingModule from "../ignition/modules/deploy-vesting";
import {FEE, INITIAL_SUPPLY} from "../constants/contracts";
import {VESTING_SCHEDULES} from "../constants/vesting-schedules";
import {STAKING_SCHEDULES} from "../constants/staking-schedules";

async function main() {
    const TREASURY_WALLET_ADDRESS = process.env.TREASURY_WALLET_ADDRESS || "";

    const LAST_BLOCK = await (await hre.viem.getPublicClient()).getBlockNumber();

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

    console.log(`Vesting deployed to: ${vesting.address} 🎉`);

    await token.write.setVestingContractAddress([vesting.address]);

    console.log("Vesting contract address set on token contract ✅");

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