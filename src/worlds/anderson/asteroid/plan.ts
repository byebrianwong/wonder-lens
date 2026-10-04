/*
 * Where everything stands in Asteroid City, in world units. The path runs straight down x = 0 at y = 2 from
 * z -1500 to -1800 (route/asteroid.ts). The scene is a play on a giant stage:
 *
 *  z -1486 .. -1566  the house of the theatre, in black and white like the film's television frame story:
 *                    raked rows of seats full of audience, opera boxes, a chandelier; the train runs down a
 *                    raised runway (a thrust stage) through the audience towards the proscenium
 *  z -1566           the proscenium: a gold arch with the masks of comedy and tragedy, the red house curtain
 *                    drawn open
 *  z -1566 .. -1850  the stage: the desert town, life size, on a painted floor cloth; the mesas are painted
 *                    flats braced from behind, the sky a painted cyclorama, the sun a stage lantern
 *  z -1700 .. -1722  the lighting cue: the stage goes to night for the stargazing
 *  z -1822           the crater, straight ahead at the end of the line; the UFO comes down over it
 */

export const PATH_Y = 2;
/** the stage floor (the top of the track bed's shoulders) */
export const STAGE_Y = 1.5;
/** the floor of the house, under the seats */
export const HOUSE_Y = 0.3;

export const HOUSE = { z0: -1486, z1: -1566, half: 40, ceil: 40, runway: 4.2 };
/** the proscenium arch: the opening and the gold frame round it */
export const ARCH = { z: -1566, half: 26, top: 28.5, frameHalf: 33, frameTop: 36, apron: -1561 };
/** the stage house: side walls (the cyclorama) at +-SIDE, the grid overhead, the cyclorama's round end */
export const STAGE = { z0: -1566, half: 120, grid: 64, cycZ: -1730, cycR: 120, back: -1850 };
/** the floor cloth painted as desert sand (bare stage boards beyond it) */
export const CLOTH = { half: 76, z0: -1570, z1: -1846 };

export const TRACK = { runwayEnd: -1574, bedStart: -1572, buffer: -1799.5 };
export const ROAD = { x: -14, half: 3.6, z0: -1572, z1: -1792 };

export const SIGN = { x: 10.5, z: -1583 };
export const VENDING = { x: 6.6, z: -1616 };
export const MOTEL = { x: 21, z0: -1600, step: 13, n: 5, office: -1592 };
export const GAS = { x: -27, z: -1606 };
export const BOOTH = { x: -19.6, z: -1624 };
export const DINER = { x: -30, z: -1646, len: 18, depth: 10 };
export const COWBOYS = { x: 11.5, z: -1672 };
export const OVERPASS = { z: -1690, deck: 10.5, x0: 86, end: -25, half: 4.4 };
export const PODIUM = { x: -25, z: -1724 };
export const OBSERVATORY = { x: 36, z: -1758, dish: [27, -1782] as [number, number] };
export const CRATER = { x: 0, z: -1818, r: 13, rim: 2.2 };
export const AUGIE = { x: -6, z: -1801, dayX: -17.6, dayZ: -1612 };
export const STARGAZERS = { x: 7, z: -1803.5 };

/** The crater's ring of sand: [distance from the centre beyond the rim, height] from the foot to the crest, and inside. */
export const BERM: Array<[number, number]> = [[8, 0], [5, 0.5], [2, 1.6], [0, 2.2], [-1.5, 2.05], [-4, 0.9], [-7, 0.12], [-8, 0.02]];
/** Height of the stage floor at (x, z), counting the crater's ring of sand. */
export function bermY(x: number, z: number) {
  const d = Math.hypot(x - CRATER.x, z - CRATER.z) - CRATER.r;
  if (d >= BERM[0][0] || d <= BERM[BERM.length - 1][0]) return STAGE_Y + (d <= -8 ? 0.05 : 0);
  for (let i = 0; i < BERM.length - 1; i++) {
    const [d0, h0] = BERM[i], [d1, h1] = BERM[i + 1];
    if (d <= d0 && d >= d1) return STAGE_Y + h0 + (h1 - h0) * ((d0 - d) / (d0 - d1));
  }
  return STAGE_Y;
}

/** the lighting cue: day until LIGHTS.a, night from LIGHTS.b */
export const NIGHT = { a: -1698, b: -1718 };

/** Asteroid City's palette: turquoise sky, peach and salmon desert, mint and coral buildings, chrome. */
export const AC = {
  sky: 0x58bccf, skyDeep: 0x2f97b8, skyPale: 0xa8dfe0, haze: 0xf6dcc2,
  peach: 0xf2c6a2, salmon: 0xe89a80, sand: 0xf0cfae, cream: 0xf8ead2, rust: 0xc8735a,
  mint: 0xa6dcc6, coral: 0xf08872, butter: 0xf6dc8a, turquoise: 0x52b8b4, pink: 0xf2b2b8,
  chrome: 0xdfe4e8, dark: 0x2a2c30, white: 0xfbf8f2, red: 0xc8323c, gold: 0xd8b25a,
  nightTop: 0x082a34, nightMid: 0x0f4a50, nightLow: 0x2a6a5a,
};
