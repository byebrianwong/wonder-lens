import * as THREE from 'three';

/**
 * A heightfield sampled once on a regular grid.
 * Sampling it is much cheaper than calling a world's height function, and the terrain mesh
 * built from the same grid matches it exactly at the vertices.
 */
export class HeightGrid {
  readonly xMin: number;
  readonly zMin: number;
  readonly res: number;
  readonly nx: number;
  readonly nz: number;
  readonly data: Float32Array;

  constructor(xMin: number, xMax: number, zMin: number, zMax: number, res: number, height: (x: number, z: number) => number) {
    this.xMin = xMin; this.zMin = zMin; this.res = res;
    this.nx = Math.round((xMax - xMin) / res) + 1;
    this.nz = Math.round((zMax - zMin) / res) + 1;
    this.data = new Float32Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) {
      const z = zMin + j * res;
      for (let i = 0; i < this.nx; i++) this.data[j * this.nx + i] = height(xMin + i * res, z);
    }
  }

  private tex: THREE.DataTexture | null = null;
  /** The grid as a float texture (one texel per grid point), shared by every shader that needs ground height. */
  texture() {
    if (!this.tex) {
      this.tex = new THREE.DataTexture(this.data, this.nx, this.nz, THREE.RedFormat, THREE.FloatType);
      this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter;
      this.tex.needsUpdate = true;
    }
    return this.tex;
  }

  get xMax() { return this.xMin + (this.nx - 1) * this.res; }
  get zMax() { return this.zMin + (this.nz - 1) * this.res; }

  /**
   * Height at any point, interpolated over the same two triangles per cell that a rotated
   * PlaneGeometry uses (diagonal from (i, j+1) to (i+1, j)), so it lands exactly on the terrain mesh.
   * Clamps to the grid edge outside it.
   */
  sample(x: number, z: number) {
    let fx = (x - this.xMin) / this.res, fz = (z - this.zMin) / this.res;
    fx = Math.min(Math.max(fx, 0), this.nx - 1.0001);
    fz = Math.min(Math.max(fz, 0), this.nz - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const d = this.data, n = this.nx;
    const h00 = d[j * n + i], h10 = d[j * n + i + 1], h01 = d[(j + 1) * n + i], h11 = d[(j + 1) * n + i + 1];
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  /** Steepness in 0..1 (0 flat, 1 vertical) from central differences. */
  slope(x: number, z: number) {
    const r = this.res;
    const dx = (this.sample(x + r, z) - this.sample(x - r, z)) / (2 * r);
    const dz = (this.sample(x, z + r) - this.sample(x, z - r)) / (2 * r);
    return 1 - 1 / Math.sqrt(1 + dx * dx + dz * dz);
  }
}
