import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { AstNode } from "../../languages/c/astTypes";

const DEFAULT_EXPANDED_DEPTH = 2;

interface AstTreeNodeProps {
  node: AstNode;
  depth: number;
}

/**
 * Decodes literal unicode escape sequences (e.g. `\u201C`, `\u201D`, `\u00A9`)
 * into their corresponding Unicode characters for display.
 */
export function decodeUnicodeEscapes(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

/** One row in the AST tree, plus (recursively) its children. Kept as its
 * own component rather than inlined so each subtree owns its own
 * expand/collapse state — expanding a deep node doesn't rerender its
 * siblings. */
export function AstTreeNode({ node, depth }: AstTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < DEFAULT_EXPANDED_DEPTH);
  const hasChildren = node.children.length > 0;
  const isProblem = node.isError || node.isMissing;
  const displayText = node.text !== undefined ? decodeUnicodeEscapes(node.text) : undefined;

  return (
    <div>
      <div
        className={`flex cursor-default items-start gap-1 rounded px-1 py-0.5 text-sm hover:bg-surface-raised ${
          isProblem ? "text-danger" : "text-fg"
        }`}
        style={{ paddingLeft: depth * 14 }}
        onClick={() => hasChildren && setExpanded((value) => !value)}
        role={hasChildren ? "button" : undefined}
      >
        <span className="mt-0.5 flex w-3.5 shrink-0 justify-center text-fg-muted">
          {hasChildren ? (
            <ChevronRight size={12} className={expanded ? "rotate-90 transition-transform" : "transition-transform"} />
          ) : null}
        </span>

        <span className="min-w-0 break-words font-mono">
          {node.fieldName && <span className="text-fg-muted">{node.fieldName}: </span>}
          <span className={isProblem ? "font-semibold" : ""}>{node.type}</span>
          {displayText !== undefined && (
            <span className="text-fg-muted">
              {" “"}
              {displayText}
              {"”"}
            </span>
          )}
        </span>

        <span className="ml-auto shrink-0 whitespace-nowrap pl-2 font-mono text-xs text-fg-muted">
          {node.startPosition.row + 1}:{node.startPosition.column + 1}
        </span>
      </div>

      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <AstTreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
