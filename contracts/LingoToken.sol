/**
 * SPDX-License-Identifier: MIT
 */
pragma solidity 0.8.20;

import {ERC20Burnable, ERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @author Accubits
 * @title LINGO
 * @dev Implements a custom ERC20 token.
 */
contract LingoToken is ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER");
    bytes32 public constant INTERNAL_ROLE = keccak256("INTERNAL_ACCESS");
    bytes32 public constant EXTERNAL_ROLE = keccak256("EXTERNAL_ACCESS");

    // The max supply of token ever available in circulation
    uint256 private constant MAX_SUPPLY = 1_000_000_000 * (10 ** 18);

    // Representing 5% as 500
    uint256 private constant FIVE_PERCENT = 500;

    // Divisor for percentage calculation (10000 represents two decimal places)
    uint256 private constant PERCENTAGE_DIVISOR = 10000;

    /// This is an unsigned integer that represents the transfer fee percentage
    /// Eg: 5% will be represented as 500
    uint256 private _transferFee;

    /// This is an address variable that will hold the treasury wallet's address
    address private _treasuryWallet;

    /**
     * @dev Emitted when the Treasury wallet is updated
     * @param account The new account address that will be set as the treasury wallet
     */
    event TreasuryWalletUpdated(address account);

    /**
     * @dev Event emitted when the transfer fee is updated
     * @param fee The updated transfer fee to be set as a uint256 value
     */
    event TransferFeeUpdated(uint256 fee);

    error ZeroAddress();
    error MaxSupplyExceeded();
    error FeesTooHigh();

    /**
     * @dev Constructor function to initialize values when the contract is created.
     * @param _initialSupply An unsigned integer representing the initial total supply of tokens for the contract.
     * @param _treasuryAddress An address representing the treasury wallet address.
     * @param _txnFee An unsigned integer representing the percentage transfer fee associated with each token transfer.
     */
    constructor(
        uint256 _initialSupply,
        address _treasuryAddress,
        uint256 _txnFee
    ) ERC20("Lingo", "LINGO") {
        /**
         * The ownership of the contract is granted to the specified owner address.
         * This provides full control over the contract to the owner.
         */
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

        /**
         * Here, we set the treasury wallet address to the specified value.
         * This address will be used to receive the transfer fee from every token transfer.
         */
        if(_treasuryAddress == address(0)) revert ZeroAddress();
        _treasuryWallet = _treasuryAddress;
        emit TreasuryWalletUpdated(_treasuryAddress);

        /**
         * The total supply of tokens is calculated in the next line
         * by multiplying the specified value by 10 raised to the power of decimals.
         * This is because the token has a fixed number of decimal places,
         * which can be specified by adding a 'decimals' variable to the contract.
         * Checks whether the max supply has been violated with the inital supply
         * and The tokens are minted and assigned to the contract owner's address.
         */
        uint256 intialTokenSupply = _initialSupply * (10 ** decimals());
        if(intialTokenSupply > MAX_SUPPLY) revert MaxSupplyExceeded();

        _mint(_msgSender(), intialTokenSupply);

        /**
         * In the next line, we set the transfer fee percentage for the token transfers.
         * This is the amount that will be deducted from the transferred amount as a fee
         * and added to the treasury wallet.
         */
        setTransferFee(_txnFee);

        /**
         * In the final line, we set up the default access lists.
         * The access lists ensures that certain addresses can have special permissions within the contract.
         * For instance, they may be able to transfer tokens even if a transfer fee is in place.
         */
        address[] memory internalAddresses = new address[](3);
        internalAddresses[0] = _msgSender();
        internalAddresses[1] = _treasuryWallet;
        internalAddresses[2] = address(this);

        addInternalAccess(internalAddresses);
    }

    /**
     * @dev Sets the treasury wallet address where transfer fees will be credited.
     * @param account The wallet address of the treasury.
     * @notice Function can only be called by contract owner.
     */
    function setTreasuryWalletAddress(
        address account
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        /// The treasury wallet address cannot be zero-address.
        if(account == address(0)) revert ZeroAddress();

        _treasuryWallet = account;
        /// Emitted when `_treasuryWallet` is updated using this function.
        emit TreasuryWalletUpdated(account);
    }

    /**
     * @dev Can mint new tokens upto the max supply limit.
     * @param to The address to mint the tokens to.
     * @param amount The amount of tokens to mint.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if(totalSupply() + amount > MAX_SUPPLY) revert MaxSupplyExceeded();
        _mint(to, amount);
    }

    /**
     * @dev Returns the current transfer fee percentage.
     * @return _transferFee the current transfer fee percentage.
     */
    function getTransferFee() external view returns (uint256) {
        return _transferFee;
    }

    /**
     * @dev Returns the current treasury wallet address.
     * @return _treasuryWallet The current treasury wallet address.
     * @notice Function can only be called by contract owner.
     */
    function getTreasuryWalletAddress() external view returns (address) {
        return _treasuryWallet;
    }

    /**
     * @dev Sets the transfer fee percentage that must be paid by the token sender.
     * @param fee transfer fee in percentage.Eg: 5% as 500.
     * @notice Function can only be called by contract owner.
     */
    function setTransferFee(uint256 fee) public onlyRole(DEFAULT_ADMIN_ROLE) {
        /// Require the fee to be less than or equal to 5%.
        if(fee > FIVE_PERCENT) revert FeesTooHigh();

        _transferFee = fee;
        /// Emitted when `fee` is updated using this function.
        emit TransferFeeUpdated(fee);
    }

    /**
     * @dev Executes a token transfer with or without fees based on the whitelist.
     * @param from The address sending the tokens.
     * @param to The address receiving the tokens.
     * @param amount The amount of tokens to transfer.
     */
    function _executeTransfer(
        address from,
        address to,
        uint256 amount
    ) internal {
        if (_isFeeRequired(from, to)) {
            uint256 fee = (amount * _transferFee) / PERCENTAGE_DIVISOR;
            _transfer(from, _treasuryWallet, fee);
            _transfer(from, to, amount - fee);
        } else {
            _transfer(from, to, amount);
        }
    }

    /**
     * @dev Transfers tokens from the caller to another address.
     * @param to The recipient's address.
     * @param amount The amount of tokens to transfer.
     * @return bool True if the transfer succeeds, false otherwise.
     */
    function transfer(
        address to,
        uint256 amount
    ) public virtual override returns (bool) {
        address sender = _msgSender();
        _executeTransfer(sender, to, amount);
        return true;
    }

    /**
     * @dev Transfers tokens from one address to another on behalf of the sender.
     * @param from The address to transfer tokens from.
     * @param to The address to transfer tokens to.
     * @param amount The amount of tokens to transfer.
     * @return bool True if the transfer succeeds, false otherwise.
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public virtual override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _executeTransfer(from, to, amount);
        return true;
    }


    /**
     * @dev Adds addresses to the internal access list.
     * @param _addr The addresses to be added.
     */
    function addInternalAccess(address[] memory _addr) public onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < _addr.length; i++) {
            _grantRole(INTERNAL_ROLE, _addr[i]);
        }
    }

    /**
     * @dev Adds addresses to the external access list.
     * @param _addr The addresses to be added.
     */
    function addExternalAccess(address[] memory _addr) public onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < _addr.length; i++) {
            _grantRole(EXTERNAL_ROLE, _addr[i]);
        }
    }

    /**
     * @dev Remove address form all access lists.
     * @param _addr The addresses to be added.
     */
    function revokeAccess(address[] memory _addr) public onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < _addr.length; i++) {
            _revokeRole(EXTERNAL_ROLE, _addr[i]);
            _revokeRole(INTERNAL_ROLE, _addr[i]);
        }
    }

    /**
     * @dev Check if fee is required for transfer.
     * @param from The address sending the tokens.
     * @param to The address receiving the tokens.
     * @return bool True if fee is required, false otherwise.
     */
    function _isFeeRequired(
        address from,
        address to
    ) internal view returns (bool) {
        if (
            !hasRole(INTERNAL_ROLE, from) &&
            !hasRole(INTERNAL_ROLE, to) &&
            !hasRole(EXTERNAL_ROLE, to)
        ) {
            return true;
        }
        return false;
    }
}
