// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @author wepee
 * @title Lingo Token Staking
 * @dev Implements the Lingo Token staking mechanism.
 */
contract TokenStaking {
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

    struct Position {
        uint256 amount;
        uint256 unlockBlock;
    }

    address public owner;
    IERC20 public immutable lingoToken;
    uint256[] public lockDurations; // Durations in blocks
    uint256 public lockDurationsCount;

    mapping(address => Position[]) private userPositions;

    /**
     * @dev Sets the initial contract parameters.
     * @param _lingoToken Address of the Lingo ERC20 token.
     */
    constructor(address _owner, IERC20 _lingoToken, uint256[] memory _lockDurations) {
        owner = _owner;
        lingoToken = _lingoToken;
        lockDurations = _lockDurations;
        lockDurationsCount = _lockDurations.length;
    }

    /**
     * @notice Allows a user to stake tokens.
     * @param _amount The amount of tokens to stake.
     * @param _duration The chosen duration (in blocks) for staking.
     * @param _user The address of the user on whose behalf tokens are staked.
     */
    function stake(uint256 _amount, uint256 _duration, address _user) external {
        if (_amount == 0) revert InsufficientAmount();
        if (!_isValidDuration(_duration)) revert InvalidDuration();

        uint256 unlockBlock = block.number + _duration;
        userPositions[_user].push(Position(_amount, unlockBlock));

        emit Staked(_user, _amount, _duration);
        require(lingoToken.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
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
        require(lingoToken.transfer(msg.sender, amount), "Transfer failed");
    }

    /**
     * @notice Allows the owner to update the lock durations.
     * @param _durations The new lock durations in blocks.
     */
    function updateLockDurations(uint256[] calldata _durations) external {
        if (msg.sender != owner) revert Unauthorized();
        lockDurations = _durations;
        lockDurationsCount = _durations.length;

        emit LockDurationsUpdated(_durations);
    }

    /**
     * @notice Returns the stakes of a user.
     * @param _user The address of the user.
     * @return Array of Stake structures.
     */
    function getStakes(address _user) external view returns (Position[] memory) {
        return userPositions[_user];
    }

    /**
     * @dev Checks if a duration is valid.
     * @param _duration Duration in blocks.
     * @return True if the duration is valid.
     */
    function _isValidDuration(uint256 _duration) private view returns (bool) {
        for (uint256 i = 0; i < lockDurations.length; i++) {
            if (lockDurations[i] == _duration) {
                return true;
            }
        }
        return false;
    }
}