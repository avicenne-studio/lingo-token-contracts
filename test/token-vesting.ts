import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import {expect} from "chai";
import hre from "hardhat";
import {getAddress} from "viem";
import {getAllocations} from "../utils/get-allocations";
import {getMerkleProof, getMerkleTree} from "../utils/merkle-tree";
import {Beneficiary} from "../types/beneficiary";

describe("TokenVesting", function () {
        // We define a fixture to reuse the same setup in every test.
        // We use loadFixture to run this setup once, snapshot that state,
        // and reset Hardhat Network to that snapshot in every test.
        async function deployFixture() {
            const INITIAL_SUPPLY = BigInt(1_000n);
            const TOTAL_SUPPLY = BigInt(1_000_000_000n * (10n ** 18n));
            const FEES = BigInt(500n);

            // Contracts are deployed using the first signer/account by default
            const [
                owner,
                preSeedUser,
                kolRoundUser,
                privateSaleUser,
                publicSaleUser,
                socialFiAirdropUser,
                strategicPartnersUser,
                ambassadorsUser,
                teamUser,
                treasuryWallet,
            ] = await hre.viem.getWalletClients();


            const lingoToken = await hre.viem.deployContract("LingoToken", [INITIAL_SUPPLY, treasuryWallet.account.address, FEES]);

            const tokenVesting = await hre.viem.deployContract("TokenVesting", [owner.account.address, lingoToken.address, getAllocations(TOTAL_SUPPLY)]);

            const MINTER_ROLE = await lingoToken.read.MINTER_ROLE();

            await lingoToken.write.grantRole([MINTER_ROLE, tokenVesting.address]);

            const publicClient = await hre.viem.getPublicClient();

            return {
                lingoToken,
                tokenVesting,
                TOTAL_SUPPLY,
                owner,
                preSeedUser,
                kolRoundUser,
                privateSaleUser,
                publicSaleUser,
                socialFiAirdropUser,
                strategicPartnersUser,
                ambassadorsUser,
                teamUser,
                publicClient,
            };
        }

        async function deployAndInitializeFixture() {
            const {tokenVesting, ...fixture} = await loadFixture(deployFixture);

            const accounts = [
                fixture.preSeedUser,
                fixture.kolRoundUser,
                fixture.privateSaleUser,
                fixture.publicSaleUser,
                fixture.socialFiAirdropUser,
                fixture.strategicPartnersUser,
                fixture.ambassadorsUser,
                fixture.teamUser,
            ];

            const values = accounts.map((account, i) => [account.account.address, i]);

            const tokenVestingAs = (beneficiary: Beneficiary) => {
                return hre.viem.getContractAt(
                    "TokenVesting",
                    tokenVesting.address,
                    {client: {wallet: accounts[beneficiary]}}
                );
            };

            const tree = getMerkleTree(values);

            const merkleProofs = values.map((user) => getMerkleProof(tree, user[0] as `0x${string}`));

            await tokenVesting.write.setMerkleRoot([tree.root as `0x${string}`]);

            return {tokenVesting, tokenVestingAs, ...fixture, tree, merkleProofs};
        }

        describe("Deployment", function () {
            it("Should set the right Allocations", async function () {
                const {tokenVesting, TOTAL_SUPPLY} = await loadFixture(deployFixture);
                const allocations = getAllocations(TOTAL_SUPPLY);

                for (let i = 0; i < allocations.length; i++) {
                    expect(await tokenVesting.read.vestingSchedules([i])).to.deep.equal(Object.values(allocations[i]));
                }
            });

            it("Should set the right owner", async function () {
                const {tokenVesting, owner} = await loadFixture(deployFixture);

                expect(await tokenVesting.read.owner()).to.equal(
                    getAddress(owner.account.address)
                );
            });
        });

        describe("Merkle Tree", function () {
            it("Should validate the Merkle Proof if the Proof is valid", async function () {
                const {preSeedUser, tree} = await loadFixture(deployAndInitializeFixture);

                const proof = getMerkleProof(tree, preSeedUser.account.address);

                expect(tree.verify([preSeedUser.account.address, Beneficiary.PreSeed], proof)).to.be.true;
            });

            it("Should NOT validate the Merkle Proof if the Proof is valid", async function () {
                const {preSeedUser, tree} = await loadFixture(deployAndInitializeFixture);
                const proof = getMerkleProof(tree, preSeedUser.account.address);

                expect(tree.verify([preSeedUser.account.address, Beneficiary.Ambassadors], proof)).to.be.false;
            });


            it("Should claim token if Merkle Proof is valid", async function () {
                const {tokenVestingAs, lingoToken, preSeedUser, tree} = await loadFixture(deployAndInitializeFixture);
                const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

                const preSeedUserAddress = preSeedUser.account.address;

                const proof = getMerkleProof(tree, preSeedUserAddress);

                await tokenVestingAsPreSeed.write.claimTokens([proof, Beneficiary.PreSeed]);

                const preSeedUserBalance = await lingoToken.read.balanceOf([preSeedUserAddress]);

                expect(preSeedUserBalance).to.equal(10n * 10n ** 18n);
            });
        });

        describe("Events", function () {
            it("Should emit an event on Token Releases", async function () {
                const {tokenVestingAs, tree, preSeedUser, publicClient} = await loadFixture(deployAndInitializeFixture);

                const unlockTime = BigInt(await time.latest()) + 1000n;

                await time.increaseTo(unlockTime);

                const preSeedUserAddress = preSeedUser.account.address;

                const tokenVestingAsPreSeed = await tokenVestingAs(Beneficiary.PreSeed);

                const proof = getMerkleProof(tree, preSeedUserAddress);

                await tokenVestingAsPreSeed.write.claimTokens([proof, Beneficiary.PreSeed]);

                const hash = await tokenVestingAsPreSeed.write.claimTokens([proof, Beneficiary.PreSeed]);
                await publicClient.waitForTransactionReceipt({hash});

                // get the withdrawal events in the latest block
                const withdrawalEvents = await tokenVestingAsPreSeed.getEvents.TokensReleased();

                expect(withdrawalEvents).to.have.lengthOf(1);
                expect(withdrawalEvents[0].args.beneficiary?.toLowerCase()).to.equal(preSeedUserAddress);
                expect(withdrawalEvents[0].args.amount).to.equal(10n * 10n ** 18n);
            });
        });
    }
)
;
