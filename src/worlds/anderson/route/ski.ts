/*
 * Route down Gabelmeister's Peak on a toboggan. Keep the first and last points fixed (see hotel.ts).
 *
 *  -560..-598  the summit plateau at the start hut, under the lid of the box (clear by -586)
 *  -598..-606  through the start gate and over the edge
 *  -606..-702  the bobsled run: a banked curve left, then right, through the snowy firs
 *  -702..-729  the in-run of the ski jump on its wooden trestle; the lip at -729
 *  -729..-772  in the air (a parabola), touching down on the landing hill at -772
 *  -772..-846  the outrun across the open snowfield, a gentle S right and left, to the cliff edge
 *  -846..-880  off the edge and down into the snowdrift (the white cover is full from -870)
 */
export const PTS: [number, number, number][] = [
  [0, 54, -560], [0, 54, -578], [0, 54, -592], [0, 53.5, -603], [-0.8, 51.2, -614], [-4.6, 47.4, -630], [-10.5, 43.6, -647],
  [-13.2, 40.4, -662], [-10.2, 37.3, -677], [-3.2, 34.1, -690], [0, 31.4, -701], [0, 28.6, -712], [0, 26.6, -721], [0, 25.9, -729],
  // the flight: launched slightly downward at the lip, falling on a parabola to the landing hill
  [0, 24.93, -738], [0, 22.32, -750], [0, 18.19, -762], [0, 13.6, -772],
  [0, 10.6, -781], [1.6, 9.3, -792], [7.4, 8.7, -805], [10.2, 8.35, -818], [6.6, 8.1, -830], [1.4, 7.95, -840], [0, 7.9, -846],
  // over the edge and into the drift
  [0, 6.4, -853], [0, 3.0, -860], [0, -0.6, -867], [0, -3.1, -874], [0, -4, -880],
];
/** Speed multiplier keys [z, k]: gentle at the summit and at the cliff, so the cards read; fast down the run. */
export const SPEED: Array<[number, number]> = [
  [-561, 0.7], [-590, 0.62], [-602, 0.72], [-625, 1.15], [-660, 1.4], [-700, 1.5], [-780, 1.45], [-812, 1.1], [-840, 0.78], [-862, 0.68], [-879, 0.8],
];
export const CAPTIONS: Array<[number, string]> = [
  [-591, "Gabelmeister's Peak"],
  [-648, 'The toboggan chase'],
  [-800, 'To the edge of the cliff'],
];
