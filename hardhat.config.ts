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
 
 const XINFIN_NETWORK_URL = "https://erpc.xinfin.network";
 const APOTHEM_NETWORK_URL = "https://erpc.apothem.network";
 const PRIVATE_KEY =
   "202e3c9d30bbeca38d6578659919d4c3dc989ae18c16756690877fdc4dfa607f";
 
 const XDC_ACCOUNT_2_PK =
   "f3f7097ebda3883ecc6cf8bfb166cd3fa3ba6f8a9a54cf1873539a94e2827e9f";
 
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
         runs: 200,
       },
     },
   },
   typechain: {
     outDir: "typechain-types",
     target: "ethers-v5",
   },
   networks: {
     xinfin: {
       url: XINFIN_NETWORK_URL,
       accounts: [XDC_ACCOUNT_2_PK],
     },
     apothem: {
       url: APOTHEM_NETWORK_URL,
       accounts: [XDC_ACCOUNT_2_PK],
     },
   },
 };