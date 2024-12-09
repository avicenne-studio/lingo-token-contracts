// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {LingoToken} from "./LingoToken.sol";
import {TokenStaking} from "./TokenStaking.sol";

/**
 * @author wepee
 * @title Lingo Token Vesting
 * @dev Implements the Lingo Token vesting mechanism.
 */
contract TokenVesting is Ownable2Step {
    using MerkleProof for bytes32[];

    enum BeneficiaryType {
        KOLRoundA,
        KOLRoundB,
        KOLRoundFreeAllocation,
        LingoIslandsAirdrop,
        LingoIslandsAirdropFirstClass,
        PartnersAirdrop,
        PartnersAirdropFirstClass,
        PrivateRound3MPostTGEUnlock,
        PrivateRoundA,
        PrivateRoundB,
        PrivateRoundC,
        PrivateRoundD,
        PrivateRoundE,
        PrivateRoundF,
        PublicPresale,
        PublicPresaleFirstClass,
        PublicRound,
        Team
    }

    struct VestingSchedule {
        uint128 rateUnlockedAtStart;
        uint64 cliffDuration; // In blocks
        uint64 vestingDuration; // In blocks
    }

    LingoToken public immutable TOKEN;
    TokenStaking public immutable STAKING;
    uint256 public immutable START_BLOCK;
    bytes32 public merkleRoot;

    mapping(BeneficiaryType => VestingSchedule) public vestingSchedules;

    mapping(address => mapping(BeneficiaryType => uint256))
        public claimedTokens;

    /// @notice Emitted when a user claim tokens.
    /// @param beneficiary Address of the vested user.
    /// @param amount Amount of tokens staked.
    event TokensReleased(address beneficiary, uint256 amount);

    // Custom errors
    error MerkleRootAlreadySet();
    error WrongLength();
    error InvalidMerkleProof();
    error NoClaimableTokens();

    constructor(
        address _initialOwner,
        address _tokenAddress,
        address _stakingAddress,
        VestingSchedule[] memory _vestingSchedules,
        uint256 _startBlock
    ) Ownable(_initialOwner) {
        TOKEN = LingoToken(_tokenAddress);
        STAKING = TokenStaking(_stakingAddress);
        START_BLOCK = _startBlock;

        if (_vestingSchedules.length != 18) revert WrongLength();

        for (uint256 i = 0; i < _vestingSchedules.length; i++) {
            vestingSchedules[BeneficiaryType(i)] = _vestingSchedules[i];
        }
    }

    /**
     * @notice Sets the Merkle root for verifying claims
     * @param _merkleRoot The new Merkle root
     */
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        if (merkleRoot != bytes32(0)) revert MerkleRootAlreadySet();
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
        _claimTokens(
            _merkleProof,
            _beneficiaryType,
            _totalAllocation,
            msg.sender
        );
    }

    /**
     * @notice Claims tokens based on the vesting schedule and Merkle proof
     * @param _merkleProof The Merkle proof to verify the claim
     * @param _beneficiaryType The type of beneficiary
     * @param _totalAllocation The total token allocation for the beneficiary
     * @param _durationIndex The chosen duration index for staking
     * @param _expectedDuration This ensures that any changes to the lock durations by the admin cannot affect ongoing user staking operations without their knowledge
     */
    function claimAndStakeTokens(
        bytes32[] calldata _merkleProof,
        BeneficiaryType _beneficiaryType,
        uint256 _totalAllocation,
        uint256 _durationIndex,
        uint256 _expectedDuration
    ) external {
        uint256 claimedAmount = _claimTokens(
            _merkleProof,
            _beneficiaryType,
            _totalAllocation,
            address(this)
        );
        TOKEN.approve(address(STAKING), _totalAllocation);
        STAKING.stake(
            claimedAmount,
            _durationIndex,
            _expectedDuration,
            msg.sender
        );
    }

    /**
     * @notice Calculates the claimable tokens for a user based on the vesting schedule
     * @param _user The address of the user
     * @param _beneficiaryType The type of beneficiary
     * @param _totalAllocation The total token allocation for the beneficiary
     * @return The amount of claimable tokens
     */
    function claimableTokenOf(
        address _user,
        BeneficiaryType _beneficiaryType,
        uint256 _totalAllocation
    ) public view returns (uint256) {
        VestingSchedule memory schedule = vestingSchedules[_beneficiaryType];
        uint256 rateUnlockedAtStart = schedule.rateUnlockedAtStart;
        uint256 cliffDuration = schedule.cliffDuration;
        uint256 vestingDuration = schedule.vestingDuration;

        // If current block is before the TGE, no tokens are claimable
        if (block.number <= START_BLOCK) {
            return 0;
        }

        uint256 elapsedBlocks = block.number - START_BLOCK;

        // Calculate initially unlocked tokens based on the percentage
        uint256 vestedAmount = (_totalAllocation * rateUnlockedAtStart) / 100;

        // if we are during the vesting period
        if (elapsedBlocks > cliffDuration) {
            uint256 elapsedVestingBlocks = elapsedBlocks - cliffDuration;

            uint256 vestingBlocks = vestingDuration - cliffDuration;

            if (vestingBlocks == 0) {
                vestedAmount = _totalAllocation;
            } else {
                // Calculate the vesting ratio with extra precision to avoid rounding errors
                uint256 vestingRatio = (((elapsedVestingBlocks * 1e18) /
                    vestingBlocks) * 100) / 1e18;

                // Calculate additional vested tokens based on the vesting ratio
                vestedAmount +=
                    ((_totalAllocation - vestedAmount) * vestingRatio) /
                    100;
            }
        }

        // Ensure vested amount does not exceed the total allocation
        vestedAmount = vestedAmount > _totalAllocation
            ? _totalAllocation
            : vestedAmount;
        uint256 claimable = vestedAmount -
            claimedTokens[_user][_beneficiaryType];

        return claimable;
    }

    /**
     * @dev Claims tokens based on the vesting schedule and Merkle proof
     * @param _merkleProof The Merkle proof to verify the claim
     * @param _beneficiaryType The type of beneficiary
     * @param _totalAllocation The total token allocation for the beneficiary
     * @param _beneficiary The address of the beneficiary
     */
    function _claimTokens(
        bytes32[] calldata _merkleProof,
        BeneficiaryType _beneficiaryType,
        uint256 _totalAllocation,
        address _beneficiary
    ) private returns (uint256) {
        bytes32 leaf = keccak256(
            bytes.concat(
                keccak256(
                    abi.encode(msg.sender, _beneficiaryType, _totalAllocation)
                )
            )
        );
        if (!_merkleProof.verify(merkleRoot, leaf)) revert InvalidMerkleProof();

        uint256 claimableToken = claimableTokenOf(
            msg.sender,
            _beneficiaryType,
            _totalAllocation
        );
        if (claimableToken == 0) revert NoClaimableTokens();

        claimedTokens[msg.sender][_beneficiaryType] += claimableToken;

        TOKEN.mint(_beneficiary, claimableToken);

        emit TokensReleased(msg.sender, claimableToken);

        return claimableToken;
    }
}
