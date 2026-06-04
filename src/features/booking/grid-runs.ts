/**
 * grid-runs.ts — pure run-edge utility for merged calendar cell visuals.
 *
 * Computes adjacency caps (start/end) for runs of same-group cells along one
 * ordered axis, powering merged selection outlines and booking fill pills.
 */

export interface RunEdge {
  /** True when no same-group member immediately precedes this id in the ordered list. */
  start: boolean;
  /** True when no same-group member immediately follows this id in the ordered list. */
  end: boolean;
}

export type RunAxis = "horizontal" | "vertical";

/**
 * Given cells ordered along one axis, compute run-boundary caps per member.
 * `groupOf` returns the group key of a cell; a falsy return (null or empty
 * string) means the cell is not a member (e.g. an unselected day, or a cell
 * with no booking). Non-members are omitted from the result. Adjacency is by
 * position in `orderedIds` only —
 * the caller controls axis order; this function does NOT sort.
 */
export function runEdges(
  orderedIds: string[],
  groupOf: (id: string) => string | null | undefined,
): Map<string, RunEdge> {
  const result = new Map<string, RunEdge>();

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    const group = groupOf(id);

    if (!group) continue;

    const prevGroup = i > 0 ? groupOf(orderedIds[i - 1]) : null;
    const nextGroup =
      i < orderedIds.length - 1 ? groupOf(orderedIds[i + 1]) : null;

    result.set(id, {
      start: prevGroup !== group,
      end: nextGroup !== group,
    });
  }

  return result;
}

/**
 * Rounded-corner classes for a merged FILL (e.g. booking blue pill).
 * Outer corners of a run are rounded; interior edges are square.
 */
export function runFillRounding(edge: RunEdge, axis: RunAxis): string {
  const classes: string[] = [];

  if (axis === "horizontal") {
    if (edge.start) classes.push("rounded-l-md");
    if (edge.end) classes.push("rounded-r-md");
  } else {
    if (edge.start) classes.push("rounded-t-md");
    if (edge.end) classes.push("rounded-b-md");
  }

  return classes.join(" ");
}

/**
 * Rounded-corner + side-border classes for a merged OUTLINE (e.g. selection
 * ring). The run draws a continuous border: caps get the end border + rounding;
 * interior shared edges are border-less so adjacent cells merge visually.
 *
 * Color is the component's responsibility — only structural border-side +
 * rounding utilities are emitted here.
 */
export function runOutlineClasses(edge: RunEdge, axis: RunAxis): string {
  const classes: string[] = [];

  if (axis === "horizontal") {
    // Always draw top and bottom
    classes.push("border-t", "border-b");
    if (edge.start) {
      classes.push("border-l", "rounded-l-md");
    }
    if (edge.end) {
      classes.push("border-r", "rounded-r-md");
    }
  } else {
    // Always draw left and right
    classes.push("border-l", "border-r");
    if (edge.start) {
      classes.push("border-t", "rounded-t-md");
    }
    if (edge.end) {
      classes.push("border-b", "rounded-b-md");
    }
  }

  return classes.join(" ");
}
