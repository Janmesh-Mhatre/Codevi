import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { AstNode } from "../../parser/astTypes";

const DEFAULT_EXPANDED_DEPTH = 2;

/** Makes control characters visible in the AST viewer — without this,
 * a `\n` inside a string_literal leaf node would be swallowed by HTML
 * rendering, making the viewer show `"hello world"` instead of
 * `"hello\nworld"`. Only applied to short leaf-text snippets. */
export function formatNodeText(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\0/g, "\\0");
}

interface AstTreeNodeProps {
  node: AstNode;
  depth: number;
}

/** One row in the AST tree, plus (recursively) its children. Kept as its
 * own component rather than inlined so each subtree owns its own
 * expand/collapse state — expanding a deep node doesn't rerender its
 * siblings. */
export function AstTreeNode({ node, depth }: AstTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < DEFAULT_EXPANDED_DEPTH);
  const hasChildren = node.children.length > 0;
  const isProblem = node.isError || node.isMissing;

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
          {node.text !== undefined && <span className="text-fg-muted"> "{formatNodeText(node.text)}"</span>}
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
