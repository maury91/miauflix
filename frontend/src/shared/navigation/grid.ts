/** Where an item sits in a Grid: its row, its first column and how many columns it spans. */
export interface GridCell {
  row: number;
  column: number;
  span: number;
}

/**
 * The cells of items placed in order, as CSS grid places them (row by row, no dense packing): an
 * item that does not fit in what is left of a row starts the next one. Spans are clamped to the
 * columns, as the Grid's CSS has no other tracks to give them.
 */
export function gridLayout(spans: readonly number[], columns: number): GridCell[] {
  const width = Math.max(1, Math.floor(columns));
  const cells: GridCell[] = [];
  let row = 0;
  let column = 0;
  for (const requested of spans) {
    const span = Math.min(width, Math.max(1, Math.floor(requested)));
    if (column + span > width) {
      row += 1;
      column = 0;
    }
    cells.push({ row, column, span });
    column += span;
    if (column === width) {
      row += 1;
      column = 0;
    }
  }
  return cells;
}

export type GridDirection = 'up' | 'down' | 'left' | 'right';

export interface StepGridOptions {
  /** Right-to-left text: Left moves to the next item. */
  rtl?: boolean;
  /**
   * The column to stay aligned with when moving between rows, remembered by the caller across
   * moves (a spanning key would otherwise pull the alignment to its start). Defaults to the
   * current item's first column.
   */
  column?: number;
}

/**
 * The item a direction moves to, or `null` at an edge (the group exits; grids never wrap).
 * Left/Right move to the previous or next item in the same row. Up/Down move to the item in the
 * next row covering the aligned column, or the nearest one when that row is short.
 */
export function stepGrid(
  cells: readonly GridCell[],
  index: number,
  direction: GridDirection,
  { rtl = false, column }: StepGridOptions = {}
): number | null {
  const from = cells[index];
  if (!from) return null;

  if (direction === 'left' || direction === 'right') {
    const next = index + ((direction === 'right') !== rtl ? 1 : -1);
    return cells[next]?.row === from.row ? next : null;
  }

  const row = from.row + (direction === 'down' ? 1 : -1);
  const aligned = column ?? from.column;
  let best: number | null = null;
  let bestDistance = Infinity;
  cells.forEach((cell, candidate) => {
    if (cell.row !== row) return;
    const end = cell.column + cell.span - 1;
    const distance =
      aligned < cell.column ? cell.column - aligned : aligned > end ? aligned - end : 0;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });
  return best;
}
