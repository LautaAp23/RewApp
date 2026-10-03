// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {USDr} from "../src/USDr.sol";

contract USDrTest is Test {
    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 internal constant ONRAMP_ROLE = keccak256("ONRAMP_ROLE");

    USDr internal usdr;

    address internal admin = makeAddr("admin");
    address internal onramp = makeAddr("onramp");
    address internal alice = makeAddr("alice");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        usdr = new USDr(admin);
        vm.prank(admin);
        usdr.grantRole(ONRAMP_ROLE, onramp);
    }

    function test_DecimalsIs6() public view {
        assertEq(usdr.decimals(), 6);
    }

    function test_MintWithOnrampRole() public {
        vm.prank(onramp);
        usdr.mint(alice, 100e6);
        assertEq(usdr.balanceOf(alice), 100e6);
    }

    function testFuzz_MintWithOnrampRole(address to, uint256 amount) public {
        vm.assume(to != address(0));
        vm.prank(onramp);
        usdr.mint(to, amount);
        assertEq(usdr.balanceOf(to), amount);
        assertEq(usdr.totalSupply(), amount);
    }

    function test_MintWithoutRoleReverts() public {
        _expectUnauthorized(stranger);
        vm.prank(stranger);
        usdr.mint(alice, 100e6);
    }

    function test_AdminCannotMintWithoutOnrampRole() public {
        _expectUnauthorized(admin);
        vm.prank(admin);
        usdr.mint(alice, 100e6);
    }

    function test_RevokedOnrampCannotMint() public {
        vm.prank(admin);
        usdr.revokeRole(ONRAMP_ROLE, onramp);

        _expectUnauthorized(onramp);
        vm.prank(onramp);
        usdr.mint(alice, 1e6);
    }

    function test_Permit() public {
        (address owner, uint256 ownerKey) = makeAddrAndKey("owner");
        vm.prank(onramp);
        usdr.mint(owner, 100e6);

        uint256 value = 50e6;
        uint256 deadline = block.timestamp + 1 days;
        uint256 nonce = usdr.nonces(owner);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, _permitDigest(owner, alice, value, nonce, deadline));

        usdr.permit(owner, alice, value, deadline, v, r, s);

        assertEq(usdr.allowance(owner, alice), value);
        assertEq(usdr.nonces(owner), nonce + 1);

        vm.prank(alice);
        usdr.transferFrom(owner, alice, value);
        assertEq(usdr.balanceOf(alice), value);
    }

    function test_PermitRevertsWithWrongSigner() public {
        (address owner,) = makeAddrAndKey("owner");
        (, uint256 otherKey) = makeAddrAndKey("other");
        vm.prank(onramp);
        usdr.mint(owner, 100e6);

        uint256 value = 50e6;
        uint256 deadline = block.timestamp + 1 days;

        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(otherKey, _permitDigest(owner, alice, value, usdr.nonces(owner), deadline));

        vm.expectPartialRevert(ERC20Permit.ERC2612InvalidSigner.selector);
        usdr.permit(owner, alice, value, deadline, v, r, s);
    }

    function test_PermitRevertsAfterDeadline() public {
        (address owner, uint256 ownerKey) = makeAddrAndKey("owner");
        vm.prank(onramp);
        usdr.mint(owner, 100e6);

        uint256 value = 50e6;
        uint256 deadline = block.timestamp - 1;

        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(ownerKey, _permitDigest(owner, alice, value, usdr.nonces(owner), deadline));

        vm.expectRevert(abi.encodeWithSelector(ERC20Permit.ERC2612ExpiredSignature.selector, deadline));
        usdr.permit(owner, alice, value, deadline, v, r, s);
    }

    function _permitDigest(address owner, address spender, uint256 value, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonce, deadline));
        return keccak256(abi.encodePacked("\x19\x01", usdr.DOMAIN_SEPARATOR(), structHash));
    }

    function _expectUnauthorized(address account) internal {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, account, ONRAMP_ROLE)
        );
    }
}
