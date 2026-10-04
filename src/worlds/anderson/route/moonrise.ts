/*
 * Route across New Penzance (Moonrise Kingdom). Keep the first and last points fixed (see hotel.ts).
 *
 * Straight down the middle of Summer's End (the house parts to let the train through), a swing round the
 * lighthouse on the point, straight through Camp Ivanhoe, a gentle bend along the cove at Mile 3.25, and
 * straight across the flooded meadow towards St. Jack's. The scenery in ../moonrise/plan.ts fits these points.
 */
export const PTS: [number, number, number][] = [
  [0, 2, -1180], [0, 2, -1200], [0, 2, -1222], [0, 2, -1240],
  // round the lighthouse
  [-2, 2, -1254], [-6, 2, -1268], [-6.2, 2, -1280], [-2.2, 2, -1294], [0, 2, -1308],
  // Camp Ivanhoe
  [0, 2, -1326], [0, 2, -1344],
  // along the cove
  [1.2, 2, -1362], [2, 2, -1380], [1.2, 2, -1398], [0, 2, -1414],
  // the flood
  [0, 2, -1440], [0, 2, -1466], [0, 2, -1500],
];
export const SPEED: Array<[number, number]> = [
  [-1180, 0.85], [-1192, 0.62], [-1212, 0.5], [-1248, 0.55], [-1272, 0.62], [-1300, 0.6], [-1348, 0.58], [-1372, 0.5], [-1396, 0.58],
  [-1440, 0.72], [-1474, 0.68], [-1500, 0.85],
];
export const CAPTIONS: Array<[number, string]> = [
  [-1195, "Summer's End, New Penzance, 1965"],
  [-1362, 'Mile 3.25 Tidal Inlet'],
  [-1442, "The storm, St. Jack's Church"],
];
