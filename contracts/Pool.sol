// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./IERC20Mintable.sol";
import "hardhat/console.sol";

contract Pool is Ownable {
    // ========================================
    //     EVENT & ERROR DEFINITIONS
    // ========================================

    error TransferFailed();
    error InvalidSignature();
    error NoPermissionToExecute();

    // ========================================
    //     VARIABLE DEFINITIONS
    // ========================================

    enum currency {
        XDC,
        USD
    }

    struct SignatureContent {
        uint256 nonce;
        uint256 price;
    }

    IERC20Mintable public WXDC;
    IERC20Mintable public WUSD;
    IERC20 public stablecoinAddress;
    address public SIGNER = address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);
    uint16 internal BPS_BASE = 10000;
    uint16 internal MAX_UTILIZED_COLLATERAL = 7000;

    bytes32 internal constant SIG_TYPEHASH =
        keccak256("Signaturecontent(uint256 nonce,uint256 price)");

    mapping(address => uint256) XDCDebt;
    mapping(address => uint256) USDDebt;
    mapping(bytes32 => bool) public revokedBids;

    // ========================================
    //    CONSTRUCTOR AND CORE FUNCTIONS
    // ========================================

    constructor(address _WXDC, address _WUSD, address _stablecoinAddress) {
        WXDC = IERC20Mintable(_WXDC);
        WUSD = IERC20Mintable(_WUSD);
        stablecoinAddress = IERC20(_stablecoinAddress);
    }

    function depositCollateralXDC() external payable {
        WXDC.mint(msg.sender, msg.value);
    }

    function withdrawCollateralXDC(uint256 _amount) external {
        // check if he's leveraged

        WXDC.burn(msg.sender, _amount);
    }

    function borrowXDC(uint256 _amount, currency _currency) external {
        // check his collateral level
        // uint16 bpsFraction = MAX_UTILIZED_COLLATERAL / BPS_BASE;
        // uint256 maxLoan = total * bpsFraction;;
        // if (currency)

        (bool sent, ) = msg.sender.call{value: _amount}("");
        if (!sent) revert TransferFailed();
    }

    function depositCollateralUSD(uint256 _amount) external {
        stablecoinAddress.transferFrom(msg.sender, address(this), _amount);
        WUSD.mint(msg.sender, _amount);
    }

    function withdrawCollateralUSD(uint256 _amount) external {
        // check if he's leveraged

        WUSD.burn(msg.sender, _amount);
    }

    function liquidate() external {}

    // ========================================
    //     ADMIN FUNCTIONS
    // ========================================

    // function mint(address _address, uint256 _amount) external onlyOwner {
    //     _mint(_address, _amount);
    // }

    function setSigner(address _signer) external onlyOwner {
        SIGNER = _signer;
    }

    function setStablecoinAddress(
        address _stablecoinAddress
    ) external onlyOwner {
        stablecoinAddress = IERC20(_stablecoinAddress);
    }

    // ========================================
    //     SIGNATURE FUNCTIONS
    // ========================================

    function revokeBid(bytes32 _hash, bytes calldata _signature) external {
        if (revokedBids[_hash] == true) revert InvalidSignature();
        if (ECDSA.recover(_hash, _signature) != SIGNER)
            revert NoPermissionToExecute();

        revokedBids[_hash] = true;
    }

    function verifySignature(
        bytes32 _hash,
        bytes calldata _signature
    ) public view {
        if (ECDSA.recover(_hash, _signature) != SIGNER)
            revert InvalidSignature();
    }

    function validateBid(bytes32 _hash) public view {
        if (revokedBids[_hash] != false) revert InvalidSignature();
    }

    function hash(
        SignatureContent memory _struct
    ) private pure returns (bytes32) {
        return
            keccak256(abi.encode(SIG_TYPEHASH, _struct.nonce, _struct.price));
    }

    /**
     * @notice Composes EIP-712 domain separator
     * @dev domain separator is composing to prevent attacks in case of an Ethereum fork,
     * @dev not-intended behaviour between different dapps & different versions of the contract
     */
    function _eip712DomainSeparator() private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256(
                        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                    ),
                    keccak256(bytes("LilCompound")),
                    keccak256(bytes("1.0")),
                    block.chainid,
                    address(this)
                )
            );
    }

    // ========================================
    //     OTHER FUNCTIONS
    // ========================================

    function getDebtXDC(address _address) external view returns (uint256) {
        return XDCDebt[_address];
    }

    function getDebtUSD(address _address) external view returns (uint256) {
        return USDDebt[_address];
    }
}