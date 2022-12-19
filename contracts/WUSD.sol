// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract WUSD is ERC20, ERC165, Ownable {

    // ========================================
    //    CONSTRUCTOR AND CORE FUNCTIONS
    // ========================================

    constructor () ERC20('Wrapped USD', 'WUSD') {}

    // ========================================
    //     ADMIN FUNCTIONS
    // ========================================

    function mint(address _address, uint256 _amount) external onlyOwner {
        _mint(_address, _amount);
    }

    function burn(address _address, uint256 _amount) external onlyOwner {
        _burn(_address, _amount);
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
