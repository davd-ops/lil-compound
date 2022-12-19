/**
 * @type import('hardhat/config').HardhatUserConfig
 */
 import "@nomiclabs/hardhat-waffle";
 import "@typechain/hardhat";
 import "@nomiclabs/hardhat-etherscan";
 import { HardhatUserConfig } from "hardhat/config";
 import "hardhat-gas-reporter";
 require("dotenv").config({ path: ".env" });
 
 const config: HardhatUserConfig = {
   // Your type-safe config goes here
 };
 
 export default config;
 
 module.exports = {
   gasReporter: {
     currency: "USD",
     token: "ETH",
     gasPrice: 20,
     enabled: process.env.COINMARKETCAP_API_KEY ? true : false,
     coinmarketcap: process.env.COINMARKETCAP_API_KEY,
   },
     solidity: {
      version: "0.8.16",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    },
   typechain: {
     outDir: "typechain-types",
     target: "ethers-v5",
   },
   }

 