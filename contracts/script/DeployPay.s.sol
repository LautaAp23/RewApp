// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RewAppPay} from "../src/RewAppPay.sol";

/// @notice Redeploys ONLY RewAppPay against an existing USDr, re-seeds the demo merchants, their
/// cashback rules and both reward catalogs. USDr keeps every balance and its ONRAMP_ROLE.
///
/// USDR_ADDRESS=0x... MERCHANTS=0xA,0xB RELAYER_ADDRESS=0x... \
///   forge script script/DeployPay.s.sol --rpc-url monad_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
///
/// Do not use the deploying key for anything else while this runs: the self
/// registration signs against the PREDICTED contract address, so a nonce that
/// changes between simulation and broadcast moves that address and the script
/// fails halfway.
///
/// `run` delegates to small helpers on purpose: with every local in one frame the script does not
/// compile ("stack too deep"), and turning on viaIR would change how the whole project compiles,
/// including the contracts already deployed and verified.
contract DeployPay is Script {
    uint256 internal constant USD = 1e6;

    // docs/PLAN.md §8: same working assumptions as the original deploy.
    uint256 internal constant FEE_BPS = 150;
    uint256 internal constant CUSTOMER_POINTS_PER_USD = 10;
    uint256 internal constant COMMERCE_POINTS_PER_USD = 10;
    uint256 internal constant MAX_PAYMENT = 500 * USD;
    uint256 internal constant DAILY_LIMIT = 1_000 * USD;
    /// Enables seedStreakForDemo. On for Monad testnet; any real deployment must turn it off.
    bool internal constant TESTING_ENABLED = true;

    // Referral program (docs/MODEL.md §6.5): 200 to who invites, 100 to the invitee, on a first payment of
    // USD 5 or more at a verified merchant within 30 days, at most 10 rewarded per person every 30 days.
    uint256 internal constant REFERRER_BONUS = 200;
    uint256 internal constant REFEREE_BONUS = 100;
    uint256 internal constant REFERRAL_MIN = 5 * USD;
    uint256 internal constant REFERRAL_WINDOW = 30 days;
    uint256 internal constant REFERRAL_CAP = 10;

    // Café Demo keeps the 10% cashback over USD 5 it had before the redeploy.
    uint16 internal constant DEMO_CASHBACK_BPS = 1_000;
    uint256 internal constant DEMO_CASHBACK_MIN = 5 * USD;

    /// Same deterministic testnet key as scripts/demo-charge.mjs and api/dev/charge.
    uint256 internal constant DEMO_KEY = uint256(keccak256(bytes("rewapp.smoke.merchant")));
    /// Bistro Demo (EUR), same deterministic scheme as scripts/demo-charge.mjs.
    uint256 internal constant EUR_DEMO_KEY = uint256(keccak256(bytes("rewapp.demo.merchant.eur")));

    function run() external returns (RewAppPay pay) {
        IERC20 usdr = IERC20(vm.envAddress("USDR_ADDRESS"));
        vm.startBroadcast();
        pay = _deploy(usdr);
        _registerAdminMerchants(pay);
        _selfRegisterDemo(pay);
        _setDemoCashback(pay);
        _seedRewards(pay);
        _grantReferralRoles(pay);
        _verifyDemoMerchants(pay);
        _setReferralParams(pay);
        vm.stopBroadcast();
        console.log("seeded rewards: 3 customer + 2 commerce");
        _writeDeployment(usdr, pay);
        console.log("RewAppPay", address(pay));
    }

    function _deploy(IERC20 usdr) internal returns (RewAppPay) {
        (, address deployer,) = vm.readCallers();
        return new RewAppPay(
            usdr,
            deployer,
            vm.envOr("TREASURY_ADDRESS", deployer),
            FEE_BPS,
            CUSTOMER_POINTS_PER_USD,
            COMMERCE_POINTS_PER_USD,
            MAX_PAYMENT,
            DAILY_LIMIT,
            TESTING_ENABLED
        );
    }

    /// MERCHANTS: merchants an admin enables directly (the EUR demo one and any other).
    /// Required on purpose: forgetting it would leave those merchants with a row in
    /// Postgres and no onchain enablement, which is the NotMerchant state the whole
    /// sign-up order exists to avoid, and it would happen in silence.
    function _registerAdminMerchants(RewAppPay pay) internal {
        address[] memory merchants = vm.envOr("MERCHANTS", ",", new address[](0));
        require(merchants.length > 0, "MERCHANTS is empty: pass the demo merchant addresses");
        for (uint256 i; i < merchants.length; ++i) {
            pay.registerMerchant(merchants[i]);
            console.log("registered by admin", merchants[i]);
        }
    }

    /// Café Demo re-registers ITSELF with its own signature, which also exercises the new path.
    function _selfRegisterDemo(RewAppPay pay) internal {
        address demo = vm.addr(DEMO_KEY);
        console.log("self-registered with its own signature", demo);
        RewAppPay.MerchantIntent memory intent =
            RewAppPay.MerchantIntent({merchant: demo, nonce: pay.nonces(demo), deadline: block.timestamp + 1 hours});
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(DEMO_KEY, pay.hashMerchantIntent(intent));
        pay.registerMerchantWithSig(intent, abi.encodePacked(r, s, v));
    }

    /// No admin function can set another merchant's rule (setMerchantRule uses msg.sender), so the
    /// cashback is signed by Café Demo too. Runs after the self-registration: the nonce is already 1.
    function _setDemoCashback(RewAppPay pay) internal {
        address demo = vm.addr(DEMO_KEY);
        RewAppPay.RuleIntent memory rule = RewAppPay.RuleIntent({
            merchant: demo,
            ruleType: RewAppPay.RuleType.CASHBACK,
            minAmount: DEMO_CASHBACK_MIN,
            valueBps: DEMO_CASHBACK_BPS,
            fixedAmount: 0,
            visitsGoal: 0,
            active: true,
            nonce: pay.nonces(demo),
            deadline: block.timestamp + 1 hours
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(DEMO_KEY, pay.hashRuleIntent(rule));
        pay.setMerchantRuleWithSig(rule, abi.encodePacked(r, s, v));
    }

    /// Placeholder catalogs (PLAN.md §8). The ids match PlatformReward.id in Postgres.
    function _seedRewards(RewAppPay pay) internal {
        pay.setReward(1, RewAppPay.Audience.CUSTOMER, 300, true);
        pay.setReward(2, RewAppPay.Audience.CUSTOMER, 500, true);
        pay.setReward(3, RewAppPay.Audience.CUSTOMER, 1_000, true);
        // Birthday gift (notifications change): minimal cost (the contract
        // rejects zero), once per year enforced off-chain.
        pay.setReward(90, RewAppPay.Audience.CUSTOMER, 1, true);
        pay.setReward(101, RewAppPay.Audience.COMMERCE, 2_000, true);
        pay.setReward(102, RewAppPay.Audience.COMMERCE, 5_000, true);
    }

    /// RELAYER_ADDRESS is required for the same reason as MERCHANTS: without REFERRAL_ROLE the app cannot
    /// record a single invitation, and it would fail in silence.
    function _grantReferralRoles(RewAppPay pay) internal {
        address relayer = vm.envOr("RELAYER_ADDRESS", address(0));
        require(relayer != address(0), "RELAYER_ADDRESS is empty: pass the relayer address");
        (, address deployer,) = vm.readCallers();
        pay.grantRole(pay.REFERRAL_ROLE(), relayer);
        pay.grantRole(pay.VERIFIER_ROLE(), deployer);
        console.log("REFERRAL_ROLE", relayer);
    }

    /// Only the two demo merchants, which have no person behind them, are verified (each as its own owner).
    /// MERCHANTS may also carry person-owned businesses being re-registered: verifying those with
    /// owner = merchant would switch off the "own shop" rule, so they are verified by hand with their real
    /// owner (`Merchant.ownerAddress` in Postgres) through `setMerchantVerification`.
    function _verifyDemoMerchants(RewAppPay pay) internal {
        address cafe = vm.addr(DEMO_KEY);
        pay.setMerchantVerification(cafe, cafe);
        address bistro = vm.addr(EUR_DEMO_KEY);
        if (pay.isMerchant(bistro)) pay.setMerchantVerification(bistro, bistro);
        console.log("verified for referrals", cafe);
    }

    function _setReferralParams(RewAppPay pay) internal {
        pay.setReferralParams(REFERRER_BONUS, REFEREE_BONUS, REFERRAL_MIN, REFERRAL_WINDOW, REFERRAL_CAP);
    }

    function _writeDeployment(IERC20 usdr, RewAppPay pay) internal {
        string memory json = "pay-deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "USDr", address(usdr));
        json = vm.serializeAddress(json, "RewAppPay", address(pay));
        vm.writeJson(json, string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), "-pay.json"));
    }
}
