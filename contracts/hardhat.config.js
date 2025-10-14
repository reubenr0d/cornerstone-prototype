require("@nomicfoundation/hardhat-toolbox");
require("solidity-coverage");

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Force local Hardhat chainId to 1337 to match MetaMask
    hardhat: {
      chainId: 1337,
    },
    localhost: {
      chainId: 1337,
    },
  },
  paths: {
    // Compile sources from the local src directory to avoid scanning node_modules
    sources: "./src",
  },
};
