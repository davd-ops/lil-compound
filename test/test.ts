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
    timestamp: signatureContent.timestamp
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
    expiration =  await timestampFromNow(100);
    
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
            signature = await signSignature(SignatureContent, Pool.address, user);            
          });
          describe("Revoke Signature", function () {
            it("should fail with invalid signature", async function () {
              const fakeSignature =
                "0x6732801029378ddf837210000397c68129387fd887839708320980942102910a6732801029378ddf837210000397c68129387fd887839708320980942102910a00";

              await expect(
                Pool.connect(user).revokeSignature(hash, fakeSignature)
              ).to.be.revertedWith("ECDSA: invalid signature");
            });

            it("should fail if signature is already revoked", async function () {          
              await Pool.connect(user).revokeSignature(hash, signature);

              await expect(
                Pool.connect(user).revokeSignature(hash, signature)
              ).to.be.revertedWith("InvalidSignature()");
            });

            it("should set signature as revoked", async function () {
              await Pool.connect(user).revokeSignature(hash, signature);

              const isRevoked = await Pool.revokedSignatures(hash);
              expect(isRevoked).to.equal(true);
            });
          });
          describe("Creating signatures", function () {
            it("should fail when given invalid signature", async function () {
              const fakeSignature =
                "0x6732801029378ddf837210000397c68129387fd887839708320980942102910a6732801029378ddf837210000397c68129387fd887839708320980942102910a00";

              await expect(
                Pool.connect(contractOwner).verifySignature(
                  hash,
                  fakeSignature
                )
              ).to.be.revertedWith("ECDSA: invalid signature");
            });

            it("should fail when signature is revoked", async function () {
              await Pool.connect(user).revokeSignature(hash, signature);

              await expect(
                Pool.connect(contractOwner).validateSignature(
                  expiration, hash
                )
              ).to.be.revertedWith("InvalidSignature()");
            });

            it("should get price and nonce", async function () {             
              await expect(
                Pool.connect(contractOwner).signatureCheck(
                  SignatureContent,
                  signature
                )
              ).to.be.fulfilled;
            });
            it("should TEST", async function () {
              await expect(WUSD.mint(contractOwner.address, 100)).to.be
          .fulfilled;
          await expect(WXDC.mint(contractOwner.address, 150)).to.be
          .fulfilled;
        // await expect(TestStablecoin.approve(Pool.address, 100000000000)).to.be
        //   .fulfilled;

        // await expect(Pool.depositCollateralUSD(100)).to.be.fulfilled;
        expect(await WUSD.balanceOf(contractOwner.address)).to.be.equal("100");
        expect(await WXDC.balanceOf(contractOwner.address)).to.be.equal("150");
              await Pool.test();
            });

            // it("should revoke accepted bid", async function () {
            //   await Pool.connect(contractOwner).verifySignature(
            //     hash,
            //     signature
            //   );

            //   const isRevoked = await Pool.revokedBids(hash);
            //   expect(isRevoked).to.equal(true);
            // });
          });
        });
        // describe("Concluding the deal", function () {
        //   beforeEach(async function () {
        //     bidHash = getBidHashBytes(bid, OverpassV1.address);
        //     signature = await signBid(bid, OverpassV1.address, user);
        //   });
        //   it("should revert if token is no longer owned by user", async function () {
        //     await PudgyPenguins.connect(user).transferFrom(
        //       user.address,
        //       randomSigner.address,
        //       0
        //     );
        //     await expect(
        //       OverpassV1.connect(brand).executeDeal(bid, signature, {
        //         value: bid.amount,
        //       })
        //     ).to.be.revertedWith("UserIsNotTheOwner()");
        //   });
        //   it("should revert if collection is not whitelisted", async function () {
        //     await expect(
        //       OverpassV1.connect(brand).executeDeal(bid, signature, {
        //         value: bid.amount,
        //       })
        //     ).to.be.revertedWith("CollectionNotWhitelisted()");
        //   });
        //   it("should revert if data is invalid", async function () {
        //     const invalidAmount = 0;
        //     const invalidNonce = 33;
        //     const invalidSignature =
        //       "0x5555530ac16e89b0632fb8e01bdc8dbb59b32aaa12d27361414bf46a3eb89ac866d70212d6eb17535a1182aa5c336c3f53017370571abd5abc8609dc1e0e7b4444";
        //     await OverpassV1.whitelistCollection(PudgyPenguins.address);
        //     await expect(
        //       OverpassV1.connect(brand).executeDeal(bid, invalidSignature, {
        //         value: bid.amount,
        //       })
        //     ).to.be.revertedWith("ECDSA: invalid signature 'v' value");
        //     bid.nonce = invalidNonce;
        //     await expect(
        //       OverpassV1.connect(brand).executeDeal(bid, signature, {
        //         value: bid.amount,
        //       })
        //     ).to.be.revertedWith("InvalidSignature()");
        //     bid.nonce = 0;
        //     await expect(
        //       OverpassV1.connect(brand).executeDeal(bid, signature, {
        //         value: invalidAmount.toString(),
        //       })
        //     ).to.be.revertedWith("InsufficientAmount()");
        //   });
        //   it("should revert if msg.value is incorrect", async function () {
        //     await OverpassV1.whitelistCollection(PudgyPenguins.address);
        //     await expect(
        //       OverpassV1.connect(brand).executeDeal(bid, signature)
        //     ).to.be.revertedWith("InsufficientAmount()");
        //     await expect(
        //       OverpassV1.connect(brand).executeDeal(bid, signature, {
        //         value: (oneEther - 100).toString(),
        //       })
        //     ).to.be.revertedWith("InsufficientAmount()");
        //   });
        //   it("should complete payment with ETH", async function () {
        //     await OverpassV1.whitelistCollection(PudgyPenguins.address);
        //     await expect(
        //       OverpassV1.connect(brand).executeDeal(bid, signature, {
        //         value: bid.amount,
        //       })
        //     ).to.be.fulfilled;
        //   });
        //   it("should complete payment with USDC", async function () {
        //     bid.amount = (oneUSDC * 1000).toString();
        //     bid.currency = currency.USDC;
        //     bidHash = getBidHashBytes(bid, OverpassV1.address);
        //     signature = await signBid(bid, OverpassV1.address, user);

        //     await OverpassV1.connect(contractOwner).whitelistCollection(
        //       PudgyPenguins.address
        //     );
        //     await MockUSDC.connect(contractOwner).mint(
        //       brand.address,
        //       (oneUSDC * 1000).toString()
        //     );
        //     expect(await MockUSDC.balanceOf(brand.address)).to.equal(
        //       (oneUSDC * 1000).toString()
        //     );
        //     await OverpassV1.connect(contractOwner).setUSDCAddress(MockUSDC.address);
        //     await MockUSDC.connect(brand).approve(
        //       OverpassV1.address,
        //       (oneUSDC * 1000).toString()
        //     );
        //     await expect(
        //       OverpassV1.connect(brand).executeDeal(bid, signature)
        //     ).to.be.fulfilled;
        //     expect(await MockUSDC.balanceOf(brand.address)).to.equal(0);
        //     expect(await MockUSDC.balanceOf(user.address)).to.equal(
        //       (oneUSDC * 1000).toString()
        //     );
        //   });
        //   it("should complete batch payment with  USDC", async function () {
        //     const bid1 = {
        //       amount: (oneUSDC * 1000).toString(),
        //       tokenId: 0,
        //       expiration: bidExpiration,
        //       tokenOwner: user.address,
        //       transactionExecutor: brand.address,
        //       collectionAddress: PudgyPenguins.address,
        //       nonce: 0,
        //       currency: currency.USDC,
        //     };
        //     const bid2 = {
        //       amount: (oneUSDC * 5000).toString(),
        //       tokenId: 0,
        //       expiration: bidExpiration,
        //       tokenOwner: user.address,
        //       transactionExecutor: brand.address,
        //       collectionAddress: PudgyPenguins.address,
        //       nonce: 0,
        //       currency: currency.USDC,
        //     };
        //     const bid3 = {
        //       amount: (oneUSDC * 4000).toString(),
        //       tokenId: 0,
        //       expiration: bidExpiration,
        //       tokenOwner: user.address,
        //       transactionExecutor: brand.address,
        //       collectionAddress: PudgyPenguins.address,
        //       nonce: 0,
        //       currency: currency.USDC,
        //     };;

        //     const signature1 = await signBid(bid1, OverpassV1.address, user);
        //     const signature2 = await signBid(bid2, OverpassV1.address, user);
        //     const signature3 = await signBid(bid3, OverpassV1.address, user);

        //     await OverpassV1.connect(contractOwner).whitelistCollection(
        //       PudgyPenguins.address
        //     );
        //     await MockUSDC.connect(contractOwner).mint(
        //       brand.address,
        //       (oneUSDC * 10000).toString()
        //     );
        //     await OverpassV1.connect(contractOwner).setUSDCAddress(MockUSDC.address);
        //     await MockUSDC.connect(brand).approve(
        //       OverpassV1.address,
        //       (oneUSDC * 10000).toString()
        //     );

        //     await expect(
        //       OverpassV1.connect(brand).executeMultipleUSDCDeals([bid1, bid2, bid3], [signature1, signature2, signature3])
        //     ).to.be.fulfilled;
        //     expect(await MockUSDC.balanceOf(brand.address)).to.equal(0);
        //     expect(await MockUSDC.balanceOf(user.address)).to.equal(
        //       (oneUSDC * 10000).toString()
        //     );
        //   });
        //   it("should conclude the ETH payment with fee distributed", async function () {
        //     const provider = ethers.provider;

        //     await OverpassV1.connect(contractOwner).whitelistCollection(
        //       PudgyPenguins.address
        //     );
        //     await OverpassV1.connect(contractOwner).setMarketplaceFee(500);

        //     await expect(
        //       OverpassV1.connect(brand).executeDeal(bid, signature, {
        //         value: bid.amount,
        //       })
        //     ).to.be.fulfilled;
        //     expect(await provider.getBalance(OverpassV1.address)).to.equal(
        //       (oneEther * 0.05).toString()
        //     );
        //     await expect(OverpassV1.connect(contractOwner).withdrawETH()).to.be
        //       .fulfilled;
        //     expect(await provider.getBalance(OverpassV1.address)).to.equal(0);
        //   });
        //   it("should conclude the USDC payment with fee distributed", async function () {
        //     bid.amount = (oneUSDC * 1000).toString();
        //     bid.currency = currency.USDC;
        //     bidHash = getBidHashBytes(bid, OverpassV1.address);
        //     signature = await signBid(bid, OverpassV1.address, user);

        //     await OverpassV1.connect(contractOwner).whitelistCollection(
        //       PudgyPenguins.address
        //     );
        //     await OverpassV1.connect(contractOwner).setMarketplaceFee(500);
        //     await MockUSDC.connect(contractOwner).mint(brand.address, bid.amount);
        //     expect(await MockUSDC.balanceOf(brand.address)).to.equal(bid.amount);
        //     await OverpassV1.connect(contractOwner).setUSDCAddress(MockUSDC.address);
        //     await MockUSDC.connect(brand).approve(OverpassV1.address, bid.amount);

        //     await expect(
        //       OverpassV1.connect(brand).executeDeal(bid, signature)
        //     ).to.be.fulfilled;
        //     expect(await MockUSDC.balanceOf(OverpassV1.address)).to.equal(
        //       (oneUSDC * 50).toString()
        //     );
        //     expect(await MockUSDC.balanceOf(user.address)).to.equal(
        //       (oneUSDC * 950).toString()
        //     );
        //     await expect(OverpassV1.connect(contractOwner).withdrawUSDC()).to.be
        //       .fulfilled;
        //     expect(await MockUSDC.balanceOf(OverpassV1.address)).to.equal(0);
        //     expect(await MockUSDC.balanceOf(contractOwner.address)).to.equal(
        //       (oneUSDC * 50).toString()
        //     );
        //     expect(await MockUSDC.balanceOf(brand.address)).to.equal(
        //       (oneUSDC * 0).toString()
        //     );
        //   });
        // });
      });
    });
  });
});
