import { afterEach, describe, expect, it } from "vitest";
import { cleanupParsedTrees, parseC, run, runCollectingSteps } from "../helpers/interpreterTestHelpers";
import { InterpreterError } from "../../../src/interpreter/types";
import { extractStructureGraph } from "../../../src/visualization/detectors/structureDetector";
import { layoutArrayStructures } from "../../../src/visualization/layout/arrayLayout";
import { ExecutionEngine } from "../../../src/execution/engine/ExecutionEngine";

afterEach(cleanupParsedTrees);

describe("Phase 6: 2-Dimensional Arrays", () => {
  it("executes the user's exact 2D array matrix initialization snippet", async () => {
    const root = await parseC(`
      #include <stdio.h>

      int main() {
          int matrix[2][3] = {
              {1, 2, 3},
              {4, 5, 6}
          };

          return 0;
      }
    `);
    const { history, error, result } = runCollectingSteps(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 0 });

    // Verify matrix in variables
    const stepWithMatrix = history.find((s) => "matrix" in s.variables);
    expect(stepWithMatrix).toBeDefined();
    const matrixVal = stepWithMatrix!.variables.matrix;
    expect(matrixVal.kind).toBe("array");
    if (matrixVal.kind === "array") {
      expect(matrixVal.dimensions).toEqual([2, 3]);
      expect(matrixVal.length).toBe(6);
      const slotValues = stepWithMatrix!.memory.stackArraySlotValues(matrixVal.baseAddress);
      expect(slotValues).toEqual([
        { kind: "scalar", type: "int", value: 1 },
        { kind: "scalar", type: "int", value: 2 },
        { kind: "scalar", type: "int", value: 3 },
        { kind: "scalar", type: "int", value: 4 },
        { kind: "scalar", type: "int", value: 5 },
        { kind: "scalar", type: "int", value: 6 },
      ]);
    }
  });

  it("reads back individual elements of 2D matrix (matrix[r][c])", async () => {
    const root = await parseC(`
      int main() {
          int matrix[2][3] = {
              {10, 20, 30},
              {40, 50, 60}
          };

          int a = matrix[0][0];
          int b = matrix[0][2];
          int c = matrix[1][1];
          int d = matrix[1][2];

          return a + b + c + d;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    // 10 + 30 + 50 + 60 = 150
    expect(result).toEqual({ kind: "scalar", type: "int", value: 150 });
  });

  it("uninitialized 5x5 array (int arr[5][5]) is zero-filled", async () => {
    const root = await parseC(`
      int main() {
          int arr[5][5];
          int sum = 0;
          sum += arr[0][0];
          sum += arr[4][4];
          return sum;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 0 });
  });

  it("modifies 2D array elements via subscript assignment (matrix[r][c] = val)", async () => {
    const root = await parseC(`
      int main() {
          int matrix[2][3] = {
              {1, 2, 3},
              {4, 5, 6}
          };

          matrix[1][2] = 42;
          matrix[0][1] = 99;

          return matrix[1][2] + matrix[0][1];
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 141 });
  });

  it("allows row pointer decay (int *row = matrix[1]; row[2])", async () => {
    const root = await parseC(`
      int main() {
          int matrix[2][3] = {
              {1, 2, 3},
              {4, 5, 6}
          };

          int *row = matrix[1];
          return *(row + 2);
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 6 });
  });

  it("supports partial initializers in 2D array", async () => {
    const root = await parseC(`
      int main() {
          int matrix[2][3] = {
              {1},
              {4, 5}
          };

          return matrix[0][0] + matrix[0][1] + matrix[1][1] + matrix[1][2];
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    // 1 + 0 + 5 + 0 = 6
    expect(result).toEqual({ kind: "scalar", type: "int", value: 6 });
  });

  it("calculates sizeof on 2D arrays correctly", async () => {
    const root = await parseC(`
      int main() {
          int matrix[2][3] = {
              {1, 2, 3},
              {4, 5, 6}
          };

          int totalBytes = sizeof(matrix);
          int rowBytes = sizeof(matrix[0]);
          int elemBytes = sizeof(matrix[0][0]);

          return totalBytes + rowBytes + elemBytes;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    // sizeof(int) is 4 in Codevi
    // totalBytes = 2 * 3 * 4 = 24
    // rowBytes = 3 * 4 = 12
    // elemBytes = 4
    // 24 + 12 + 4 = 40
    expect(result).toEqual({ kind: "scalar", type: "int", value: 40 });
  });

  it("checks out-of-bounds row index", async () => {
    const root = await parseC(`
      int main() {
          int matrix[2][3] = {
              {1, 2, 3},
              {4, 5, 6}
          };

          return matrix[3][0];
      }
    `);
    const { error } = run(root);
    expect(error).toBeInstanceOf(InterpreterError);
    expect(error?.message).toMatch(/outside the bounds|bounds/i);
  });

  it("checks out-of-bounds column index", async () => {
    const root = await parseC(`
      int main() {
          int matrix[2][3] = {
              {1, 2, 3},
              {4, 5, 6}
          };

          return matrix[0][5];
      }
    `);
    const { error } = run(root);
    expect(error).toBeInstanceOf(InterpreterError);
    expect(error?.message).toMatch(/outside the bounds|bounds/i);
  });

  it("supports nested loops iterating over 2D array", async () => {
    const root = await parseC(`
      int main() {
          int grid[3][3];
          int counter = 1;

          for (int i = 0; i < 3; i++) {
              for (int j = 0; j < 3; j++) {
                  grid[i][j] = counter++;
              }
          }

          int sum = 0;
          for (int i = 0; i < 3; i++) {
              sum += grid[i][i]; // diagonal sum: 1 + 5 + 9 = 15
          }

          return sum;
      }
    `);
    const { result, error } = run(root);
    expect(error).toBeUndefined();
    expect(result).toEqual({ kind: "scalar", type: "int", value: 15 });
  });

  it("visualizes 2D array structure with rows, cols, [r][c] slot names, and grid layout", () => {
    const mockStep: any = {
      line: 1,
      column: 0,
      endLine: 1,
      endColumn: 10,
      astNodeType: "expression_statement",
      functionName: "main",
      callDepth: 1,
      description: "test step",
      variables: {},
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 5,
          parameters: {},
          locals: {
            matrix: {
              kind: "array",
              type: "int[2][3]",
              address: { space: "stack", id: 1, slot: 0 },
              length: 6,
              dimensions: [2, 3],
              values: [1, 2, 3, 4, 5, 6].map((v) => ({ kind: "scalar", type: "int", value: v })),
            },
          },
          addresses: { matrix: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
      heap: [],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
      stepAccesses: [],
    };

    const graph = extractStructureGraph(mockStep);
    const arrayItem = graph.structures.find((item) => item.id === "array:matrix");
    expect(arrayItem).toBeDefined();

    const matrixNode = arrayItem!.nodes[0];
    expect(matrixNode.label).toBe("matrix");
    expect(matrixNode.metadata?.rows).toBe(2);
    expect(matrixNode.metadata?.cols).toBe(3);
    expect(matrixNode.slots.length).toBe(6);

    // Verify [r][c] slot names
    expect(matrixNode.slots[0].name).toBe("[0][0]");
    expect(matrixNode.slots[1].name).toBe("[0][1]");
    expect(matrixNode.slots[2].name).toBe("[0][2]");
    expect(matrixNode.slots[3].name).toBe("[1][0]");
    expect(matrixNode.slots[4].name).toBe("[1][1]");
    expect(matrixNode.slots[5].name).toBe("[1][2]");

    // Verify grid layout computes 2D card bounds
    const layout = layoutArrayStructures([matrixNode]);
    expect(layout.placedNodes.length).toBe(1);
    const placed = layout.placedNodes[0];
    // Height accommodates 2 rows of slots
    expect(placed.h).toBeGreaterThan(100);
    // Width accommodates 3 columns of slots
    expect(placed.w).toBeGreaterThan(160);
  });
});
