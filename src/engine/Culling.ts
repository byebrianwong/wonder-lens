import * as THREE from 'three';

/**
 * Hides static objects that are entirely lost in the fog.
 *
 * Frustum culling does nothing for scenery far down a straight track: everything ahead is inside the view,
 * so the renderer draws buildings a kilometre away that the fog has already turned into flat sky colour.
 * Register each static prop (a building, a stretch of forest, a terrain chunk) once; every frame the culler
 * compares its bounding sphere with the distance at which FogExp2 reaches `threshold`, and toggles `visible`.
 *
 * Only register objects nothing else shows or hides. Raycasts ignore `visible`, so hidden occluders still
 * block photos as before.
 */
export class FogCuller {
  private items: Array<{ obj: THREE.Object3D; c: THREE.Vector3; r: number }> = [];
  /** fog amount at which an object counts as gone (0.985 leaves 1.5% of its colour) */
  threshold = 0.985;
  /** objects registered / currently hidden, for stats */
  get count() { return this.items.length; }
  hidden = 0;

  /** Register a static object. `pad` grows its bounds (for shaders that push vertices outwards, like leaf cards). */
  add(obj: THREE.Object3D, pad = 0) {
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const s = box.getBoundingSphere(new THREE.Sphere());
    this.items.push({ obj, c: s.center, r: s.radius + pad });
  }

  /**
   * Register every direct child of a group separately, so each one can be hidden on its own. A child marked
   * `userData.chunked = true` (a row of lamps split into stretches, say) has its own children registered instead.
   */
  addChildren(group: THREE.Object3D, pad = 0) {
    for (const c of group.children) {
      if (c.userData.chunked) this.addChildren(c, pad);
      else this.add(c, pad);
    }
  }

  update(camera: THREE.Camera, fog: THREE.FogExp2) {
    const reach = Math.sqrt(-Math.log(1 - this.threshold)) / Math.max(fog.density, 1e-5);
    const p = camera.position;
    let hidden = 0;
    for (const it of this.items) {
      const v = p.distanceTo(it.c) - it.r < reach;
      it.obj.visible = v;
      if (!v) hidden++;
    }
    this.hidden = hidden;
  }
}
