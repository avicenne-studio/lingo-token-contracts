/**
 * SPDX-License-Identifier: MIT
 */
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

interface ILingoToken is IERC20, IAccessControl {
    function INTERNAL_ROLE() external view returns (bytes32);
}
