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
    error NotEnoughCollateral();
    error NotEnoughSupplyToBorrow();
    error ExpiredPrice();

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
        uint256 multipliedBy;
        uint40 timestamp;
    }

    IERC20Mintable public WXDC;
    IERC20Mintable public WUSD;
    IERC20 public stablecoinAddress;
    address public SIGNER = address(0x988346B4a0C46EfEfa781BFf6C2C7dCd4ca0792C);
    uint16 internal BPS_BASE = 10000;
    uint16 internal MAX_UTILIZED_COLLATERAL = 7000;

    bytes32 internal constant SIG_TYPEHASH =
        keccak256(
            "SignatureContent(uint256 nonce,uint256 price,uint256 multipliedBy,uint40 timestamp)"
        );

    mapping(address => uint256) xdcDebt;
    mapping(address => uint256) usdDebt;
    mapping(bytes32 => bool) public revokedSignatures;

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

    function borrow(
        uint256 _amount,
        currency _currency,
        SignatureContent calldata _content,
        bytes calldata _signature
    ) external {
        signatureCheck(_content, _signature);

        uint256 pricePerXDCInUsd = _content.price;
        uint256 multipliedBy = _content.multipliedBy;

        uint256 valueOfCollateral = getCollateralUSD(msg.sender) *
            multipliedBy +
            getCollateralXDC(msg.sender) *
            pricePerXDCInUsd;

        uint256 valueOfDebt = getDebtUSD(msg.sender) *
            multipliedBy +
            getDebtXDC(msg.sender) *
            pricePerXDCInUsd;

        uint256 totalUnusedCollateral = valueOfCollateral - valueOfDebt;

        uint16 bpsFraction = MAX_UTILIZED_COLLATERAL / BPS_BASE;
        uint256 maxLoan = totalUnusedCollateral * bpsFraction;

        if (maxLoan > _amount) revert NotEnoughCollateral();

        if (_currency == currency.XDC) {
            if (address(this).balance < _amount)
                revert NotEnoughSupplyToBorrow();

            xdcDebt[msg.sender] = getDebtXDC(msg.sender) + _amount;

            (bool sent, ) = msg.sender.call{value: _amount}("");
            if (!sent) revert TransferFailed();
        } else {
            if (stablecoinAddress.balanceOf(address(this)) < _amount)
                revert NotEnoughSupplyToBorrow();

            usdDebt[msg.sender] = getDebtUSD(msg.sender) + _amount;

            stablecoinAddress.transfer(msg.sender, _amount);
        }

        bytes32 structHash = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _eip712DomainSeparator(),
                hash(_content)
            )
        );
        revokeSignature(structHash);
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

    function signatureCheck(
        SignatureContent calldata _content,
        bytes calldata _signature
    ) public view {
        bytes32 structHash = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _eip712DomainSeparator(),
                hash(_content)
            )
        );
        validateSignature(_content.timestamp, structHash);
        verifySignature(structHash, _signature);
    }

    function test() external view {
        console.log(WXDC.balanceOf(msg.sender));
        console.log(WUSD.balanceOf(msg.sender));
    }

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

    function revokeSignature(bytes32 _hash) internal {
        if (revokedSignatures[_hash] == true) revert InvalidSignature();

        revokedSignatures[_hash] = true;
    }

    function verifySignature(
        bytes32 _hash,
        bytes calldata _signature
    ) public view {
        if (ECDSA.recover(_hash, _signature) != SIGNER)
            revert InvalidSignature();
    }

    function validateSignature(uint40 _expiration, bytes32 _hash) public view {
        if (block.timestamp >= _expiration) revert ExpiredPrice();
        if (revokedSignatures[_hash] != false) revert InvalidSignature();
    }

    function hash(
        SignatureContent memory _struct
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    SIG_TYPEHASH,
                    _struct.nonce,
                    _struct.price,
                    _struct.multipliedBy,
                    _struct.timestamp
                )
            );
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
                        "EIP712Domain(string name,string version,address verifyingContract)"
                    ),
                    keccak256(bytes("LilCompound")),
                    keccak256(bytes("1.0")),
                    address(this)
                )
            );
    }

    // ========================================
    //     OTHER FUNCTIONS
    // ========================================

    function getDebtXDC(address _address) public view returns (uint256) {
        return xdcDebt[_address];
    }

    function getDebtUSD(address _address) public view returns (uint256) {
        return usdDebt[_address];
    }

    function getCollateralXDC(address _address) public view returns (uint256) {
        return WXDC.balanceOf(_address);
    }

    function getCollateralUSD(address _address) public view returns (uint256) {
        return WUSD.balanceOf(_address);
    }

    function getTotalCollateral(
        address _address,
        SignatureContent calldata _content,
        bytes calldata _signature
    ) external view returns (uint256) {
        signatureCheck(_content, _signature);

        uint256 pricePerXDCInUsd = _content.price;
        uint256 multipliedBy = _content.multipliedBy;

        uint256 valueOfCollateral = getCollateralUSD(_address) *
            multipliedBy +
            getCollateralXDC(_address) *
            pricePerXDCInUsd;

        return valueOfCollateral;
    }

    function getTotalDebt(
        address _address,
        SignatureContent calldata _content,
        bytes calldata _signature
    ) external view returns (uint256) {
        signatureCheck(_content, _signature);

        uint256 pricePerXDCInUsd = _content.price;
        uint256 multipliedBy = _content.multipliedBy;

        uint256 valueOfDebt = getDebtUSD(_address) *
            multipliedBy +
            getDebtXDC(_address) *
            pricePerXDCInUsd;

        return valueOfDebt;
    }
}
