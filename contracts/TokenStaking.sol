// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ILingoToken} from "./ILingoToken.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @author wepee
 * @title Lingo Token Staking
 * @dev Implements the Lingo Token staking mechanism.
 */
contract TokenStaking is Ownable {
    struct Position {
        uint128 amount;
        uint128 unlockBlock;
    }

    ILingoToken public immutable LINGO_TOKEN;
    uint256[] public lockDurations; // In blocks
    uint256 public lockDurationsCount;
    mapping(address => Position[]) private userPositions;

    /// @notice Emitted when a user stakes tokens.
    /// @param user Address of the user who staked.
    /// @param amount Amount of tokens staked.
    /// @param duration Duration of the lock period in blocks.
    event Staked(address indexed user, uint256 amount, uint256 duration);

    /// @notice Emitted when a user withdraws staked tokens.
    /// @param user Address of the user who withdrew.
    /// @param amount Amount of tokens withdrawn.
    event Unstaked(address indexed user, uint256 amount);

    /// @notice Emitted when the owner updates the lock durations.
    /// @param durations New lock durations in blocks.
    event LockDurationsUpdated(uint256[] durations);

    // Custom errors
    error Unauthorized();
    error InvalidDuration();
    error NoActiveStake();
    error StakeStillLocked();
    error InsufficientAmount();

    /**
     * @dev Sets the initial contract parameters.
     * @param _lingoToken Address of the Lingo ERC20 token.
     */
    constructor(
        address _initialOwner,
        ILingoToken _lingoToken,
        uint256[] memory _lockDurations
    ) Ownable(_initialOwner) {
        LINGO_TOKEN = ILingoToken(_lingoToken);
        lockDurations = _lockDurations;
        lockDurationsCount = _lockDurations.length;
    }

    /**
     * @notice Allows a user to stake tokens.
     * @param _amount The amount of tokens to stake.
     * @param _durationIndex The chosen duration index for staking.
     * @param _expectedDuration This ensures that any changes to the lock durations by the admin cannot affect ongoing user staking operations without their knowledge.
     * @param _user The address of the user on whose behalf tokens are staked.
     */
    function stake(
        uint256 _amount,
        uint256 _durationIndex,
        uint256 _expectedDuration,
        address _user
    ) external {
        if (_amount == 0) revert InsufficientAmount();
        if(!LINGO_TOKEN.hasRole(LINGO_TOKEN.INTERNAL_ROLE(), address(this))) revert InsufficientAmount();
        if (lockDurations.length < _durationIndex) revert InvalidDuration();

        uint256 duration = lockDurations[_durationIndex];

        if (duration != _expectedDuration) revert InvalidDuration();

        uint256 unlockBlock = block.number + duration;

        userPositions[_user].push(
            Position(uint128(_amount), uint128(unlockBlock))
        );

        emit Staked(_user, _amount, duration);

        LINGO_TOKEN.transferFrom(msg.sender, address(this), _amount);
    }

    /**
     * @notice Allows a user to unstake tokens after the lock period has passed.
     * @param _stakeIndex The index of the position to be unstaked.
     */
    function unstake(uint256 _stakeIndex) external {
        Position memory stakeDetails = userPositions[msg.sender][_stakeIndex];
        if (stakeDetails.amount == 0) revert NoActiveStake();
        if (block.number < stakeDetails.unlockBlock) revert StakeStillLocked();

        uint256 amount = stakeDetails.amount;

        delete userPositions[msg.sender][_stakeIndex];

        emit Unstaked(msg.sender, amount);

        LINGO_TOKEN.transfer(msg.sender, amount);
    }

    /**
     * @notice Allows the owner to update the lock durations.
     * @param _durations The new lock durations in blocks.
     */
    function updateLockDurations(
        uint256[] calldata _durations
    ) external onlyOwner {
        lockDurations = _durations;
        lockDurationsCount = _durations.length;

        emit LockDurationsUpdated(_durations);
    }

    /**
     * @notice Returns the stakes of a user.
     * @param _user The address of the user.
     * @return Array of Stake structures.
     */
    function getStakes(
        address _user
    ) external view returns (Position[] memory) {
        return userPositions[_user];
    }
}
