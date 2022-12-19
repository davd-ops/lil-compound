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
    error ContractsNotAllowed();

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
    address public SIGNER = address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);
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

    modifier onlyEOA() {
        if(tx.origin != msg.sender) revert ContractsNotAllowed();
        _;
    }

    function depositCollateralXDC() external payable onlyEOA {
        WXDC.mint(msg.sender, msg.value);
    }

    function withdrawCollateralXDC (
        uint256 _amount,
        SignatureContent calldata _content,
        bytes calldata _signature
    ) external onlyEOA {
        uint256 totalUnusedCollateral = getUnusedCollateral(
            msg.sender,
            _content,
            _signature
        );

        uint256 valueOfRequestedAmount = _amount * _content.price;
        if (totalUnusedCollateral < valueOfRequestedAmount)
            revert NotEnoughCollateral();

        if (address(this).balance < _amount) revert NotEnoughSupplyToBorrow();

        WXDC.burn(msg.sender, _amount);

        bytes32 structHash = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _eip712DomainSeparator(),
                hash(_content)
            )
        );
        revokeSignature(structHash);

        (bool sent, ) = msg.sender.call{value: _amount}("");
        if (!sent) revert TransferFailed();
    }

    function borrow (
        uint256 _amount,
        currency _currency,
        SignatureContent calldata _content,
        bytes calldata _signature
    ) external onlyEOA {
        uint256 totalUnusedCollateral = getUnusedCollateral(
            msg.sender,
            _content,
            _signature
        );

        uint256 maxLoan = (totalUnusedCollateral * MAX_UTILIZED_COLLATERAL) /
            BPS_BASE;

        if (_currency == currency.XDC) {
            uint256 valueOfRequestedAmount = _amount * _content.price;
            if (maxLoan < valueOfRequestedAmount) revert NotEnoughCollateral();

            if (address(this).balance < _amount)
                revert NotEnoughSupplyToBorrow();

            xdcDebt[msg.sender] = getDebtXDC(msg.sender) + _amount;

            (bool sent, ) = msg.sender.call{value: _amount}("");
            if (!sent) revert TransferFailed();
        } else {
            if (maxLoan < (_amount * _content.multipliedBy))
                revert NotEnoughCollateral();
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

    function depositCollateralUSD(uint256 _amount) external onlyEOA {
        stablecoinAddress.transferFrom(msg.sender, address(this), _amount);
        WUSD.mint(msg.sender, _amount);
    }

    function withdrawCollateralUSD (
        uint256 _amount,
        SignatureContent calldata _content,
        bytes calldata _signature
    ) external onlyEOA {
        uint256 totalUnusedCollateral = getUnusedCollateral(
            msg.sender,
            _content,
            _signature
        );

        if (totalUnusedCollateral < (_amount * _content.multipliedBy))
            revert NotEnoughCollateral();

            if (stablecoinAddress.balanceOf(address(this)) < _amount)
                revert NotEnoughSupplyToBorrow();

            WUSD.burn(msg.sender, _amount);

            stablecoinAddress.transfer(msg.sender, _amount);

            bytes32 structHash = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _eip712DomainSeparator(),
                hash(_content)
            )
        );
        revokeSignature(structHash);
    }

    function liquidate(address _address, SignatureContent calldata _content) internal {
        WUSD.burn(_address, getCollateralUSD(_address));
        WUSD.burn(_address, getCollateralXDC(_address));

        bytes32 structHash = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _eip712DomainSeparator(),
                hash(_content)
            )
        );
        revokeSignature(structHash);
    }

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

    // ========================================
    //     ADMIN FUNCTIONS
    // ========================================

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

    function getUnusedCollateral(
        address _address,
        SignatureContent calldata _content,
        bytes calldata _signature
    ) public returns (uint256) {
        signatureCheck(_content, _signature);

        uint256 pricePerXDCInUsd = _content.price;
        uint256 multipliedBy = _content.multipliedBy;

        uint256 valueOfCollateral = getCollateralUSD(_address) *
            multipliedBy +
            getCollateralXDC(_address) *
            pricePerXDCInUsd;

        uint256 valueOfDebt = getDebtUSD(_address) *
            multipliedBy +
            getDebtXDC(_address) *
            pricePerXDCInUsd;

        uint256 debtAndCollateralization = (valueOfDebt * BPS_BASE) /
            MAX_UTILIZED_COLLATERAL;

        if (debtAndCollateralization > valueOfCollateral) liquidate(_address, _content);

        uint256 totalUnusedCollateral = valueOfCollateral -
            debtAndCollateralization;

        return totalUnusedCollateral;
    }
}
