import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { Beneficiary } from "../types/beneficiary";

type Allocation = (`0x${string}` | Beneficiary | bigint)[];

export const getMerkleTree = (values: Allocation[]) => {
  const tree = StandardMerkleTree.of(values, ["address", "uint256", "uint256"]);

  return tree;
};

export const getMerkleProof = (
  tree: StandardMerkleTree<Allocation>,
  address: `0x${string}`,
) => {
  for (const [i, value] of tree.entries()) {
    if (value[0] === address) {
      const proof = tree.getProof(i);
      return proof as `0x${string}`[];
    }
  }
  throw new Error("Address not found in tree");
};
