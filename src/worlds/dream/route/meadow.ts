/*
 * Route through Howl's meadow. Keep the first and last points fixed (see garden.ts).
 *
 * Down out of the cloud onto the flower meadow (ground at about y 0.5), over a low rise, onto the mirror
 * lake (water at y 0; the Catbus runs on the water at y 0.15), across it, onto the far shore, up the
 * castle's plank tongue (a ramp from the ground at about z -1733 to the door sill at y 6, z -1762), and in at
 * its door. Across the room inside to the inner door at z -1792. The bathhouse scene is on the far side.
 */
export const PTS: [number, number, number][] = [
  [0, 16, -1510], [0, 10.5, -1522], [0, 5.6, -1535], [0.5, 2.4, -1549], [1.5, 0.75, -1563],
  [3, 0.5, -1582], [4, 0.9, -1602], [2.5, 0.6, -1622], [0.8, 0.15, -1644],
  [-2.5, 0.15, -1668], [-2, 0.15, -1692], [0.5, 0.3, -1714], [0, 0.3, -1726],
  // up the castle's tongue to the door (eased at both ends, so the path does not dip or overshoot)
  [0, 0.4, -1735], [0, 2.3, -1744], [0, 5.0, -1753], [0, 6, -1762],
  // inside the castle
  [0, 6, -1772], [0, 6, -1782], [0, 6, -1792],
];

export const SPEED: Array<[number, number]> = [
  [-1510, 0.9], [-1560, 0.85], [-1640, 1.05], [-1712, 0.95], [-1738, 0.6], [-1758, 0.45], [-1776, 0.42], [-1792, 0.45],
];
