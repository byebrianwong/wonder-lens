import * as THREE from 'three';
import type { UvRect } from './propTextures';

/** Collects quads/triangles in local space, transformed by the current house matrix, into one geometry. */
export class Acc {
  pos: number[] = []; nrm: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  private m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  private v = new THREE.Vector3();
  private n = new THREE.Vector3();
  setMatrix(m: THREE.Matrix4) { this.m.copy(m); this.nm.getNormalMatrix(m); }
  private push(p: THREE.Vector3, u: number, v: number, c: THREE.Color) {
    this.v.copy(p).applyMatrix4(this.m);
    this.pos.push(this.v.x, this.v.y, this.v.z);
    this.nrm.push(this.n.x, this.n.y, this.n.z);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
  }
  /** a,b,c,d counter-clockwise seen from the front (a bottom-left, b bottom-right, c top-right, d top-left). */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, uv: UvRect | [number, number, number, number, number, number, number, number], color: THREE.Color) {
    this.n.subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize().applyMatrix3(this.nm).normalize();
    const k = this.pos.length / 3;
    if (Array.isArray(uv)) {
      this.push(a, uv[0], uv[1], color); this.push(b, uv[2], uv[3], color); this.push(c, uv[4], uv[5], color); this.push(d, uv[6], uv[7], color);
    } else {
      this.push(a, uv.u0, uv.v0, color); this.push(b, uv.u1, uv.v0, color); this.push(c, uv.u1, uv.v1, color); this.push(d, uv.u0, uv.v1, color);
    }
    this.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, uva: [number, number], uvb: [number, number], uvc: [number, number], color: THREE.Color) {
    this.n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize().applyMatrix3(this.nm).normalize();
    const k = this.pos.length / 3;
    this.push(a, uva[0], uva[1], color); this.push(b, uvb[0], uvb[1], color); this.push(c, uvc[0], uvc[1], color);
    this.idx.push(k, k + 1, k + 2);
  }
  /** axis-aligned box in local space (all six faces), untextured */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: THREE.Color, skipBottom = true) {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const z: [number, number, number, number, number, number, number, number] = [0, 0, 1, 0, 1, 1, 0, 1];
    this.quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), z, color);
    this.quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), z, color);
    this.quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), z, color);
    this.quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), z, color);
    this.quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), z, color);
    if (!skipBottom) this.quad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), z, color);
  }
  get empty() { return this.idx.length === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
