import fs from 'fs';
import { parse } from 'csv-parse';
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { Beneficiary } from "../types/beneficiary";
import path from "path";
import { parseUnits } from 'viem';

type Allocation = (`0x${string}` | Beneficiary | bigint)[];

export const getMerkleTree = (values: Allocation[]) => {
  const tree = StandardMerkleTree.of(values, ["address", "uint256", "uint256"]);

  return tree;
};

export const getMerkleProof = (
  tree: StandardMerkleTree<Allocation>,
  address: `0x${string}`,
  beneficiary: Beneficiary,
) => {
  for (const [i, value] of tree.entries()) {
    if (value[0] === address && value[1] === beneficiary) {
      const proof = tree.getProof(i);
      return proof as `0x${string}`[];
    }
  }
  throw new Error("Address not found in tree");
};


export const parseCSVToAllocationArray = (filePath: string): Promise<Allocation[]> => {
  return new Promise((resolve, reject) => {
    const allocations: Allocation[] = [];
    const parser = parse({
      delimiter: ';',
      columns: true,
      skip_empty_lines: true
    });

    parser.on('readable', function() {
      let record;
      while ((record = parser.read()) !== null) {
        try {
          const beneficiaryType = Beneficiary[record['Beneficiary type'] as keyof typeof Beneficiary];
          if (beneficiaryType === undefined) {
            throw new Error(`Invalid Beneficiary type: ${record['Beneficiary type']}`);
          }

          const address = record['Address'];
          if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            throw new Error(`Invalid Address format: ${address}`);
          }

          const totalAmountInWei = parseUnits(record['Total Amount'].replace(',', '.'), 18);

          allocations.push([address, beneficiaryType, totalAmountInWei]);
        } catch (error) {
          console.error(`Error processing record: ${JSON.stringify(record)} - ${error.message}`);
        }
      }
    });

    parser.on('error', function(err) {
      reject(err);
    });

    parser.on('end', function() {
      resolve(allocations);
    });

    fs.createReadStream(path.resolve(__dirname, filePath)).pipe(parser);
  });
};