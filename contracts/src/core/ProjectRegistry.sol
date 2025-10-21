// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CornerstoneProject} from "./CornerstoneProject.sol";

interface IProjectRegistry {
    function createProject(
        address stablecoin,
        uint256 minRaise,
        uint256 maxRaise,
        uint256 fundraiseDeadline,
        uint256[6] calldata phaseAPRs, // includes phase 0 (fundraising)
        uint256[6] calldata phaseDurations, // includes phase 0 (fundraising)
        uint256[6] calldata phaseWithdrawCaps // includes phase 0 (fundraising)
    ) external returns (address projectAddress, address tokenAddress);

    function createProjectWithTokenMeta(
        address stablecoin,
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

contract ProjectRegistry is IProjectRegistry {
    uint256 public projectCount;

    event ProjectCreated(address indexed project, address indexed token, address indexed creator);

    constructor() {}

    function createProject(
        address stablecoin,
        uint256 minRaise,
        uint256 maxRaise,
        uint256 fundraiseDeadline,
        uint256[6] calldata phaseAPRs,
        uint256[6] calldata phaseDurations,
        uint256[6] calldata phaseWithdrawCaps
    ) external returns (address projectAddress, address tokenAddress) {
        require(stablecoin != address(0), "stablecoin addr required");
        require(minRaise > 0 && maxRaise >= minRaise, "bad raise bounds");
        require(fundraiseDeadline > block.timestamp, "deadline in past");

        projectCount += 1;
        string memory tName = _concat("Cornerstone Project #", _uToString(projectCount));
        string memory tSym = _concat("cAGG-", _uToString(projectCount));

        CornerstoneProject project = new CornerstoneProject(
            msg.sender,
            stablecoin,
            tName,
            tSym,
            minRaise,
            maxRaise,
            fundraiseDeadline,
            phaseAPRs,
            phaseDurations,
            phaseWithdrawCaps
        );

        projectAddress = address(project);
        tokenAddress = project.token();

        emit ProjectCreated(projectAddress, tokenAddress, msg.sender);
    }

    function createProjectWithTokenMeta(
        address stablecoin,
        string calldata tokenName,
        string calldata tokenSymbol,
        uint256 minRaise,
        uint256 maxRaise,
        uint256 fundraiseDeadline,
        uint256[6] calldata phaseAPRs,
        uint256[6] calldata phaseDurations,
        uint256[6] calldata phaseWithdrawCaps
    ) external returns (address projectAddress, address tokenAddress) {
        require(stablecoin != address(0), "stablecoin addr required");
        require(bytes(tokenName).length > 0 && bytes(tokenSymbol).length > 0, "name/symbol req");
        require(minRaise > 0 && maxRaise >= minRaise, "bad raise bounds");
        require(fundraiseDeadline > block.timestamp, "deadline in past");

        projectCount += 1;
        CornerstoneProject project = new CornerstoneProject(
            msg.sender,
            stablecoin,
            tokenName,
            tokenSymbol,
            minRaise,
            maxRaise,
            fundraiseDeadline,
            phaseAPRs,
            phaseDurations,
            phaseWithdrawCaps
        );
        projectAddress = address(project);
        tokenAddress = project.token();
        emit ProjectCreated(projectAddress, tokenAddress, msg.sender);
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
