// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./LingoToken.sol";

contract TokenVesting is Ownable {
    using MerkleProof for bytes32[];

    enum Beneficiary {
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
        uint128 totalAllocation;
        uint128 unlockedAtStart;
        uint128 cliffDuration;
        uint128 vestingDuration;
    }

    LingoToken public token;
    bytes32 public merkleRoot;

    mapping(Beneficiary => VestingSchedule) public vestingSchedules;
    mapping(address => Beneficiary) public beneficiaryTypes;

    mapping(address => uint256) public claimedTokens;
    mapping(address => uint256) public lastClaimTime;

    event TokensReleased(address beneficiary, uint256 amount);

    constructor(address _initialOwner, address _tokenAddress, VestingSchedule[] memory _vestingSchedules) Ownable(_initialOwner) {
        token = LingoToken(_tokenAddress);

        for (uint256 i = 0; i < _vestingSchedules.length; i++) {
            vestingSchedules[Beneficiary(i)] = _vestingSchedules[i];
        }
    }

    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
    }

    function claimTokens(bytes32[] calldata _merkleProof, Beneficiary _beneficiaryType) external {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, _beneficiaryType))));
        require(_verifyProof(_merkleProof, leaf), "Invalid Merkle proof");

        uint256 claimableToken = claimableTokenOf(msg.sender);
        token.mint(msg.sender, claimableToken);

        emit TokensReleased(msg.sender, claimableToken);
    }

    function claimableTokenOf(address _user) public view returns (uint256) {
        // compute claimable token of _user
        return 10*10**18;
    }

    function _verifyProof(bytes32[] calldata _proof, bytes32 _leaf) private view returns (bool) {
        return _proof.verify(merkleRoot, _leaf);
    }
}
