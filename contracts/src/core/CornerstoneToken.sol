// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

interface ICornerstoneToken {
    // ERC-20 standard is inherited
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

interface ITransferHook {
    function onTokenTransfer(address from, address to, uint256 amount) external;
}

contract CornerstoneToken is Initializable, ERC20Upgradeable, UUPSUpgradeable, OwnableUpgradeable, ICornerstoneToken {
    address public project;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(string memory name_, string memory symbol_, address project_) public initializer {
        require(project_ != address(0), "project required");
        __ERC20_init(name_, symbol_);
        __Ownable_init(project_);
        __UUPSUpgradeable_init();
        project = project_;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

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
