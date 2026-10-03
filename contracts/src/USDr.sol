// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract USDr is ERC20, ERC20Permit, AccessControl {
    bytes32 public constant ONRAMP_ROLE = keccak256("ONRAMP_ROLE");

    constructor(address admin) ERC20("USDr", "USDr") ERC20Permit("USDr") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyRole(ONRAMP_ROLE) {
        _mint(to, amount);
    }
}
