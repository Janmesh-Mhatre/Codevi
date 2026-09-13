# Changelog

## Phase 0

-   Architecture planned.

## Phase 1

-   Project foundation completed.
-   Monaco Editor integrated.
-   UI skeleton completed.
-   Caret and bracket improvements.

## Phase 2

-   Tree-sitter integration.
-   AST generation.
-   Syntax diagnostics.
-   AST viewer.

## Phase 3

-   In-browser C interpreter.
-   Run / Step / Pause / Reset execution controls.
-   Variable scope and memory model foundation.

## Phase 4 & 4.1

-   Call stack and active frame visualization.
-   Variables and Memory panels.
-   Standard I/O support (`printf`, `scanf`, `getchar`, `putchar`, `puts`).

## Phase 5

-   Pointers & dynamic memory allocation (`malloc`, `calloc`, `realloc`, `free`).
-   Simulated address space (`S001`, `H001`).
-   Pointer-to-pointer, NULL, `sizeof`, use-after-free/double-free safety checks.

## Phase 6

-   Interactive SVG Pointer View ("what points to what") with directional animated arrows.
-   Outward curved stack-to-stack connector routing.
-   Pointer variable locations displayed through `printf("%p")` and UI badges (`@S001`, `@S002`).
-   Array initialization slot extraction, element address-of (`&arr[i]`), and pointer arithmetic.
-   Pointer difference subtraction (`q - p`) with `%ld`.
-   9-theme design system selector with Monaco Editor synchronization.
-   206 automated unit tests passing across 17 test suites.

Continue updating this file after every completed phase.
