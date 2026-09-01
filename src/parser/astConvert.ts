import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type { AstNode, SyntaxDiagnostic } from "./astTypes";

const MAX_LEAF_TEXT_LENGTH = 120;

/**
 * Converts a live web-tree-sitter node into the plain AstNode shape.
 *
 * Deliberately keeps only *named* children (see AstNode's doc comment
 * in astTypes.ts) — anonymous nodes are individual punctuation/keyword
 * tokens (`;`, `{`, `int`, ...) that add volume without adding meaning
 * for anything this app does with the tree. Nothing here throws away
 * information permanently: diagnostics (below) walk the full,
 * unfiltered tree specifically because a missing `;` is itself an
 * anonymous token.
 */
export function convertToAstNode(node: SyntaxNode, fieldName: string | null = null): AstNode {
  const namedChildren = node.namedChildren.filter((child): child is SyntaxNode => child !== null);

  return {
    id: node.id,
    type: node.type,
    fieldName,
    isNamed: node.isNamed,
    isError: node.isError,
    isMissing: node.isMissing,
    startPosition: { row: node.startPosition.row, column: node.startPosition.column },
    endPosition: { row: node.endPosition.row, column: node.endPosition.column },
    text: namedChildren.length === 0 ? node.text.slice(0, MAX_LEAF_TEXT_LENGTH) : undefined,
    children: namedChildren.map((child, index) => convertToAstNode(child, node.fieldNameForNamedChild(index))),
  };
}

/**
 * Walks the *entire* tree (including anonymous tokens) looking for
 * ERROR nodes (spans the parser couldn't make sense of at all) and
 * MISSING nodes (tokens the parser inferred were left out, e.g. a `;`).
 * Iterative on purpose — student code is small, but there's no reason
 * to risk a deep recursion for a tree walk this mechanical.
 */
export function collectDiagnostics(tree: Tree): SyntaxDiagnostic[] {
  const diagnostics: SyntaxDiagnostic[] = [];
  const stack: SyntaxNode[] = [tree.rootNode];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (node.isMissing) {
      diagnostics.push({
        id: `missing-${node.id}`,
        message: `Missing "${node.type}"`,
        startPosition: { row: node.startPosition.row, column: node.startPosition.column },
        endPosition: { row: node.endPosition.row, column: node.endPosition.column },
      });
    } else if (node.isError) {
      const snippet = node.text.trim().slice(0, 30);
      diagnostics.push({
        id: `error-${node.id}`,
        message: snippet ? `Unexpected syntax near "${snippet}"` : "Unexpected syntax",
        startPosition: { row: node.startPosition.row, column: node.startPosition.column },
        endPosition: { row: node.endPosition.row, column: node.endPosition.column },
      });
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) stack.push(child);
    }
  }

  // Tree-sitter visits in an arbitrary (stack) order; diagnostics read
  // better top-to-bottom, left-to-right like the source itself.
  diagnostics.sort((a, b) => {
    if (a.startPosition.row !== b.startPosition.row) return a.startPosition.row - b.startPosition.row;
    return a.startPosition.column - b.startPosition.column;
  });

  return diagnostics;
}

/** Total node count (all nodes, not just named) — shown in the AST
 * panel's status line so "incremental parsing" is a visible, checkable
 * claim rather than an invisible implementation detail. */
export function countAllNodes(tree: Tree): number {
  let count = 0;
  const stack: SyntaxNode[] = [tree.rootNode];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    count++;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) stack.push(child);
    }
  }
  return count;
}
