// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface ICornerstoneToken {
    function initialize(string memory name_, string memory symbol_, address project_) external;
}

interface ICornerstoneProject {
    function initialize(
        address developer,
        address usdc_,
        string memory name_,
        string memory symbol_,
        uint256 minRaise_,
        uint256 maxRaise_,
        uint256 fundraiseDeadline_,
        uint256[6] memory phaseAPRs_,
        uint256[6] memory phaseDurations_,
        uint256[6] memory phaseCapsBps_,
        address token_
    ) external;
}

interface IProjectRegistry {
    function createProject(
        uint256 minRaise,
        uint256 maxRaise,
        uint256 fundraiseDeadline,
        uint256[6] calldata phaseAPRs, // includes phase 0 (fundraising)
        uint256[6] calldata phaseDurations, // includes phase 0 (fundraising)
        uint256[6] calldata phaseWithdrawCaps // includes phase 0 (fundraising)
    ) external returns (address projectAddress, address tokenAddress);

    function createProjectWithTokenMeta(
        string calldata tokenName,
        string calldata tokenSymbol,
        uint256 minRaise,
        uint256 maxRaise,
        uint256 fundraiseDeadline,
        uint256[6] calldata phaseAPRs, // includes phase 0 (fundraising)
        uint256[6] calldata phaseDurations, // includes phase 0 (fundraising)
        uint256[6] calldata phaseWithdrawCaps // includes phase 0 (fundraising)
    ) external returns (address projectAddress, address tokenAddress);
}

contract ProjectRegistry is IProjectRegistry, Ownable {
    address public immutable usdc; // stablecoin used across projects
    address public immutable projectImpl;
    address public immutable tokenImpl;
    uint256 public projectCount;

    event ProjectCreated(address indexed project, address indexed token, address indexed creator);

    constructor(address _usdc, address _projectImpl, address _tokenImpl) Ownable(msg.sender) {
        require(_usdc != address(0), "USDC addr required");
        require(_projectImpl != address(0), "project impl required");
        require(_tokenImpl != address(0), "token impl required");
        usdc = _usdc;
        projectImpl = _projectImpl;
        tokenImpl = _tokenImpl;
    }

    function createProject(
        uint256 minRaise,
        uint256 maxRaise,
        uint256 fundraiseDeadline,
        uint256[6] calldata phaseAPRs,
        uint256[6] calldata phaseDurations,
        uint256[6] calldata phaseWithdrawCaps
    ) external returns (address projectAddress, address tokenAddress) {
        require(minRaise > 0 && maxRaise >= minRaise, "bad raise bounds");
        require(fundraiseDeadline > block.timestamp, "deadline in past");

        projectCount += 1;
        string memory tName = _concat("Cornerstone Project #", _uToString(projectCount));
        string memory tSym = _concat("cAGG-", _uToString(projectCount));

        return _createProjectInternal(msg.sender, tName, tSym, minRaise, maxRaise, fundraiseDeadline, phaseAPRs, phaseDurations, phaseWithdrawCaps);
    }

    function createProjectWithTokenMeta(
        string calldata tokenName,
        string calldata tokenSymbol,
        uint256 minRaise,
        uint256 maxRaise,
        uint256 fundraiseDeadline,
        uint256[6] calldata phaseAPRs,
        uint256[6] calldata phaseDurations,
        uint256[6] calldata phaseWithdrawCaps
    ) external returns (address projectAddress, address tokenAddress) {
        require(bytes(tokenName).length > 0 && bytes(tokenSymbol).length > 0, "name/symbol req");
        require(minRaise > 0 && maxRaise >= minRaise, "bad raise bounds");
        require(fundraiseDeadline > block.timestamp, "deadline in past");

        projectCount += 1;
        return _createProjectInternal(msg.sender, tokenName, tokenSymbol, minRaise, maxRaise, fundraiseDeadline, phaseAPRs, phaseDurations, phaseWithdrawCaps);
    }

    function _createProjectInternal(
        address developer,
        string memory tokenName,
        string memory tokenSymbol,
        uint256 minRaise,
        uint256 maxRaise,
        uint256 fundraiseDeadline,
        uint256[6] calldata phaseAPRs,
        uint256[6] calldata phaseDurations,
        uint256[6] calldata phaseWithdrawCaps
    ) internal returns (address projectAddress, address tokenAddress) {
        // Clone token implementation
        tokenAddress = Clones.clone(tokenImpl);
        
        // Clone project implementation
        projectAddress = Clones.clone(projectImpl);

        // Initialize token
        ICornerstoneToken(tokenAddress).initialize(tokenName, tokenSymbol, projectAddress);

        // Initialize project
        ICornerstoneProject(projectAddress).initialize(
            developer,
            usdc,
            tokenName,
            tokenSymbol,
            minRaise,
            maxRaise,
            fundraiseDeadline,
            phaseAPRs,
            phaseDurations,
            phaseWithdrawCaps,
            tokenAddress
        );

        emit ProjectCreated(projectAddress, tokenAddress, developer);
    }

    function _concat(string memory a, string memory b) internal pure returns (string memory) {
        return string(abi.encodePacked(a, b));
    }

    function _uToString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 j = v;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        j = v;
        while (j != 0) {
            k = k - 1;
            uint8 temp = uint8(48 + (j % 10));
            bstr[k] = bytes1(temp);
            j /= 10;
        }
        return string(bstr);
    }
}
