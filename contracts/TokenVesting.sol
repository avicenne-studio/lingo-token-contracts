// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {LingoToken} from "./LingoToken.sol";

/**
 * @author wepee
 * @title Lingo Token Vesting
 * @dev Implements the Lingo Token vesting mechanism.
 */
contract TokenVesting is Ownable {
    using MerkleProof for bytes32[];

    /// @notice Emitted when a user claim tokens.
    /// @param beneficiary Address of the vested user.
    /// @param amount Amount of tokens staked.
    event TokensReleased(address beneficiary, uint256 amount);

    enum BeneficiaryType {
        PreSeed,
        KOLRound,
        PrivateSale,
        PublicSale,
        SocialFiParticipantsAirdrop,
        StrategicPartners,
        Ambassadors,
        Team
    }

    struct VestingSchedule {
        uint128 unlockedAtStart;
        uint128 cliffDuration; // In blocks
        uint128 vestingDuration; // In blocks
    }

    LingoToken public token;
    bytes32 public merkleRoot;
    uint256 public startBlock;

    mapping(BeneficiaryType => VestingSchedule) public vestingSchedules;

    mapping(address => uint256) public claimedTokens;
    mapping(address => uint256) public lastClaimBlock;

    // Custom errors
    error InvalidMerkleProof();
    error NoClaimableTokens();

    constructor(
        address _initialOwner,
        address _tokenAddress,
        VestingSchedule[] memory _vestingSchedules,
        uint256 _startBlock
    ) Ownable(_initialOwner) {
        token = LingoToken(_tokenAddress);
        startBlock = _startBlock;

        for (uint256 i = 0; i < _vestingSchedules.length; i++) {
            vestingSchedules[BeneficiaryType(i)] = _vestingSchedules[i];
        }
    }

    /**
     * @notice Sets the Merkle root for verifying claims
     * @param _merkleRoot The new Merkle root
     */
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
    }

    /**
     * @notice Claims tokens based on the vesting schedule and Merkle proof
     * @param _merkleProof The Merkle proof to verify the claim
     * @param _beneficiaryType The type of beneficiary
     * @param _totalAllocation The total token allocation for the beneficiary
     */
    function claimTokens(
        bytes32[] calldata _merkleProof,
        BeneficiaryType _beneficiaryType,
        uint256 _totalAllocation
    ) external {
        bytes32 leaf = keccak256(
            bytes.concat(keccak256(abi.encode(msg.sender, _beneficiaryType, _totalAllocation)))
        );
        if (!_verifyProof(_merkleProof, leaf)) revert InvalidMerkleProof();

        uint256 claimableToken = claimableTokenOf(msg.sender, _beneficiaryType, _totalAllocation);
        if(claimableToken <= 0) revert NoClaimableTokens();

        claimedTokens[msg.sender] += claimableToken;
        lastClaimBlock[msg.sender] = block.number;

        token.mint(msg.sender, claimableToken);

        emit TokensReleased(msg.sender, claimableToken);
    }

    /**
     * @notice Calculates the claimable tokens for a user based on the vesting schedule
     * @param _user The address of the user
     * @param _beneficiaryType The type of beneficiary
     * @param _totalAllocation The total token allocation for the beneficiary
     * @return The amount of claimable tokens
     */
    function claimableTokenOf(address _user, BeneficiaryType _beneficiaryType, uint256 _totalAllocation) public view returns (uint256) {
        VestingSchedule memory schedule = vestingSchedules[_beneficiaryType];
        uint256 unlockedAtStart = schedule.unlockedAtStart;
        uint256 cliffDuration = schedule.cliffDuration;
        uint256 vestingDuration = schedule.vestingDuration;

        // If current block is before the TGE, no tokens are claimable
        if (block.number <= startBlock) {
            return 0;
        }

        uint256 elapsedBlocks = block.number - startBlock;

        // Calculate initially unlocked tokens based on the percentage
        uint256 vestedAmount = (_totalAllocation * unlockedAtStart) / 100;

        // if we are during the vesting period
        if (elapsedBlocks > cliffDuration) {
            uint256 elapsedVestingBlocks = elapsedBlocks - cliffDuration;

            uint256 vestingBlocks = vestingDuration - cliffDuration;

            // Calculate the vesting ratio with extra precision to avoid rounding errors
            uint256 vestingRatio = (((elapsedVestingBlocks * 1e18) / vestingBlocks) * 100) / 1e18;

            // Calculate additional vested tokens based on the vesting ratio
            vestedAmount += ((_totalAllocation - vestedAmount) * vestingRatio) / 100;
        }

        // Ensure vested amount does not exceed the total allocation
        vestedAmount = vestedAmount > _totalAllocation ? _totalAllocation : vestedAmount;
        uint256 claimable = vestedAmount - claimedTokens[_user];

        return claimable;
    }

    /**
     * @notice Verifies the Merkle proof
     * @param _proof The Merkle proof
     * @param _leaf The leaf node to verify
     * @return True if the proof is valid, false otherwise
     */
    function _verifyProof(
        bytes32[] calldata _proof,
        bytes32 _leaf
    ) private view returns (bool) {
        return _proof.verify(merkleRoot, _leaf);
    }
}
