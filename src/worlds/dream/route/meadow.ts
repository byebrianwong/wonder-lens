/*
 * Route through Howl's meadow. Keep the first and last points fixed (see garden.ts).
 *
 * Down out of the cloud onto the flower meadow (ground at y 0), across the mirror lake (water at y 0),
 * up the castle's front ramp and in at its door (threshold at y 6, z -1762), across the room inside, to
 * the inner door at z -1792. The bathhouse scene is on the far side of that door.
 */
export const PTS: [number, number, number][] = [
  [0, 16, -1510], [0, 10, -1522], [0, 5, -1536], [0, 1.5, -1552], [0.5, 0.25, -1566], [2, 0.3, -1585], [4, 0.3, -1608], [2, 0.25, -1630],
  [0, 0.15, -1650], [-3, 0.15, -1678], [0, 0.15, -1704], [2, 0.3, -1724], [1, 0.6, -1740], [0, 3, -1752], [0, 6, -1762],
  // inside the castle
  [0, 6, -1772], [0, 6, -1782], [0, 6, -1792],
];

export const SPEED: Array<[number, number]> = [
  [-1510, 0.9], [-1560, 0.85], [-1640, 1.05], [-1715, 0.9], [-1745, 0.55], [-1760, 0.45], [-1792, 0.45],
];
