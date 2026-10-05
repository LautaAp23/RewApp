// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {USDr} from "../src/USDr.sol";
import {RewAppPay} from "../src/RewAppPay.sol";

/// @notice Deploys USDr and RewAppPay, grants ONRAMP_ROLE to the relayer, registers the merchants in
/// MERCHANTS and seeds both reward catalogs. Writes the addresses to deployments/<chainId>.json.
///
/// forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract Deploy is Script {
    uint256 internal constant USD = 1e6;

    // docs/PLAN.md §8: working assumptions until the pending decisions are made.
    uint256 internal constant FEE_BPS = 150;
    uint256 internal constant CUSTOMER_POINTS_PER_USD = 10;
    uint256 internal constant COMMERCE_POINTS_PER_USD = 10;
    uint256 internal constant MAX_PAYMENT = 500 * USD;
    uint256 internal constant DAILY_LIMIT = 1_000 * USD;

    function run() external returns (USDr usdr, RewAppPay pay) {
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        address relayer = vm.envOr("RELAYER_ADDRESS", deployer);
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        address[] memory merchants = vm.envOr("MERCHANTS", ",", new address[](0));

        usdr = new USDr(deployer);
        pay = new RewAppPay(
            usdr,
            deployer,
            treasury,
            FEE_BPS,
            CUSTOMER_POINTS_PER_USD,
            COMMERCE_POINTS_PER_USD,
            MAX_PAYMENT,
            DAILY_LIMIT
        );
        usdr.grantRole(usdr.ONRAMP_ROLE(), relayer);

        for (uint256 i; i < merchants.length; ++i) {
            pay.registerMerchant(merchants[i]);
        }

        // Placeholder catalogs (PLAN.md §8). The ids match PlatformReward.id in Postgres.
        pay.setReward(1, RewAppPay.Audience.CUSTOMER, 300, true);
        pay.setReward(2, RewAppPay.Audience.CUSTOMER, 500, true);
        pay.setReward(3, RewAppPay.Audience.CUSTOMER, 1_000, true);
        pay.setReward(101, RewAppPay.Audience.COMMERCE, 2_000, true);
        pay.setReward(102, RewAppPay.Audience.COMMERCE, 5_000, true);
        vm.stopBroadcast();

        string memory json = "deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeUint(json, "blockNumber", block.number);
        vm.serializeAddress(json, "relayer", relayer);
        vm.serializeAddress(json, "treasury", treasury);
        vm.serializeAddress(json, "USDr", address(usdr));
        json = vm.serializeAddress(json, "RewAppPay", address(pay));
        vm.writeJson(json, string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json"));

        console.log("USDr", address(usdr));
        console.log("RewAppPay", address(pay));
    }
}
