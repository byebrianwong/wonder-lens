/*
 * Route over the fields. Keep the first and last points fixed (see garden.ts).
 *
 * A dive from the treetop down onto the power lines, then along the top wire over the rice fields.
 * The wire sags between poles (poles every 32 units at y 10, the middle of each span at about y 9.2),
 * so the path dips and rises with it. At the forest edge the Catbus jumps down to the forest floor.
 */
export const PTS: [number, number, number][] = [
  [0, 64, -230], [0, 56, -246], [0, 46, -262], [1, 35, -280], [2, 25, -298], [2, 16.5, -316], [1, 11.5, -332], [0, 10, -348],
  // along the wire: poles at z -364, -396, ..., -588
  [-1, 10, -364], [-1.5, 9.2, -380], [-2, 10, -396], [-1.5, 9.2, -412], [0, 10, -428], [1.5, 9.2, -444], [3, 10, -460], [3.5, 9.2, -476],
  [3, 10, -492], [2, 9.2, -508], [0, 10, -524], [-1.5, 9.2, -540], [-2.5, 10, -556], [-3, 9.2, -572], [-3, 10, -588],
  // down off the last pole into the forest
  [-3, 8.5, -600], [-3, 5.5, -610],
];

export const SPEED: Array<[number, number]> = [
  [-230, 1.15], [-262, 1.3], [-340, 1.3], [-570, 1.3], [-600, 0.95],
];
