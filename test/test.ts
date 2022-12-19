import { BigNumber, providers, Signer } from "ethers";
import { WXDC } from "../typechain-types/index";
import WXDCArtifact from "../artifacts/contracts/WXDC.sol/WXDC.json";
import { WUSD } from "../typechain-types/index";
import WUSDArtifact from "../artifacts/contracts/WUSD.sol/WUSD.json";
import { Pool } from "../typechain-types/index";
import PoolArtifact from "../artifacts/contracts/Pool.sol/Pool.json";
import { TestStablecoin } from "../typechain-types/index";
import TestStablecoinArtifact from "../artifacts/contracts/TestStablecoin.sol/TestStablecoin.json";
import { ethers, waffle } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { deployContract } = waffle;
const { expect } = chai;
chai.use(chaiAsPromised);
let user: SignerWithAddress;
let contractOwner: SignerWithAddress;
let WXDC: WXDC;
let WUSD: WUSD;
let Pool: Pool;
let TestStablecoin: TestStablecoin;
let SignatureContent: any;
let hash: any;
let signature: string;
let expiration: number;

const EIP712SignatureTypes = {
  SignatureContent: [
    { name: "nonce", type: "uint256" },
    { name: "price", type: "uint256" },
    { name: "multipliedBy", type: "uint256" },
    { name: "timestamp", type: "uint40" },
  ],
};

function getEIP712Domain(address: string) {
  return {
    name: "LilCompound",
    version: "1.0",
    verifyingContract: address,
  };
}

function getSignatureContentObject(signatureContent: any) {
  return {
    nonce: signatureContent.nonce,
    price: signatureContent.price,
    multipliedBy: signatureContent.multipliedBy,
    timestamp: signatureContent.timestamp,
  };
}

function getSignatureHashBytes(signatureContent: any, contractAddress: string) {
  return ethers.utils._TypedDataEncoder.hash(
    getEIP712Domain(contractAddress),
    EIP712SignatureTypes,
    getSignatureContentObject(signatureContent)
  );
}

async function signSignature(
  signatureContent: any,
  contractAddress: string,
  signer: SignerWithAddress
) {
  return signer._signTypedData(
    getEIP712Domain(contractAddress),
    EIP712SignatureTypes,
    getSignatureContentObject(signatureContent)
  );
}

async function timestampFromNow(delta: number) {
  const lastBlockNumber = await ethers.provider.getBlockNumber();
  const lastBlock = await ethers.provider.getBlock(lastBlockNumber);

  return lastBlock.timestamp + delta;
}

describe("Initialization of core functions", function () {
  beforeEach(async function () {
    expiration = await timestampFromNow(100);

    [user, contractOwner] = await ethers.getSigners();

    WXDC = (await deployContract(contractOwner, WXDCArtifact)) as WXDC;
    WUSD = (await deployContract(contractOwner, WUSDArtifact)) as WUSD;
    TestStablecoin = (await deployContract(
      contractOwner,
      TestStablecoinArtifact
    )) as TestStablecoin;
    Pool = (await deployContract(contractOwner, PoolArtifact, [
      WXDC.address,
      WUSD.address,
      TestStablecoin.address,
    ])) as Pool;
  });

  describe("Custom ERC20 Contracts", function () {
    describe("General Stuff", function () {
      it("should have proper owner", async function () {
        expect(await WXDC.owner()).to.equal(contractOwner.address);
        expect(await WUSD.owner()).to.equal(contractOwner.address);
      });
      it("should have proper name", async function () {
        expect(await WXDC.name()).to.equal("Wrapped XDC");
        expect(await WUSD.name()).to.equal("Wrapped USD");
      });
      it("should have proper symbol", async function () {
        expect(await WXDC.symbol()).to.equal("WXDC");
        expect(await WUSD.symbol()).to.equal("WUSD");
      });

      it("should support ERC20 interface", async function () {
        expect(await WXDC.supportsInterface("0x01ffc9a7")).to.equal(true);
        expect(await WUSD.supportsInterface("0x01ffc9a7")).to.equal(true);
      });
    });
    describe("Minting", function () {
      it("should mint 100 tokens", async function () {
        await expect(WXDC.mint(user.address, 100)).to.be.fulfilled;
        expect(await WXDC.balanceOf(user.address)).to.be.equal("100");
        await expect(WUSD.mint(user.address, 100)).to.be.fulfilled;
        expect(await WUSD.balanceOf(user.address)).to.be.equal("100");
      });
    });
  });

  describe("Pool Contract", function () {
    describe("General Stuff", function () {
      it("should have proper owner", async function () {
        expect(await Pool.owner()).to.equal(contractOwner.address);
      });
      it("should have proper contract addresses setup", async function () {
        expect(await Pool.WXDC()).to.equal(WXDC.address);
        expect(await Pool.WUSD()).to.equal(WUSD.address);
      });
    });
    describe("Depositing", function () {
      it("should deposit collateral and get tokens back", async function () {
        await expect(WXDC.transferOwnership(Pool.address)).to.be.fulfilled;
        await expect(WUSD.transferOwnership(Pool.address)).to.be.fulfilled;

        await expect(Pool.depositCollateralXDC({ value: 100 })).to.be.fulfilled;
        expect(await waffle.provider.getBalance(Pool.address)).to.be.equal(
          "100"
        );
        expect(await WXDC.balanceOf(contractOwner.address)).to.be.equal("100");

        await expect(TestStablecoin.mint(contractOwner.address, 100)).to.be
          .fulfilled;
        await expect(TestStablecoin.approve(Pool.address, 100000000000)).to.be
          .fulfilled;

        await expect(Pool.depositCollateralUSD(100)).to.be.fulfilled;
        expect(await WUSD.balanceOf(contractOwner.address)).to.be.equal("100");
        expect(await TestStablecoin.balanceOf(Pool.address)).to.be.equal("100");
      });
      describe("Signatures", function () {
        beforeEach(async function () {
          SignatureContent = {
            nonce: 420,
            price: 237887, //237887 = 0.237887
            multipliedBy: 1000000,
            timestamp: expiration,
          };
        });
        describe("Signature test", function () {
          beforeEach(async function () {
            hash = getSignatureHashBytes(SignatureContent, Pool.address);
            signature = await signSignature(
              SignatureContent,
              Pool.address,
              user
            );
          });
          describe("Creating signatures", function () {
            it("should fail when given invalid signature", async function () {
              const fakeSignature =
                "0x6732801029378ddf837210000397c68129387fd887839708320980942102910a6732801029378ddf837210000397c68129387fd887839708320980942102910a00";

              await expect(
                Pool.connect(contractOwner).verifySignature(hash, fakeSignature)
              ).to.be.revertedWith("ECDSA: invalid signature");
            });

            it("should get price and nonce", async function () {
              await expect(
                Pool.connect(contractOwner).signatureCheck(
                  SignatureContent,
                  signature
                )
              ).to.be.fulfilled;
            });
          });
        });
      });
    });
    describe("Withdrawing", function () {
      beforeEach(async function () {
        SignatureContent = {
          nonce: 420,
          price: 237887, //237887 = 0.237887
          multipliedBy: 1000000,
          timestamp: expiration,
        };
        hash = getSignatureHashBytes(SignatureContent, Pool.address);
        signature = await signSignature(SignatureContent, Pool.address, user);

        await expect(WXDC.transferOwnership(Pool.address)).to.be.fulfilled;
        await expect(WUSD.transferOwnership(Pool.address)).to.be.fulfilled;

        await expect(
          TestStablecoin.mint(contractOwner.address, 500)
        ).to.be.fulfilled;
        await expect(TestStablecoin.approve(Pool.address, 500)).to.be.fulfilled;
      });
      it("should be able to withdraw XDC", async function () {
        await expect(
          Pool.connect(contractOwner).depositCollateralXDC({ value: 500 })
        ).to.be.fulfilled;

        expect(await waffle.provider.getBalance(Pool.address)).to.be.equal(
          "500"
        );

        expect(await WXDC.balanceOf(contractOwner.address)).to.be.equal("500");
        expect(await waffle.provider.getBalance(Pool.address)).to.be.equal(
          "500"
        );

        await Pool.withdrawCollateralXDC("500", SignatureContent, signature);

        expect(await waffle.provider.getBalance(Pool.address)).to.be.equal("0");
        expect(await WXDC.balanceOf(contractOwner.address)).to.be.equal("0");
      });
      it("shouldn't be able to withdraw XDC", async function () {
        await expect(
          Pool.connect(contractOwner).depositCollateralXDC({ value: 500 })
        ).to.be.fulfilled;

        expect(await waffle.provider.getBalance(Pool.address)).to.be.equal(
          "500"
        );

        expect(await WXDC.balanceOf(contractOwner.address)).to.be.equal("500");
        expect(await waffle.provider.getBalance(Pool.address)).to.be.equal(
          "500"
        );

        await expect(
          Pool.withdrawCollateralXDC("501", SignatureContent, signature)
        ).to.be.revertedWith("NotEnoughCollateral()");

        expect(await waffle.provider.getBalance(Pool.address)).to.be.equal(
          "500"
        );
        expect(await WXDC.balanceOf(contractOwner.address)).to.be.equal("500");
      });
      it("should be able to withdraw USD", async function () {
        await expect(Pool.connect(contractOwner).depositCollateralUSD(500)).to
          .be.fulfilled;

        expect(await TestStablecoin.balanceOf(Pool.address)).to.be.equal("500");
        expect(
          await TestStablecoin.balanceOf(contractOwner.address)
        ).to.be.equal("0");
        expect(await WUSD.balanceOf(contractOwner.address)).to.be.equal("500");

        await Pool.withdrawCollateralUSD("500", SignatureContent, signature);
        expect(await TestStablecoin.balanceOf(Pool.address)).to.be.equal("0");
        expect(
          await TestStablecoin.balanceOf(contractOwner.address)
        ).to.be.equal("500");
        expect(await WUSD.balanceOf(contractOwner.address)).to.be.equal("0");
      });
      it("shouldn't be able to withdraw USD", async function () {
        await expect(Pool.connect(contractOwner).depositCollateralUSD(500)).to
          .be.fulfilled;

        expect(await TestStablecoin.balanceOf(Pool.address)).to.be.equal("500");
        expect(
          await TestStablecoin.balanceOf(contractOwner.address)
        ).to.be.equal("0");
        expect(await WUSD.balanceOf(contractOwner.address)).to.be.equal("500");

        await expect(
          Pool.withdrawCollateralUSD("501", SignatureContent, signature)
        ).to.be.revertedWith("NotEnoughCollateral()");
        expect(await TestStablecoin.balanceOf(Pool.address)).to.be.equal("500");
        expect(
          await TestStablecoin.balanceOf(contractOwner.address)
        ).to.be.equal("0");
        expect(await WUSD.balanceOf(contractOwner.address)).to.be.equal("500");
      });
    });
    describe("Borrowing", function () {
      beforeEach(async function () {
        SignatureContent = {
          nonce: 420,
          price: 237887, //237887 = 0.237887
          multipliedBy: 1000000,
          timestamp: expiration,
        };
        hash = getSignatureHashBytes(SignatureContent, Pool.address);
        signature = await signSignature(SignatureContent, Pool.address, user);

        await expect(WXDC.transferOwnership(Pool.address)).to.be.fulfilled;
        await expect(WUSD.transferOwnership(Pool.address)).to.be.fulfilled;
      });
      it("should be able to borrow USD under 70% collateralization", async function () {
        await expect(
          TestStablecoin.mint(Pool.address, 70)
        ).to.be.fulfilled;
        expect(await TestStablecoin.balanceOf(Pool.address)).to.be.equal("70");

        await expect(Pool.depositCollateralXDC({value:430})).to.be.fulfilled;

        expect(await WXDC.balanceOf(contractOwner.address)).to.be.equal("430");
        expect(await waffle.provider.getBalance(Pool.address)).to.be.equal(
          "430"
        );
        await Pool.borrow(70, 1, SignatureContent, signature);

        expect(await waffle.provider.getBalance(Pool.address)).to.be.equal(
          "430"
        );
        expect(await TestStablecoin.balanceOf(Pool.address)).to.be.equal("0");
        expect(await TestStablecoin.balanceOf(contractOwner.address)).to.be.equal("70");
      });
      it("shouldn't be able to borrow USD over 70% collateralization", async function () {
        await expect(
          TestStablecoin.mint(Pool.address, 70)
        ).to.be.fulfilled;
        expect(await TestStablecoin.balanceOf(Pool.address)).to.be.equal("70");

        await expect(Pool.depositCollateralXDC({value:420})).to.be.fulfilled;

        expect(await WXDC.balanceOf(contractOwner.address)).to.be.equal("420");
        expect(await waffle.provider.getBalance(Pool.address)).to.be.equal(
          "420"
        );
        await expect(
          Pool.borrow(70, 1, SignatureContent, signature)
        ).to.be.revertedWith("NotEnoughCollateral()");

        expect(await waffle.provider.getBalance(Pool.address)).to.be.equal(
          "420"
        );
        expect(await TestStablecoin.balanceOf(Pool.address)).to.be.equal("70");
        expect(await TestStablecoin.balanceOf(contractOwner.address)).to.be.equal("0");
      });
      it("should be able to borrow XDC under 70% collateralization", async function () {
        await expect(
          TestStablecoin.mint(contractOwner.address, 100)
        ).to.be.fulfilled;
        await expect(Pool.connect(user).depositCollateralXDC({ value: 500 })).to.be.fulfilled;
        expect(await waffle.provider.getBalance(Pool.address)).to.be.equal(
          "500"
        );
        
        const amount = 290;

        await expect(TestStablecoin.approve(Pool.address, 100)).to.be.fulfilled;

        await expect(Pool.depositCollateralUSD(100)).to.be.fulfilled;

        expect(await WUSD.balanceOf(contractOwner.address)).to.be.equal("100");

        expect(await TestStablecoin.balanceOf(Pool.address)).to.be.equal("100");
        await Pool.borrow(amount, 0, SignatureContent, signature);

        expect(await waffle.provider.getBalance(Pool.address)).to.be.equal(
          "210"
        );
      });
      it("shouldn't be able to borrow XDC over 70% collateralization", async function () {
        await expect(
          TestStablecoin.mint(contractOwner.address, 100)
        ).to.be.fulfilled;
        await expect(Pool.connect(user).depositCollateralXDC({ value: 500 })).to.be.fulfilled;
        expect(await waffle.provider.getBalance(Pool.address)).to.be.equal(
          "500"
        );

        const amount = 300;

        await expect(TestStablecoin.approve(Pool.address, 100)).to.be.fulfilled;

        await expect(Pool.depositCollateralUSD(100)).to.be.fulfilled;

        expect(await WUSD.balanceOf(contractOwner.address)).to.be.equal("100");

        expect(await TestStablecoin.balanceOf(Pool.address)).to.be.equal("100");
        await expect(
          Pool.borrow(amount, 0, SignatureContent, signature)
        ).to.be.revertedWith("NotEnoughCollateral()");
      });
    });
  });
});
