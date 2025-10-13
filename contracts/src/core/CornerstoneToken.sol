// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ICornerstoneToken {
    // ERC-20 standard is inherited
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

interface ITransferHook {
    function onTokenTransfer(address from, address to, uint256 amount) external;
}

contract CornerstoneToken is ERC20, ICornerstoneToken {
    address public immutable project;

    constructor(string memory name_, string memory symbol_, address project_) ERC20(name_, symbol_) {
        require(project_ != address(0), "project required");
        project = project_;
    }

    modifier onlyProject() {
        require(msg.sender == project, "only project");
        _;
    }

    function decimals() public pure override returns (uint8) {
        return 6; // align with USDC-style
    }

    function mint(address to, uint256 amount) external onlyProject {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyProject {
        _burn(from, amount);
    }

    // Hook into OZ ERC20 v5 internal update to notify project for dividend accounting
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        // Notify the project to update per-account corrections for distributions
        // Safe to call after balance change; corrections use the current global perShare
        ITransferHook(project).onTokenTransfer(from, to, value);
    }
}
