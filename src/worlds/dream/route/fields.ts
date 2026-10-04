/*
 * Route over the fields. Keep the first and last points fixed (see garden.ts).
 *
 * A dive from the treetop, through a deck of cloud, down onto the power lines; then along the top wire over
 * the rice fields. The Catbus lands on the corner pole at z -348, where a line from the left joins the road.
 * The wire sags between poles (poles every 32 units from z -364 to -588 at y 10, the middle of each span at
 * y 9.2), so the path dips and rises with it. Each mid-span point sits halfway between its two poles in x,
 * so every span is almost straight seen from above. At the forest edge the Catbus jumps down off the last
 * pole onto a grassy bank.
 */
export const PTS: [number, number, number][] = [
  [0, 64, -230], [0, 56, -246], [0, 46, -262], [1, 35, -280], [2, 25, -298], [2, 16.5, -316], [1, 11.5, -332], [0, 10, -348],
  // along the wire: poles at z -364, -396, ..., -588
  [-1, 10, -364], [-1.5, 9.2, -380], [-2, 10, -396], [-1, 9.2, -412], [0, 10, -428], [1.5, 9.2, -444], [3, 10, -460], [3, 9.2, -476],
  [3, 10, -492], [1.5, 9.2, -508], [0, 10, -524], [-1.25, 9.2, -540], [-2.5, 10, -556], [-2.75, 9.2, -572], [-3, 10, -588],
  // down off the last pole onto the bank at the edge of the wood
  [-3, 8.5, -600], [-3, 5.5, -610],
];

// fast in the dive; a little slower on the wire, so there is time to look round at Totoro and the fields
export const SPEED: Array<[number, number]> = [
  [-230, 1.15], [-262, 1.3], [-340, 1.25], [-372, 1.1], [-570, 1.1], [-600, 0.95],
];
