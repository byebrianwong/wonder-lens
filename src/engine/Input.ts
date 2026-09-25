type Handler = () => void;
export type Action = 'shoot' | 'throw' | 'call' | 'pause' | 'hud' | 'zoomToggle' | 'album';

/**
 * Unified keyboard / mouse / touch input.
 * Look deltas accumulate per frame and are consumed by the camera rig.
 */
export class Input {
  keys = new Set<string>();
  lookDX = 0;
  lookDY = 0;
  wheel = 0;
  pointerLocked = false;
  /** "lock" = pointer lock (desktop), "drag" = click-drag / touch drag */
  mode: 'lock' | 'drag' = 'lock';
  enabled = false;
  /** true while a menu is open: look and zoom deltas are ignored */
  suspended = false;
  isTouch = false;
  private handlers = new Map<Action, Handler[]>();
  private el: HTMLElement;
  private dragging = false;
  private dragMoved = 0;
  private lastX = 0;
  private lastY = 0;
  private downTime = 0;
  private downButton = 0;
  private activeTouchId: number | null = null;
  private pinchDist = 0;
  wantsLock = false;

  constructor(el: HTMLElement) {
    this.el = el;
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    if (this.isTouch) this.mode = 'drag';

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.repeat) return;
      this.keys.add(e.code);
      switch (e.code) {
        case 'Space': e.preventDefault(); this.emit('shoot'); break;
        case 'KeyE': case 'KeyF': this.emit('throw'); break;
        case 'KeyQ': case 'KeyC': this.emit('call'); break;
        case 'Escape': case 'KeyP': this.emit('pause'); break;
        case 'KeyH': this.emit('hud'); break;
        case 'Tab': e.preventDefault(); this.emit('album'); break;
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'touch') return; // handled by touch events
      this.downTime = performance.now();
      this.downButton = e.button;
      if (this.mode === 'lock') {
        if (!this.pointerLocked) {
          this.requestLock();
          return;
        }
        if (e.button === 0) this.emit('shoot');
        else if (e.button === 2) this.emit('throw');
        else if (e.button === 1) { e.preventDefault(); this.emit('call'); }
      } else {
        this.dragging = true;
        this.dragMoved = 0;
        this.lastX = e.clientX; this.lastY = e.clientY;
        el.setPointerCapture(e.pointerId);
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'touch') return;
      if (this.mode === 'lock') {
        if (this.pointerLocked) { this.lookDX += e.movementX; this.lookDY += e.movementY; }
      } else if (this.dragging) {
        const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
        this.dragMoved += Math.abs(dx) + Math.abs(dy);
        this.lookDX += dx * 1.6; this.lookDY += dy * 1.6;
        this.lastX = e.clientX; this.lastY = e.clientY;
      }
    });
    const endDrag = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (this.mode === 'drag' && this.dragging) {
        this.dragging = false;
        try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        const quick = performance.now() - this.downTime < 300 && this.dragMoved < 6;
        if (quick && this.enabled) {
          if (this.downButton === 0) this.emit('shoot');
          else if (this.downButton === 2) this.emit('throw');
        }
      }
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    // wheel / trackpad zoom: listen on the window so overlays cannot swallow it; normalise delta modes
    window.addEventListener('wheel', (e) => {
      if (!this.enabled || this.suspended) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest && target.closest('.pause, .album, .menu, .loading')) return;
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 120 : 1;
      this.wheel += Math.max(-80, Math.min(80, e.deltaY * scale));
    }, { passive: false });

    // touch: one finger look, quick tap shoots, two finger pinch zooms
    el.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        this.activeTouchId = t.identifier;
        this.lastX = t.clientX; this.lastY = t.clientY;
        this.downTime = performance.now();
        this.dragMoved = 0;
      } else if (e.touches.length === 2) {
        this.activeTouchId = null;
        this.pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      if (e.touches.length === 1 && this.activeTouchId !== null) {
        const t = e.touches[0];
        const dx = t.clientX - this.lastX, dy = t.clientY - this.lastY;
        this.dragMoved += Math.abs(dx) + Math.abs(dy);
        this.lookDX += dx * 2.2; this.lookDY += dy * 2.2;
        this.lastX = t.clientX; this.lastY = t.clientY;
      } else if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        this.wheel += (this.pinchDist - d) * 3;
        this.pinchDist = d;
      }
    }, { passive: false });
    el.addEventListener('touchend', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      if (e.touches.length === 0 && this.activeTouchId !== null) {
        const quick = performance.now() - this.downTime < 260 && this.dragMoved < 10;
        if (quick) this.emit('shoot');
        this.activeTouchId = null;
      }
    }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.el;
      if (!this.pointerLocked && this.wantsLock && this.enabled) {
        // user pressed Esc while locked: treat as pause
        this.wantsLock = false;
        this.emit('pause');
      }
    });
    document.addEventListener('pointerlockerror', () => { this.mode = 'drag'; this.wantsLock = false; });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason as { name?: string } | undefined;
      if (r && (r.name === 'WrongDocumentError' || r.name === 'SecurityError' || r.name === 'NotSupportedError')) { e.preventDefault(); this.mode = 'drag'; this.wantsLock = false; }
    });
  }

  requestLock() {
    if (this.mode !== 'lock' || this.pointerLocked) return;
    this.wantsLock = true;
    let p: Promise<void> | undefined;
    try { p = (this.el as any).requestPointerLock?.({ unadjustedMovement: true }); } catch { this.mode = 'drag'; this.wantsLock = false; return; }
    if (p && typeof p.catch === 'function') p.catch(() => {
      // pointer lock is unavailable here (embedded browser, iframe, permissions); fall back to drag-look
      this.mode = 'drag'; this.wantsLock = false;
    });
  }
  releaseLock() {
    this.wantsLock = false;
    if (document.pointerLockElement === this.el) document.exitPointerLock();
  }

  on(action: Action, h: Handler) {
    const list = this.handlers.get(action) ?? [];
    list.push(h);
    this.handlers.set(action, list);
  }
  private emit(action: Action) {
    const list = this.handlers.get(action);
    if (list) for (const h of list) h();
  }
  down(code: string) { return this.keys.has(code); }

  /** Read and reset the per-frame look/wheel deltas. */
  consume() {
    const out = { dx: this.lookDX, dy: this.lookDY, wheel: this.wheel };
    this.lookDX = 0; this.lookDY = 0; this.wheel = 0;
    return out;
  }
}
