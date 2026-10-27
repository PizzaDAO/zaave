// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPool} from "../../src/interfaces/IPool.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

/// @dev Rebasing aToken: balance = scaled * index / 1e27, like Aave. Bump `index` to accrue interest.
contract MockAToken is ERC20 {
    uint256 public index = 1e27;
    mapping(address => uint256) public scaled;
    uint256 public scaledTotal;

    constructor() ERC20("aUSDC", "aUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function balanceOf(address a) public view override returns (uint256) {
        return (scaled[a] * index) / 1e27;
    }

    function totalSupply() public view override returns (uint256) {
        return (scaledTotal * index) / 1e27;
    }

    function mintTo(address to, uint256 amt) external {
        uint256 s = (amt * 1e27) / index;
        scaled[to] += s;
        scaledTotal += s;
    }

    function burnFrom(address from, uint256 amt) external {
        uint256 s = (amt * 1e27 + index - 1) / index; // round up like Aave
        scaled[from] -= s;
        scaledTotal -= s;
    }

    /// @dev accrue `bps` basis points of interest to every holder
    function accrue(uint256 bps) external {
        index = (index * (10_000 + bps)) / 10_000;
    }
}

contract MockPool {
    MockUSDC public usdc;
    MockAToken public aToken;

    constructor(MockUSDC u, MockAToken a) {
        usdc = u;
        aToken = a;
    }

    function supply(address, uint256 amount, address onBehalfOf, uint16) external {
        usdc.transferFrom(msg.sender, address(this), amount);
        aToken.mintTo(onBehalfOf, amount);
    }

    function withdraw(address, uint256 amount, address to) external returns (uint256) {
        aToken.burnFrom(msg.sender, amount);
        usdc.transfer(to, amount);
        return amount;
    }

    function getReserveData(address) external view returns (IPool.ReserveData memory d) {
        d.aTokenAddress = address(aToken);
    }

    /// @dev test helper: accrue interest and make sure the pool holds the matching USDC
    function accrue(uint256 bps) external {
        uint256 before = aToken.totalSupply();
        aToken.accrue(bps);
        uint256 delta = aToken.totalSupply() - before;
        usdc.mint(address(this), delta + 10);
    }
}
