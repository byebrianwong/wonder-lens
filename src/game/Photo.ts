import * as THREE from 'three';
import { clamp } from '../engine/math';
import type { Subject } from './Subject';

export interface SubjectShot {
  subject: Subject;
  score: number;
  size: number;      // projected size 0..1 of frame height
  centering: number; // 0..1
  pose: string;
  poseLabel: string;
  facing: boolean;
}

export interface PhotoResult {
  id: number;
  dataUrl: string;
  shots: SubjectShot[];
  primary: SubjectShot | null;
  total: number;
  stars: number; // 0..4
  bonuses: string[];
  u: number;
  time: number;
}

export interface ScoringRules {
  /** worlds can reward exact centering (Wes Anderson) */
  symmetryBonus?: boolean;
}

const ndc = new THREE.Vector3();
const edge = new THREE.Vector3();
const center = new THREE.Vector3();
const camPos = new THREE.Vector3();
const toCam = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

let photoCounter = 0;

/** Rate the framing of every subject that is inside the viewfinder. */
export function scorePhoto(
  camera: THREE.PerspectiveCamera,
  subjects: Subject[],
  occluders: THREE.Object3D[],
  rules: ScoringRules,
  u: number,
  time: number,
  dataUrl: string,
): PhotoResult {
  camera.updateMatrixWorld();
  camera.getWorldPosition(camPos);
  const shots: SubjectShot[] = [];
  const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  for (const s of subjects) {
    if (!s.active) continue;
    s.center(center);
    const dist = center.distanceTo(camPos);
    if (dist > s.maxDistance) continue;
    ndc.copy(center).project(camera);
    if (ndc.z < -1 || ndc.z > 1) continue;
    // projected radius: project a point one radius to the right of the centre
    edge.copy(center).addScaledVector(camRight, s.radius).project(camera);
    const projR = Math.hypot(edge.x - ndc.x, edge.y - ndc.y) / 2; // in frame-height units (ndc spans 2)
    const inFrame = Math.abs(ndc.x) < 1 + projR * 0.4 && Math.abs(ndc.y) < 1 + projR * 0.4;
    if (!inFrame) continue;
    // must be mostly inside the frame
    const inside = clamp(1 - Math.max(0, Math.abs(ndc.x) - (1 - projR)) / (projR * 2 + 0.0001), 0, 1) *
                   clamp(1 - Math.max(0, Math.abs(ndc.y) - (1 - projR)) / (projR * 2 + 0.0001), 0, 1);
    if (inside < 0.35) continue;
    // occlusion: a single ray to the subject centre against big scenery
    if (occluders.length) {
      toCam.copy(center).sub(camPos);
      const len = toCam.length();
      raycaster.set(camPos, toCam.normalize());
      raycaster.far = len - s.radius * 0.6;
      raycaster.near = 0.5;
      const hits = raycaster.intersectObjects(occluders, true);
      if (hits.length) continue;
    }
    // size score: sweet spot when the subject fills 25-70% of the frame height
    const size = clamp(projR * 2, 0, 1.5);
    let sizeScore: number;
    if (size < 0.04) sizeScore = 0.12;
    else if (size < 0.25) sizeScore = 0.2 + (size - 0.04) / 0.21 * 0.55;
    else if (size <= 0.75) sizeScore = 0.75 + (size - 0.25) / 0.5 * 0.25;
    else sizeScore = Math.max(0.55, 1 - (size - 0.75) * 0.9);
    const offCenter = Math.hypot(ndc.x, ndc.y * 1.2);
    let centering = clamp(1 - offCenter / 1.25, 0, 1);
    if (rules.symmetryBonus) centering = Math.pow(centering, 0.6) * (offCenter < 0.08 ? 1.25 : 1);
    const f = s.facing();
    let facing = false;
    if (f) {
      toCam.copy(camPos).sub(center).normalize();
      facing = f.dot(toCam) > 0.35;
    }
    const facingMult = f ? (facing ? 1.2 : 0.85) : 1;
    const raw = s.base * (0.35 + 0.65 * sizeScore) * (0.45 + 0.55 * centering) * s.poseMult * facingMult * (0.6 + 0.4 * inside);
    const score = Math.round(raw);
    shots.push({ subject: s, score, size, centering, pose: s.pose, poseLabel: s.poseLabel, facing });
  }
  shots.sort((a, b) => b.score - a.score);
  let total = shots.reduce((acc, s) => acc + s.score, 0);
  const bonuses: string[] = [];
  if (shots.length >= 2) { total = Math.round(total * (1 + 0.12 * (shots.length - 1))); bonuses.push(shots.length >= 3 ? 'Ensemble' : 'Duo'); }
  const primary = shots[0] ?? null;
  if (primary) {
    if (primary.pose !== 'idle') bonuses.push(primary.poseLabel || 'Special moment');
    if (primary.facing) bonuses.push('Eye contact');
    if (primary.centering > 0.85) bonuses.push(rules.symmetryBonus ? 'Perfectly symmetrical' : 'Well framed');
    if (primary.size > 0.45 && primary.size < 0.9) bonuses.push('Close-up');
    if (primary.subject.rarity === 'legendary') bonuses.push('Legendary sighting');
    else if (primary.subject.rarity === 'rare') bonuses.push('Rare sighting');
  }
  // stars rate the shot against what the subject could give: a clean, close, centred photo is 3 stars, a special moment 4
  let stars = 0;
  if (primary) {
    const ratio = total / primary.subject.base;
    stars = ratio < 0.45 ? 1 : ratio < 0.8 ? 2 : ratio < 1.25 ? 3 : 4;
  }
  return { id: ++photoCounter, dataUrl, shots, primary, total, stars, bonuses, u, time };
}

/** Downscale the freshly rendered frame into a thumbnail data URL. */
export function snapshotCanvas(source: HTMLCanvasElement, maxW = 720): string {
  const scale = Math.min(1, maxW / source.width);
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.drawImage(source, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.86);
}
