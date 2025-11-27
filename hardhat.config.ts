import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import type { HardhatUserConfig } from "hardhat/config";
import "solidity-coverage";
import * as dotenv from "dotenv";

import "./tasks/accounts";
import "./tasks/swap";

dotenv.config();

const INFURA_API_KEY = process.env.INFURA_API_KEY ?? "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? "";
const RAW_PRIVATE_KEY = process.env.PRIVATE_KEY;
const NORMALIZED_PRIVATE_KEY =
  RAW_PRIVATE_KEY && RAW_PRIVATE_KEY.length > 0
    ? RAW_PRIVATE_KEY.startsWith("0x")
      ? RAW_PRIVATE_KEY
      : `0x${RAW_PRIVATE_KEY}`
    : undefined;
const DEPLOYER_ACCOUNTS = NORMALIZED_PRIVATE_KEY ? [NORMALIZED_PRIVATE_KEY] : undefined;

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: 0,
  },
  etherscan: {
    apiKey: {
      sepolia: ETHERSCAN_API_KEY,
    },
  },
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
  },
  networks: {
    hardhat: {
      chainId: 31337,
      saveDeployments: true,
    },
    anvil: {
      chainId: 31337,
      url: "http://localhost:8545",
      accounts: DEPLOYER_ACCOUNTS,
      saveDeployments: true,
    },
    sepolia: {
      chainId: 11155111,
      url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts: DEPLOYER_ACCOUNTS,
      saveDeployments: true,
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.27",
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/hardhat-template/issues/31
        bytecodeHash: "none",
      },
      // Disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 800,
      },
      evmVersion: "cancun",
    },
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
};

export default config;
