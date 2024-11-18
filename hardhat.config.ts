import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ignition-viem";
import "@nomicfoundation/hardhat-chai-matchers"
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-verify";
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
    "base-mainnet": {
      url: process.env.BASE_RPC_URL as string,
      accounts: [process.env.BASE_PRIVATE_KEY as string],
      gasPrice: 1000000000,
    },
    "base-sepolia": {
      url: process.env.BASE_SEPOLIA_RPC_URL as string,
      accounts: [process.env.SEPOLIA_BASE_PRIVATE_KEY as string],
      gasPrice: 1000000000,
    },
  },
  etherscan: {
    apiKey: {
      "base-mainnet": process.env.BASE_SCAN_API_KEY as string,
      "base-sepolia": process.env.BASE_SCAN_API_KEY as string,
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org"
        }
      },
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      }
    ]
  },
  sourcify: {
    enabled: false
  }
};

export default config;
