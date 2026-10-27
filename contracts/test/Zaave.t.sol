// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Zaave} from "../src/Zaave.sol";
import {MockUSDC, MockAToken, MockPool} from "./mocks/Mocks.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ZaaveTest is Test {
    MockUSDC usdc;
    MockAToken aToken;
    MockPool pool;
    Zaave z;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address fulfil = makeAddr("fulfil");

    uint256 constant JAN_10_2026 = 1768000000; // 2026-01-09 23:06 UTC
    uint256 constant FEB_1_2026 = 1769904000;
    uint256 constant U = 1e6;

    function setUp() public {
        vm.warp(JAN_10_2026);
        usdc = new MockUSDC();
        aToken = new MockAToken();
        pool = new MockPool(usdc, aToken);
        z = new Zaave(address(pool), address(usdc), owner, 1_000_000e6);
        address[3] memory us = [alice, bob, carol];
        for (uint256 i; i < 3; i++) {
            usdc.mint(us[i], 1_000_000e6);
            vm.prank(us[i]);
            usdc.approve(address(z), type(uint256).max);
        }
    }

    // ---- helpers
    function _dep(address u, uint256 amt) internal {
        vm.prank(u);
        z.deposit(amt);
    }

    function _accrue(uint256 bps) internal {
        pool.accrue(bps);
    }

    function _zaDay() internal {
        vm.warp(z.nextZaDayAt());
        z.zaDay();
    }

    function _checkInvariants(address[] memory us) internal view {
        uint256 sp;
        uint256 sc;
        uint256 ss;
        for (uint256 i; i < us.length; i++) {
            sp += z.principal(us[i]);
            sc += z.credit(us[i]);
            ss += z.shares(us[i]);
        }
        assertEq(sp, z.totalPrincipal(), "totalPrincipal");
        assertEq(sc, z.totalCredit(), "totalCredit");
        assertEq(ss, z.totalShares(), "totalShares");
        assertEq(usdc.balanceOf(address(z)), z.totalCredit(), "idle usdc == credit");
    }

    // ---- constructor / views
    function test_constructor() public view {
        assertEq(z.AUSDC(), address(aToken));
        assertEq(z.POOL(), address(pool));
        assertEq(z.USDC(), address(usdc));
        assertEq(z.owner(), owner);
        assertEq(z.tvlCap(), 1_000_000e6);
        assertEq(z.epoch(), 0);
        assertEq(z.lastZaDay(), JAN_10_2026);
    }

    // ---- deposit / withdraw
    function test_depositWithdrawRoundtrip() public {
        _dep(alice, 1000 * U);
        assertEq(z.principal(alice), 1000 * U);
        assertEq(z.totalPrincipal(), 1000 * U);
        assertEq(z.totalAssets(), 1000 * U);
        assertGt(z.shares(alice), 0);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        z.withdraw(1000 * U);
        assertEq(usdc.balanceOf(alice), before + 1000 * U);
        assertEq(z.principal(alice), 0);
        assertEq(z.shares(alice), 0);
        assertEq(z.totalShares(), 0);
        assertEq(z.totalPrincipal(), 0);
    }

    function test_withdrawAllRoundtrip() public {
        _dep(alice, 777 * U);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        z.withdrawAll();
        assertEq(usdc.balanceOf(alice), before + 777 * U);
        assertEq(z.shares(alice), 0);
    }

    function test_partialWithdraw() public {
        _dep(alice, 1000 * U);
        vm.prank(alice);
        z.withdraw(400 * U);
        assertEq(z.principal(alice), 600 * U);
        assertApproxEqAbs(z.pendingYield(alice), 0, 1);
    }

    function test_depositZeroReverts() public {
        vm.prank(alice);
        vm.expectRevert(Zaave.ZeroAmount.selector);
        z.deposit(0);
    }

    function test_withdrawMoreThanPrincipalReverts() public {
        _dep(alice, 1000 * U);
        _dep(bob, 1000 * U);
        vm.prank(alice);
        vm.expectRevert(Zaave.InsufficientPrincipal.selector);
        z.withdraw(1000 * U + 1);
    }

    function test_cannotWithdrawOthersFunds() public {
        _dep(alice, 1000 * U);
        vm.prank(bob);
        vm.expectRevert(Zaave.InsufficientPrincipal.selector);
        z.withdraw(1);
    }

    function test_principalNeverLostWithYield() public {
        _dep(alice, 1000 * U);
        _accrue(100);
        _zaDay();
        _accrue(100);
        vm.prank(alice);
        z.withdrawAll();
        // got principal back, yield stays as shares/credit
        assertEq(z.principal(alice), 0);
        assertGe(usdc.balanceOf(alice), 1_000_000e6 - 1000 * U + 1000 * U - 1);
    }

    // ---- yield / Za Day
    function test_noCreditBeforeFirstZaDay() public {
        _dep(alice, 1000 * U);
        _accrue(500);
        assertGt(z.pendingYield(alice), 49 * U);
        assertEq(z.claimableYield(alice), 0);
        z.harvest(alice);
        assertEq(z.credit(alice), 0);
        vm.prank(alice);
        z.withdrawAll();
        assertEq(z.credit(alice), 0);
    }

    function test_yieldBecomesCreditOnZaDay() public {
        _dep(alice, 1000 * U);
        _accrue(100); // +1% = 10 USDC
        _zaDay();
        assertEq(z.epoch(), 1);
        uint256 expected = z.claimableYield(alice);
        assertApproxEqAbs(expected, 10 * U, 2);
        z.harvest(alice);
        assertEq(z.credit(alice), expected);
        assertEq(z.totalCredit(), expected);
        assertEq(usdc.balanceOf(address(z)), expected);
        // principal untouched and fully withdrawable
        assertApproxEqAbs(z.pendingYield(alice), 0, 2);
        vm.prank(alice);
        z.withdrawAll();
        assertEq(z.principal(alice), 0);
    }

    function test_harvestIsIdempotent() public {
        _dep(alice, 1000 * U);
        _accrue(100);
        _zaDay();
        z.harvest(alice);
        uint256 c = z.credit(alice);
        z.harvest(alice);
        assertEq(z.credit(alice), c);
        assertEq(z.claimableYield(alice), 0);
    }

    function test_lateDepositorGetsNoPreDepositYield() public {
        _dep(alice, 1000 * U);
        _accrue(100);
        _zaDay();
        // bob deposits after Za Day: must not receive yield from before his deposit
        _dep(bob, 1000 * U);
        assertEq(z.credit(bob), 0);
        assertEq(z.claimableYield(bob), 0);
        z.harvest(bob);
        assertEq(z.credit(bob), 0);
        // alice's old yield is still hers
        z.harvest(alice);
        assertApproxEqAbs(z.credit(alice), 10 * U, 2);
        // next epoch bob only gets post-deposit yield
        _accrue(100);
        _zaDay();
        z.harvest(bob);
        z.harvest(alice);
        // bob has ~1% of 1000 = ~10; alice's value after harvest ~1000, so ~10 more
        assertApproxEqAbs(z.credit(bob), 10 * U, 3);
        assertApproxEqAbs(z.credit(alice), 20 * U, 4);
    }

    function test_multipleUsersProportional() public {
        _dep(alice, 1000 * U);
        _dep(bob, 3000 * U);
        _accrue(200); // 2%
        _zaDay();
        z.harvest(alice);
        z.harvest(bob);
        assertApproxEqAbs(z.credit(alice), 20 * U, 3);
        assertApproxEqAbs(z.credit(bob), 60 * U, 3);
        address[] memory us = new address[](2);
        us[0] = alice;
        us[1] = bob;
        _checkInvariants(us);
    }

    function test_unharvestedYieldAcrossManyEpochsAccumulates() public {
        _dep(alice, 1000 * U);
        for (uint256 i; i < 3; i++) {
            _accrue(100);
            _zaDay();
        }
        assertEq(z.epoch(), 3);
        z.harvest(alice);
        // compounding 1% x3 on 1000 => ~30.3 (accrual after the last snapshot is excluded)
        assertApproxEqAbs(z.credit(alice), 30.3e6, 0.05e6);
    }

    function test_withdrawAutoHarvests() public {
        _dep(alice, 1000 * U);
        _accrue(100);
        _zaDay();
        vm.prank(alice);
        z.withdraw(500 * U);
        assertApproxEqAbs(z.credit(alice), 10 * U, 2);
        assertEq(z.principal(alice), 500 * U);
    }

    function test_depositAutoHarvests() public {
        _dep(alice, 1000 * U);
        _accrue(100);
        _zaDay();
        _dep(alice, 1000 * U);
        assertApproxEqAbs(z.credit(alice), 10 * U, 2);
        assertEq(z.principal(alice), 2000 * U);
        assertApproxEqAbs(z.pendingYield(alice), 0, 3);
    }

    function test_lossDoesNotUnderflowHarvest() public {
        _dep(alice, 1000 * U);
        _zaDay();
        z.harvest(alice);
        assertEq(z.credit(alice), 0);
    }

    // ---- Za Day timing
    function test_zaDayTimingRule() public {
        // deployed 2026-01-09: first Za Day is 2026-02-01
        assertEq(z.nextZaDayAt(), FEB_1_2026);
        vm.warp(FEB_1_2026 - 1);
        vm.expectRevert(Zaave.ZaDayNotReached.selector);
        z.zaDay();
        vm.warp(FEB_1_2026);
        z.zaDay();
        assertEq(z.epoch(), 1);
        // cannot repeat in same month
        vm.warp(FEB_1_2026 + 27 days);
        vm.expectRevert(Zaave.ZaDayNotReached.selector);
        z.zaDay();
        // 2026-03-01 = Feb 1 + 28 days
        assertEq(z.nextZaDayAt(), FEB_1_2026 + 28 days);
        vm.warp(FEB_1_2026 + 28 days);
        z.zaDay();
        assertEq(z.epoch(), 2);
    }

    function test_zaDayLateCallStillNextMonth() public {
        vm.warp(FEB_1_2026 + 20 days); // Feb 21
        z.zaDay();
        // next is Mar 1 even though last call was late
        assertEq(z.nextZaDayAt(), FEB_1_2026 + 28 days);
    }

    function test_zaDayYearRollover() public {
        vm.warp(1798675200 - 1000); // 2026-12-31 (approx)
        // set lastZaDay in December by calling zaDay at Dec 15 first
        vm.warp(1797292800); // 2026-12-15 00:00 UTC
        z.zaDay(); // allowed: Dec is later than Jan
        // next must be 2027-01-01 = 1798761600
        assertEq(z.nextZaDayAt(), 1798761600);
    }

    function test_zaDayLeapYearFeb() public {
        // 2028-02-15 -> next is 2028-03-01 = 1835481600 (leap year)
        vm.warp(1834185600); // 2028-02-15
        z.zaDay();
        assertEq(z.nextZaDayAt(), 1835481600);
    }

    // ---- pie price
    function test_piePrice() public {
        assertEq(z.piePriceOf(alice), 25e6);
        vm.prank(alice);
        z.setPiePrice(18e6);
        assertEq(z.piePriceOf(alice), 18e6);
        assertEq(z.piePriceOf(bob), 25e6);
    }

    function test_piePriceBounds() public {
        vm.startPrank(alice);
        vm.expectRevert(Zaave.PiePriceOutOfBounds.selector);
        z.setPiePrice(1e6 - 1);
        vm.expectRevert(Zaave.PiePriceOutOfBounds.selector);
        z.setPiePrice(1000e6 + 1);
        z.setPiePrice(1e6);
        z.setPiePrice(1000e6);
        vm.stopPrank();
    }

    function test_piePriceDoesNotChangeCredit() public {
        _dep(alice, 1000 * U);
        _accrue(100);
        _zaDay();
        z.harvest(alice);
        uint256 c = z.credit(alice);
        vm.prank(alice);
        z.setPiePrice(100e6);
        assertEq(z.credit(alice), c);
    }

    // ---- redeem
    function _withCredit(address u) internal returns (uint256 c) {
        _dep(u, 10_000 * U);
        _accrue(100);
        _zaDay();
        z.harvest(u);
        c = z.credit(u);
        assertGt(c, 0);
    }

    function test_cashOut() public {
        uint256 c = _withCredit(alice);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        z.cashOut(c / 2);
        assertEq(usdc.balanceOf(alice), before + c / 2);
        assertEq(z.credit(alice), c - c / 2);
        assertEq(z.totalCredit(), c - c / 2);
        vm.prank(alice);
        vm.expectRevert(Zaave.InsufficientCredit.selector);
        z.cashOut(c);
    }

    function test_cashOutWorksWhenAaveIlliquid() public {
        uint256 c = _withCredit(alice);
        _accrue(100);
        _zaDay(); // alice now has unharvested yield for a newer epoch
        vm.mockCallRevert(
            address(pool), abi.encodeWithSelector(MockPool.withdraw.selector), "illiquid"
        );
        vm.prank(alice);
        z.cashOut(c);
        assertEq(z.credit(alice), 0);
    }

    function test_withdrawFullPrincipalWithDust() public {
        _accrue(333); // non-round Aave index so aToken minting rounds down
        _dep(alice, 123_456_789);
        uint256 p = z.principal(alice);
        assertLt(z.valueOf(alice), p, "expected rounding dust");
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        z.withdraw(p);
        assertEq(z.principal(alice), 0);
        assertApproxEqAbs(usdc.balanceOf(alice), before + p, 2);
    }

    function test_renounceOwnershipDisabled() public {
        vm.prank(owner);
        vm.expectRevert(Zaave.RenounceDisabled.selector);
        z.renounceOwnership();
    }

    function test_redeemForGiftCard() public {
        uint256 c = _withCredit(alice);
        vm.prank(owner);
        z.setFulfillment(fulfil);
        vm.expectEmit(true, true, false, true);
        emit Zaave.GiftCardRequested(0, alice, c);
        vm.prank(alice);
        uint256 id = z.redeemForGiftCard(c);
        assertEq(id, 0);
        assertEq(usdc.balanceOf(fulfil), c);
        assertEq(z.credit(alice), 0);
        assertEq(z.totalCredit(), 0);
        assertEq(z.nextRequestId(), 1);
    }

    function test_redeemForGiftCardDisabledWithoutFulfillment() public {
        _withCredit(alice);
        vm.prank(alice);
        vm.expectRevert(Zaave.FulfillmentNotSet.selector);
        z.redeemForGiftCard(1);
    }

    function test_redeemInsufficientCredit() public {
        _withCredit(alice);
        vm.prank(owner);
        z.setFulfillment(fulfil);
        vm.prank(alice);
        vm.expectRevert(Zaave.InsufficientCredit.selector);
        z.redeemForGiftCard(type(uint128).max);
    }

    // ---- caps / pause / admin
    function test_tvlCap() public {
        vm.prank(owner);
        z.setTvlCap(1500 * U);
        _dep(alice, 1000 * U);
        vm.prank(bob);
        vm.expectRevert(Zaave.TvlCapExceeded.selector);
        z.deposit(501 * U);
        _dep(bob, 500 * U);
        // withdrawing frees capacity
        vm.prank(alice);
        z.withdraw(100 * U);
        _dep(carol, 100 * U);
    }

    function test_pauseBlocksDepositNotWithdrawOrCashOut() public {
        uint256 c = _withCredit(alice);
        vm.prank(owner);
        z.setFulfillment(fulfil);
        vm.prank(owner);
        z.pause();
        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        z.deposit(1 * U);
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        z.redeemForGiftCard(1);
        vm.prank(alice);
        z.cashOut(c);
        vm.prank(alice);
        z.withdrawAll();
        assertEq(z.principal(alice), 0);
        vm.prank(owner);
        z.unpause();
        _dep(bob, 1 * U);
    }

    function test_adminOnly() public {
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        z.setTvlCap(1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        z.setFulfillment(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        z.pause();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        z.rescue(address(0xdead));
        vm.stopPrank();
    }

    function test_ownable2Step() public {
        vm.prank(owner);
        z.transferOwnership(alice);
        assertEq(z.owner(), owner);
        vm.prank(alice);
        z.acceptOwnership();
        assertEq(z.owner(), alice);
    }

    function test_rescueCannotTouchUsdcOrAusdc() public {
        vm.startPrank(owner);
        vm.expectRevert(Zaave.ProtectedToken.selector);
        z.rescue(address(usdc));
        vm.expectRevert(Zaave.ProtectedToken.selector);
        z.rescue(address(aToken));
        vm.stopPrank();
    }

    function test_rescueOtherToken() public {
        MockUSDC other = new MockUSDC();
        other.mint(address(z), 5e6);
        vm.prank(owner);
        z.rescue(address(other));
        assertEq(other.balanceOf(owner), 5e6);
    }

    // ---- inflation attack
    function test_inflationAttackResisted() public {
        // attacker deposits 1 wei, then donates a lot of aUSDC directly to the vault
        usdc.mint(address(this), 10_000e6);
        usdc.approve(address(pool), type(uint256).max);
        vm.prank(alice);
        z.deposit(1);
        // donation: mint aToken straight to vault, backed by pool USDC
        usdc.mint(address(pool), 10_000e6);
        aToken.mintTo(address(z), 10_000e6);
        // victim deposits
        uint256 victimAmt = 5000 * U;
        _dep(bob, victimAmt);
        assertGt(z.shares(bob), 0, "victim must get shares");
        // victim can withdraw nearly everything (virtual offset caps attacker's theft)
        uint256 before = usdc.balanceOf(bob);
        vm.prank(bob);
        z.withdrawAll();
        uint256 got = usdc.balanceOf(bob) - before;
        assertGe(got, (victimAmt * 99_999) / 100_000); // loss < 0.001%
    }

    function test_inflationAttackCostsAttacker() public {
        // attacker front-runs victim: 1 wei deposit + donation D. Victim's loss <= D * 1e6/(1e6+...)
        vm.prank(alice);
        z.deposit(1);
        uint256 donation = 1000 * U;
        usdc.mint(address(pool), donation);
        aToken.mintTo(address(z), donation);
        _dep(bob, 1000 * U);
        // attacker shares are tiny relative to donation, so attacker cannot profit:
        // alice's value (1 wei principal + share of donation + share of bob rounding) < donation + 1
        assertLe(z.valueOf(alice), donation + 1);
        // bob's value within 0.01% of deposit despite donation
        assertGe(z.valueOf(bob), (1000 * U * 9999) / 10_000);
    }

    // ---- fuzz
    function testFuzz_depositWithdrawHarvest(uint256 seed) public {
        address[] memory us = new address[](3);
        us[0] = alice;
        us[1] = bob;
        us[2] = carol;
        uint256 n = 25;
        for (uint256 i; i < n; i++) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            address u = us[r % 3];
            uint256 act = (r >> 8) % 6;
            uint256 amt = ((r >> 16) % 50_000e6) + 1;
            if (act == 0 || act == 1) {
                if (z.totalPrincipal() + amt > z.tvlCap()) continue;
                _dep(u, amt);
            } else if (act == 2) {
                uint256 p = z.principal(u);
                if (p == 0) continue;
                uint256 w = (amt % p) + 1;
                if (w > z.valueOf(u)) continue;
                vm.prank(u);
                z.withdraw(w);
            } else if (act == 3) {
                _accrue((r >> 40) % 300);
            } else if (act == 4) {
                vm.warp(z.nextZaDayAt());
                z.zaDay();
            } else {
                z.harvest(u);
            }
            _checkInvariants(us);
        }
        // everyone can always exit with principal (within rounding)
        for (uint256 i; i < us.length; i++) {
            uint256 p = z.principal(us[i]);
            uint256 before = usdc.balanceOf(us[i]);
            vm.prank(us[i]);
            if (p > 0) z.withdrawAll();
            assertApproxEqAbs(usdc.balanceOf(us[i]) - before, p, 8, "principal returned");
        }
        _checkInvariants(us);
    }

    function testFuzz_noPrincipalLossAcrossEpochs(uint96 amount, uint16 bps) public {
        amount = uint96(bound(amount, 1 * U, 500_000e6));
        bps = uint16(bound(bps, 0, 1000));
        _dep(alice, amount);
        _accrue(bps);
        _zaDay();
        _accrue(bps);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        z.withdrawAll();
        assertApproxEqAbs(usdc.balanceOf(alice) - before, amount, 2);
    }
}
