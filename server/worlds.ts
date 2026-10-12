/*
 * What a fair run can score in each world, so the server can turn away impossible scores.
 * `subjects` is the number of subjects in the world's field guide. `maxScore` is about twice the
 * highest album score the scoring code allows (every subject at its best pose, filling the frame,
 * centred and facing the camera), so small tuning changes don't lock players out.
 *
 * Update both when a world's subjects change. To measure them, start a ride in the dev server and
 * run this in the console, then double the result:
 *   __dbg.game.world.subjects.reduce((t, s) => t + s.base * 1.1375 * 1.2 *
 *     Math.max(1, ...Object.values(s.poses).map((p) => p.mult)), 0)
 * Measured 2026-10-12: dream 40 subjects / 86,923; anderson 83 / 161,241; amelie 32 / 54,088.
 */
export const WORLD_LIMITS: Record<string, { subjects: number; maxScore: number }> = {
  dream: { subjects: 40, maxScore: 175_000 },
  anderson: { subjects: 83, maxScore: 325_000 },
  amelie: { subjects: 32, maxScore: 110_000 },
};
