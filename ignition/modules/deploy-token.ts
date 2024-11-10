import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import {FEE, INITIAL_SUPPLY, TREASURY_WALLET_ADDRESS} from "../../constants/contracts";

const TokenModule = buildModule("Token", (m) => {
    const initialSupply = m.getParameter("initialSupply", INITIAL_SUPPLY);
    const treasuryWalletAddress = m.getParameter("treasuryWalletAddress", TREASURY_WALLET_ADDRESS);
    const fee = m.getParameter("fee", FEE);

    const token = m.contract("LingoToken", [
        initialSupply,
        treasuryWalletAddress,
        fee
    ]);

    return { token };
});

export default TokenModule;