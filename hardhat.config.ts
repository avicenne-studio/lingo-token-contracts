import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomiclabs/hardhat-solhint";
import "hardhat-gas-reporter";

import dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    hardhat: {
      forking: {
        url: process.env.MAINNET_RPC_URL ?? "",
        blockNumber: 13000000,
      },
    },
  },
};

export default config;
