/*
 * Where the parts of Mendl's sit. Everything is at giant scale: the rider rides in a pastry box, so people
 * are about eight times life size (a baker stands 14 units tall) and the conveyor runs at counter height,
 * 8 units above the kitchen floor. The kitchen and the shop are symmetrical about x = 0, where the belt runs.
 *
 *  z -297  the back wall of the kitchen, with the box-folding machine the belt comes out of
 *  z -313  the whip pan clears: the icing hall (mixers, cream rivers, piping bags, the Courtesan lines)
 *  z -398  the ovens, in banks on both walls, with Herr Mendl at the right-hand bank
 *  z -445  the arch into the octagonal rotunda and the tower of Courtesans (the belt bends left round it)
 *  z -501  the hatch into the shop: display cakes, the ribbon-tying machine, Zero by the door
 *  z -549  Agatha's packing table under the storefront window; the lid closes (black from -552)
 */

/** Heights: the belt (the path), the kitchen floor, the hall's ceiling. */
export const Y = { belt: 54, floor: 46, hallTop: 96 };

/** Life size to set size. */
export const GIANT = 8;

/** The kitchen hall: from its back wall to the wall with the arch into the rotunda. */
export const HALL = { back: -297, front: -445, halfW: 34 };

/** The icing hall and the ovens inside it. */
export const ICING = { z0: -306, z1: -396 };
export const OVENS = { z0: -398, z1: -440, x: 30 };

/** Side conveyors carrying Courtesans, either side of the belt. */
export const SIDE = { x: 13, z0: -300, z1: -440 };

/** The octagonal rotunda round the tower; `a` is the apothem (centre to the middle of a wall). */
export const ROT = { z: -473, a: 28, wallTop: 90, domeTop: 124, oculus: 7 };

/** The tower of Courtesans on its turntable, at the rotunda's centre. */
export const TOWER = { x: 0, z: -473, standTop: 56, baseR: 8.4, rings: 10 };

/** The shop, between the hatch in its back wall and the storefront. */
export const SHOP = { back: -501, front: -557, halfW: 30, top: 86 };

/** The storefront window, seen from inside (its glass is at SHOP.front). */
export const WINDOW = { halfW: 17, y0: 52, y1: 82 };

/** Agatha's packing table at the end of the belt, and where she stands behind it. */
export const PACK = { z: -549.5, agathaZ: -553.4 };

/** The ribbon-tying machine on the right side of the shop. */
export const RIBBON = { x: 17, z: -527 };

/** Herr Mendl at the right-hand ovens; Zero by the shop's door on the left. */
export const MENDL = { x: 17.5, z: -417 };
export const ZERO = { x: -16, z: -538 };
