// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// THIS IS NOT A REAL STABLECOIN, WE'RE USING IT FOR DEVELOPMENT PURPOSES
// SINCE WE COULDNT FIND ANY STABLECOIN ON XDC NETWORK
contract TestStablecoin is ERC20, ERC165, Ownable {

    // ========================================
    //    CONSTRUCTOR AND CORE FUNCTIONS
    // ========================================

    constructor () ERC20('Test USD Stablecoin', 'TUSD') {}

    // ========================================
    //     ADMIN FUNCTIONS
    // ========================================

    function mint(address _address, uint256 _amount) external onlyOwner {
        _mint(_address, _amount);
    }

     // ========================================
    //     OTHER FUNCTIONS
    // ========================================

    /**
     * @notice Returns if internface is supported
     * @dev ERC165
     */
    function supportsInterface(bytes4 _interfaceId)
        public
        view
        virtual
        override(ERC165)
        returns (bool)
    {
        return
            ERC165.supportsInterface(_interfaceId);
    }
}
