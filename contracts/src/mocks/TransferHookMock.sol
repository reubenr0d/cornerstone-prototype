// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITransferHook {
    function onTokenTransfer(address from, address to, uint256 amount) external;
}

interface ICornerstoneTokenMinimal {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

contract TransferHookMock is ITransferHook {
    function onTokenTransfer(address, address, uint256) external {}

    function mintTo(address token, address to, uint256 amount) external {
        ICornerstoneTokenMinimal(token).mint(to, amount);
    }

    function burnFrom(address token, address from, uint256 amount) external {
        ICornerstoneTokenMinimal(token).burn(from, amount);
    }
}
