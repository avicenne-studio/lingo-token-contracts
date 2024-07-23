import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import {BeneficiaryType} from "../types/beneficiary-type";


export const getMerkleTree = (values: (`0x${string}` | BeneficiaryType)[][]) => {
    const tree = StandardMerkleTree.of(values, ["address", "uint256"]);

    return tree;
}


export const getMerkleProof = (tree: StandardMerkleTree<(`0x${string}` | BeneficiaryType)[]>, address: `0x${string}`) => {
    for (const [i, value] of tree.entries()) {
        if (value[0] === address) {
            const proof = tree.getProof(i);
            return proof as `0x${string}`[];
        }
    }
    throw new Error('Address not found in tree');
}
