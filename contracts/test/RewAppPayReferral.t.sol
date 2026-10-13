// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {USDr} from "../src/USDr.sol";
import {RewAppPay} from "../src/RewAppPay.sol";

/// Referral program (docs/MODEL.md §6.5): REFERRAL_ROLE records who invited whom, and the bonus is paid
/// inside the referee's first qualifying payment.
contract RewAppPayReferralTest is Test {
    USDr internal usdr;
    RewAppPay internal pay;

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal relayer = makeAddr("relayer");
    address internal referrer = makeAddr("referrer");
    address internal merchant = makeAddr("merchant");
    address internal referrersShop = makeAddr("referrersShop");
    address internal unverified = makeAddr("unverified");
    address internal referee;
    uint256 internal refereeKey;

    uint256 internal constant USD = 1e6;
    uint256 internal constant REFERRER_BONUS = 200;
    uint256 internal constant REFEREE_BONUS = 100;
    uint256 internal constant MIN = 5 * USD;
    uint256 internal constant WINDOW = 30 days;
    uint256 internal constant CAP = 10;

    uint256 internal charges;

    function setUp() public {
        // A realistic clock: periods and days are counted from the epoch.
        vm.warp(1_760_000_000);
        usdr = new USDr(admin);
        pay = new RewAppPay(usdr, admin, treasury, 150, 10, 10, 500 * USD, 1_000 * USD, true);

        vm.startPrank(admin);
        usdr.grantRole(usdr.ONRAMP_ROLE(), admin);
        pay.registerMerchant(merchant);
        pay.registerMerchant(referrersShop);
        pay.registerMerchant(unverified);
        pay.grantRole(pay.REFERRAL_ROLE(), relayer);
        pay.grantRole(pay.VERIFIER_ROLE(), admin);
        pay.setMerchantVerification(merchant, merchant);
        pay.setMerchantVerification(referrersShop, referrer);
        pay.setReferralParams(REFERRER_BONUS, REFEREE_BONUS, MIN, WINDOW, CAP);
        vm.stopPrank();

        (referee, refereeKey) = _account("referee");
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /// A funded account that already approved RewAppPay, so payments need no permit.
    function _account(string memory name) internal returns (address account, uint256 key) {
        (account, key) = makeAddrAndKey(name);
        vm.prank(admin);
        usdr.mint(account, 1_000 * USD);
        vm.prank(account);
        usdr.approve(address(pay), type(uint256).max);
    }

    function _refer(address who, address by) internal {
        vm.prank(relayer);
        pay.setReferral(who, by);
    }

    function _payAs(address payer, uint256 key, address to, uint256 amount) internal {
        RewAppPay.PaymentIntent memory intent = RewAppPay.PaymentIntent({
            payer: payer,
            merchant: to,
            amount: amount,
            chargeId: bytes32(++charges),
            nonce: pay.nonces(payer),
            deadline: block.timestamp + 5 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, pay.hashPaymentIntent(intent));
        RewAppPay.PermitData memory noPermit;
        vm.prank(relayer);
        pay.payWithSig(intent, abi.encodePacked(r, s, v), noPermit);
    }

    function _pay(address to, uint256 amount) internal {
        _payAs(referee, refereeKey, to, amount);
    }

    // ------------------------------------------------------------------
    // Parameters
    // ------------------------------------------------------------------

    function test_ProgramStartsPaused() public {
        RewAppPay fresh = new RewAppPay(usdr, admin, treasury, 150, 10, 10, 500 * USD, 1_000 * USD, true);
        assertEq(fresh.referralWindow(), 0);
        assertEq(fresh.referrerBonus(), 0);
        assertEq(fresh.refereeBonus(), 0);
        bytes32 role = fresh.REFERRAL_ROLE();
        vm.prank(admin);
        fresh.grantRole(role, relayer);
        vm.expectRevert(RewAppPay.ReferralsPaused.selector);
        vm.prank(relayer);
        fresh.setReferral(referee, referrer);
    }

    function test_SetReferralParamsStoresAndEmits() public {
        vm.expectEmit(address(pay));
        emit RewAppPay.ReferralParamsSet(300, 150, 10 * USD, 7 days, 5);
        vm.prank(admin);
        pay.setReferralParams(300, 150, 10 * USD, 7 days, 5);
        assertEq(pay.referrerBonus(), 300);
        assertEq(pay.refereeBonus(), 150);
        assertEq(pay.referralMinAmount(), 10 * USD);
        assertEq(pay.referralWindow(), 7 days);
        assertEq(pay.referralCap(), 5);
    }

    function test_SetReferralParamsRejectsValuesOverTheCeilings() public {
        uint256 max = pay.MAX_REFERRAL_BONUS();
        vm.startPrank(admin);
        vm.expectRevert(RewAppPay.InvalidReferralParams.selector);
        pay.setReferralParams(max + 1, REFEREE_BONUS, MIN, WINDOW, CAP);
        vm.expectRevert(RewAppPay.InvalidReferralParams.selector);
        pay.setReferralParams(REFERRER_BONUS, max + 1, MIN, WINDOW, CAP);
        vm.expectRevert(RewAppPay.InvalidReferralParams.selector);
        pay.setReferralParams(REFERRER_BONUS, REFEREE_BONUS, 500 * USD + 1, WINDOW, CAP);
        vm.expectRevert(RewAppPay.InvalidReferralParams.selector);
        pay.setReferralParams(REFERRER_BONUS, REFEREE_BONUS, MIN, 90 days + 1, CAP);
        vm.expectRevert(RewAppPay.InvalidReferralParams.selector);
        pay.setReferralParams(REFERRER_BONUS, REFEREE_BONUS, MIN, WINDOW, 101);
        vm.stopPrank();
    }

    function test_SetReferralParamsIsAdminOnly() public {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, relayer, bytes32(0))
        );
        vm.prank(relayer);
        pay.setReferralParams(REFERRER_BONUS, REFEREE_BONUS, MIN, WINDOW, CAP);
    }

    // ------------------------------------------------------------------
    // Merchant verification
    // ------------------------------------------------------------------

    function test_VerifierRecordsAndRemovesTheOwner() public {
        vm.expectEmit(address(pay));
        emit RewAppPay.MerchantVerified(unverified, referrer);
        vm.prank(admin);
        pay.setMerchantVerification(unverified, referrer);
        assertEq(pay.merchantOwner(unverified), referrer);

        vm.prank(admin);
        pay.setMerchantVerification(unverified, address(0));
        assertEq(pay.merchantOwner(unverified), address(0));
    }

    function test_OnlyRegisteredMerchantsCanBeVerified() public {
        address stranger = makeAddr("stranger");
        vm.expectRevert(abi.encodeWithSelector(RewAppPay.NotMerchant.selector, stranger));
        vm.prank(admin);
        pay.setMerchantVerification(stranger, stranger);
    }

    function test_VerificationNeedsTheVerifierRole() public {
        bytes32 role = pay.VERIFIER_ROLE();
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, relayer, role));
        vm.prank(relayer);
        pay.setMerchantVerification(unverified, unverified);
    }

    // ------------------------------------------------------------------
    // setReferral
    // ------------------------------------------------------------------

    function test_SetReferralRecordsWhoInvitedAndEmits() public {
        uint64 expiresAt = uint64(block.timestamp + WINDOW);
        vm.expectEmit(address(pay));
        emit RewAppPay.ReferralSet(referee, referrer, expiresAt);
        _refer(referee, referrer);
        (address by, uint64 expires, bool settled) = pay.referrals(referee);
        assertEq(by, referrer);
        assertEq(expires, expiresAt);
        assertFalse(settled);
    }

    function test_SetReferralNeedsTheReferralRole() public {
        bytes32 role = pay.REFERRAL_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, referrer, role)
        );
        vm.prank(referrer);
        pay.setReferral(referee, referrer);
    }

    function test_SetReferralRejectsZeroAndSelf() public {
        vm.startPrank(relayer);
        vm.expectRevert(RewAppPay.InvalidAddress.selector);
        pay.setReferral(address(0), referrer);
        vm.expectRevert(RewAppPay.InvalidAddress.selector);
        pay.setReferral(referee, address(0));
        vm.expectRevert(RewAppPay.InvalidAddress.selector);
        pay.setReferral(referee, referee);
        vm.stopPrank();
    }

    function test_AnAccountIsReferredOnlyOnce() public {
        _refer(referee, referrer);
        address other = makeAddr("other");
        vm.expectRevert(abi.encodeWithSelector(RewAppPay.AlreadyReferred.selector, referee));
        _refer(referee, other);
    }

    function test_FirstPaymentMarksTheAccountAsPaid() public {
        assertFalse(pay.hasPaid(referee));
        _pay(unverified, 1 * USD);
        assertTrue(pay.hasPaid(referee));
    }

    function test_CannotReferAnAccountThatAlreadyPaid() public {
        _pay(unverified, MIN);
        vm.expectRevert(abi.encodeWithSelector(RewAppPay.RefereeAlreadyPaid.selector, referee));
        _refer(referee, referrer);
    }

    function test_PausedProgramRejectsNewReferrals() public {
        vm.prank(admin);
        pay.setReferralParams(REFERRER_BONUS, REFEREE_BONUS, MIN, 0, CAP);
        vm.expectRevert(RewAppPay.ReferralsPaused.selector);
        _refer(referee, referrer);
    }

    // ------------------------------------------------------------------
    // Settlement inside payWithSig
    // ------------------------------------------------------------------

    function test_FirstQualifyingPaymentRewardsBothInTheSameTransaction() public {
        _refer(referee, referrer);
        vm.expectEmit(address(pay));
        emit RewAppPay.ReferralRewarded(
            referrer, referee, merchant, bytes32(charges + 1), REFERRER_BONUS, REFEREE_BONUS
        );
        _pay(merchant, MIN);
        assertEq(pay.customerPoints(referrer), REFERRER_BONUS);
        assertEq(pay.customerPoints(referee), 50 + REFEREE_BONUS);
        (,, bool settled) = pay.referrals(referee);
        assertTrue(settled);
    }

    function test_PaymentSettledReportsOnlyThePaymentPoints() public {
        _refer(referee, referrer);
        vm.recordLogs();
        _pay(merchant, MIN);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] != RewAppPay.PaymentSettled.selector) continue;
            (,,,, uint256 customerPointsEarned,) =
                abi.decode(logs[i].data, (uint256, uint256, uint256, uint256, uint256, uint256));
            assertEq(customerPointsEarned, 50);
            return;
        }
        revert("PaymentSettled was not emitted");
    }

    function test_PaymentUnderTheMinimumKeepsTheReferralPending() public {
        _refer(referee, referrer);
        _pay(merchant, MIN - 1);
        (,, bool settled) = pay.referrals(referee);
        assertFalse(settled);
        assertEq(pay.customerPoints(referrer), 0);

        _pay(merchant, MIN);
        assertEq(pay.customerPoints(referrer), REFERRER_BONUS);
    }

    function test_ExpiredReferralIsNotPaid() public {
        _refer(referee, referrer);
        vm.warp(block.timestamp + WINDOW + 1);
        _pay(merchant, MIN);
        assertEq(pay.customerPoints(referrer), 0);
        assertEq(pay.customerPoints(referee), 50);
    }

    function test_LastSecondOfTheWindowStillPays() public {
        _refer(referee, referrer);
        vm.warp(block.timestamp + WINDOW);
        _pay(merchant, MIN);
        assertEq(pay.customerPoints(referrer), REFERRER_BONUS);
    }

    function test_UnverifiedMerchantDoesNotPayAndKeepsItPending() public {
        _refer(referee, referrer);
        _pay(unverified, MIN);
        assertEq(pay.customerPoints(referrer), 0);
        (,, bool settled) = pay.referrals(referee);
        assertFalse(settled);

        _pay(merchant, MIN);
        assertEq(pay.customerPoints(referrer), REFERRER_BONUS);
    }

    function test_PaymentAtTheReferrersOwnShopPaysOnlyTheReferee() public {
        _refer(referee, referrer);
        vm.expectEmit(address(pay));
        emit RewAppPay.ReferralRewarded(referrer, referee, referrersShop, bytes32(charges + 1), 0, REFEREE_BONUS);
        _pay(referrersShop, MIN);
        assertEq(pay.customerPoints(referrer), 0);
        assertEq(pay.customerPoints(referee), 50 + REFEREE_BONUS);
    }

    function test_CapPaysOnlyTheRefereeUntilTheNextPeriod() public {
        vm.prank(admin);
        pay.setReferralParams(REFERRER_BONUS, REFEREE_BONUS, MIN, WINDOW, 2);
        for (uint256 i; i < 3; ++i) {
            (address friend, uint256 key) = _account(string.concat("friend", vm.toString(i)));
            _refer(friend, referrer);
            _payAs(friend, key, merchant, MIN);
            assertEq(pay.customerPoints(friend), 50 + REFEREE_BONUS);
        }
        assertEq(pay.customerPoints(referrer), 2 * REFERRER_BONUS);

        uint256 period = pay.REFERRAL_PERIOD();
        vm.warp((block.timestamp / period + 1) * period);
        (address late, uint256 lateKey) = _account("late");
        _refer(late, referrer);
        _payAs(late, lateKey, merchant, MIN);
        assertEq(pay.customerPoints(referrer), 3 * REFERRER_BONUS);
    }

    function test_ReferralPaysOnlyOnce() public {
        _refer(referee, referrer);
        _pay(merchant, MIN);
        _pay(merchant, MIN);
        assertEq(pay.customerPoints(referrer), REFERRER_BONUS);
        assertEq(pay.customerPoints(referee), 100 + REFEREE_BONUS);
    }

    function test_PaysEvenWhenAnyoneSubmitsThePayment() public {
        _refer(referee, referrer);
        RewAppPay.PaymentIntent memory intent = RewAppPay.PaymentIntent({
            payer: referee,
            merchant: merchant,
            amount: MIN,
            chargeId: bytes32(++charges),
            nonce: pay.nonces(referee),
            deadline: block.timestamp + 5 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(refereeKey, pay.hashPaymentIntent(intent));
        RewAppPay.PermitData memory noPermit;
        address anyone = makeAddr("anyone");
        vm.prank(anyone);
        pay.payWithSig(intent, abi.encodePacked(r, s, v), noPermit);
        assertEq(pay.customerPoints(referrer), REFERRER_BONUS);
    }

    function test_PausedProgramKeepsPendingReferralsUnpaid() public {
        _refer(referee, referrer);
        vm.prank(admin);
        pay.setReferralParams(REFERRER_BONUS, REFEREE_BONUS, MIN, 0, CAP);
        _pay(merchant, MIN);
        assertEq(pay.customerPoints(referrer), 0);

        vm.prank(admin);
        pay.setReferralParams(REFERRER_BONUS, REFEREE_BONUS, MIN, WINDOW, CAP);
        _pay(merchant, MIN);
        assertEq(pay.customerPoints(referrer), REFERRER_BONUS);
    }

    function test_PaymentWithoutReferralEarnsOnlyItsPoints() public {
        _pay(merchant, MIN);
        assertEq(pay.customerPoints(referee), 50);
    }

    function testFuzz_OnlyPaymentsFromTheMinimumPay(uint256 amount) public {
        amount = bound(amount, 1, 20 * USD);
        _refer(referee, referrer);
        _pay(merchant, amount);
        assertEq(pay.customerPoints(referrer), amount >= MIN ? REFERRER_BONUS : 0);
    }
}
