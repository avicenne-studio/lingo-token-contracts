import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import {STAKING_SCHEDULES} from "../../constants/staking-schedules";

const StakingModule = buildModule("Staking", (m) => {
    const ownerAddress = m.getParameter("ownerAddress");
    const tokenAddress = m.getParameter("tokenAddress");
    const stakingSchedules = m.getParameter("stakingSchedules", STAKING_SCHEDULES);


    const staking = m.contract("TokenStaking", [
        ownerAddress,
        tokenAddress,
        stakingSchedules
    ]);

    return { staking };
});

export default StakingModule;