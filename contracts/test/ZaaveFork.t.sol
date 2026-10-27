// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Zaave} from "../src/Zaave.sol";
import {IPool} from "../src/interfaces/IPool.sol";

/// @notice Fork test against real Aave v3 on Base mainnet. Skipped unless FORK_URL is set:
///         FORK_URL=https://mainnet.base.org forge test --match-contract ZaaveFork
contract ZaaveForkTest is Test {
    address constant POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    Zaave z;
    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        string memory url = vm.envOr("FORK_URL", string(""));
        if (bytes(url).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(url);
        z = new Zaave(POOL, USDC, owner, 50_000e6);
        deal(USDC, alice, 10_000e6);
        deal(USDC, bob, 5_000e6);
        vm.prank(alice);
        IERC20(USDC).approve(address(z), type(uint256).max);
        vm.prank(bob);
        IERC20(USDC).approve(address(z), type(uint256).max);
    }

    function test_fork_aTokenResolved() public view {
        address a = IPool(POOL).getReserveData(USDC).aTokenAddress;
        assertTrue(a != address(0));
        assertEq(z.AUSDC(), a);
    }

    function test_fork_fullCycle() public {
        vm.prank(alice);
        z.deposit(10_000e6);
        assertApproxEqAbs(z.totalAssets(), 10_000e6, 2);

        vm.warp(block.timestamp + 35 days);
        z.zaDay();
        assertEq(z.epoch(), 1);

        z.harvest(alice);
        uint256 c = z.credit(alice);
        emit log_named_uint("credit after 35d on 10k USDC (6dp)", c);
        assertGt(c, 0, "no yield credited");
        assertEq(IERC20(USDC).balanceOf(address(z)), c);

        // cash out part of the credit
        vm.prank(alice);
        z.cashOut(c / 2);
        assertEq(IERC20(USDC).balanceOf(alice), c / 2);

        // principal returns in full (allow rounding)
        uint256 before = IERC20(USDC).balanceOf(alice);
        vm.prank(alice);
        z.withdrawAll();
        assertApproxEqAbs(IERC20(USDC).balanceOf(alice) - before, 10_000e6, 2);
        assertEq(z.principal(alice), 0);
    }

    function test_fork_lateDepositorNoPreDepositYield() public {
        vm.prank(alice);
        z.deposit(10_000e6);
        vm.warp(block.timestamp + 35 days);
        z.zaDay();
        vm.prank(bob);
        z.deposit(5_000e6);
        z.harvest(bob);
        assertEq(z.credit(bob), 0);
        z.harvest(alice);
        assertGt(z.credit(alice), 0);
    }
}
