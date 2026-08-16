/**
 * The mind map's alignment grid. Shared between the client canvas (drag-snap)
 * and the server (new-node placement) so a node created via the API and a
 * node dropped by the user always land on the same lattice — one can't be
 * aligned and the other not.
 */
export const MAP_GRID_X = 220;
export const MAP_GRID_Y = 130;

export function snapToGrid(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(x / MAP_GRID_X) * MAP_GRID_X,
    y: Math.round(y / MAP_GRID_Y) * MAP_GRID_Y,
  };
}
