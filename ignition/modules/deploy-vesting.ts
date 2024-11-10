import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import {VESTING_SCHEDULES} from "../../constants/vesting-schedules";
import {START_BLOCK} from "../../constants/contracts";

const OWNER_ADDRESS = "0x";
const TOKEN_ADDRESS= "0x";
const STAKING_ADDRESS= "0x";

const VestingModule = buildModule("Vesting", (m) => {
    const ownerAddress = m.getParameter("ownerAddress", OWNER_ADDRESS);
    const tokenAddress = m.getParameter("tokenAddress", TOKEN_ADDRESS);
    const stakingAddress = m.getParameter("stakingAddress", STAKING_ADDRESS);
    const vestingSchedules = m.getParameter("vestingSchedules", VESTING_SCHEDULES);
    const startBlock = m.getParameter("startBlock", START_BLOCK);


    const vesting = m.contract("TokenVesting", [
        ownerAddress,
        tokenAddress,
        stakingAddress,
        vestingSchedules,
        startBlock
    ]);

    return { vesting };
});

export default VestingModule;