// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TokenFaucet
 * @notice Simple faucet that dispenses a fixed amount of tokens once per user per day.
 */
contract TokenFaucet is Ownable {
    IERC20 public immutable token;
    uint256 public constant CLAIM_AMOUNT = 10_000 * 1e6; // assumes token has 6 decimals
    uint256 public constant CLAIM_INTERVAL = 1 days;

    mapping(address => uint256) public lastClaimAt;

    constructor(IERC20 token_) Ownable(msg.sender) {
        token = token_;
    }

    /**
     * @notice Dispense the daily faucet allocation to the caller.
     */
    function claim() external {
        uint256 previous = lastClaimAt[msg.sender];
        if (previous != 0) {
            require(block.timestamp - previous >= CLAIM_INTERVAL, "Faucet: claim too soon");
        }
        lastClaimAt[msg.sender] = block.timestamp;
        bool success = token.transfer(msg.sender, CLAIM_AMOUNT);
        require(success, "Faucet: transfer failed");
    }

    /**
     * @notice Allow the owner to withdraw excess tokens.
     */
    function withdraw(address to, uint256 amount) external onlyOwner {
        bool success = token.transfer(to, amount);
        require(success, "Faucet: withdraw failed");
    }
}
