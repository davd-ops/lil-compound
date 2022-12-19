import { ethers } from "hardhat";

async function main() {
  const factoryWXDC = await ethers.getContractFactory("WXDC");
  const WXDC = await factoryWXDC.deploy();
  await WXDC.deployed();  
  console.log("WXDC address:", WXDC.address);

  const factoryWUSD = await ethers.getContractFactory("WUSD");
  const WUSD = await factoryWUSD.deploy();
  await WUSD.deployed();  
  console.log("WUSD address:", WUSD.address);

  const factoryTestStablecoin = await ethers.getContractFactory("TestStablecoin");
  const TestStablecoin = await factoryTestStablecoin.deploy();
  await TestStablecoin.deployed();  
  console.log("TestStablecoin address:", TestStablecoin.address);

  const factoryPool = await ethers.getContractFactory("Pool");
  const Pool = await factoryPool.deploy(WXDC.address,
    WUSD.address,
    TestStablecoin.address);
    await Pool.deployed();  
    console.log("Pool address:", Pool.address);

    await (await WXDC.transferOwnership(Pool.address)).wait();
    console.log("WXDC ownership transferred");
    await (await WUSD.transferOwnership(Pool.address)).wait();
    console.log("WUSD ownership transferred");

    await (await TestStablecoin.mint('0x83467a8dfe402A79ca5DA970b02Cecfe11D92c7b', 1000)).wait();
    console.log("TestStablecoin minted to admin wallet");
  
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });