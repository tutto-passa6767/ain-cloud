// Рендер Барыса в браузере через Three.js (ТЗ §13.5): не более 30 FPS, пауза на неактивной вкладке.
import * as THREE from 'three';
import { buildBarys, type Barys, type BarysPose } from './barys-model';

export interface SceneOptions {
  reducedMotion: boolean;
  pedestal: boolean;
}

const FRAME_MS = 1000 / 30;

export class BarysScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private barys: Barys;
  private shadow: THREE.Mesh;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private t = 0;
  private running = false;
  private look: [number, number] = [0, 0];
  private walkPhase: number | null = null;
  private facing = 0;
  private facingTarget = 0;
  private pedestalK = 0;
  private pedestalTarget = 0;
  private reduced: boolean;

  constructor(private canvas: HTMLCanvasElement, opts: SceneOptions) {
    this.reduced = opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);

    // Мягкий студийный свет: «матовая виниловая игрушка» (ТЗ §13.1)
    this.scene.add(new THREE.HemisphereLight(0xf2f7ff, 0x8796ad, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(3.5, 7, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -2;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0008;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe6ff, 0.9);
    rim.position.set(-5, 4, -4);
    this.scene.add(rim);

    this.barys = buildBarys(THREE);
    this.scene.add(this.barys.root);

    // Мягкая тень прямо на интерфейсе (без подставки), сама плоскость прозрачна
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.22 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.001;
    this.shadow.receiveShadow = true;
    this.scene.add(this.shadow);

    this.setPedestal(opts.pedestal, true);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  setPose(pose: BarysPose) {
    // При «уменьшении движения» позы меняются без анимации (ТЗ §13.4, вариант 5)
    if (this.reduced) this.barys.snap(pose);
    else this.barys.setPose(pose);
  }

  snap(pose: BarysPose) {
    this.barys.snap(pose);
  }

  /** Подставка — только в онбординге; появляется и исчезает плавно (ТЗ §13.2) */
  setPedestal(visible: boolean, instant = false) {
    this.pedestalTarget = visible ? 1 : 0;
    if (instant || this.reduced) this.pedestalK = this.pedestalTarget;
    this.applyPedestal();
  }

  private applyPedestal() {
    const k = this.pedestalK;
    const p = this.barys.pedestal;
    p.visible = k > 0.01;
    p.scale.setScalar(0.6 + 0.4 * k);
    p.position.y = -0.3 * (1 - k);
    this.barys.character.position.x = 0;
    // Без подставки персонаж стоит прямо на «полу» интерфейса
    this.barys.root.position.y = -0.24 * (1 - k);
    this.camera.fov = 26 + 6 * k;
    this.camera.position.set(0, 2.4 + 0.6 * k, 12.5 + 3 * k);
    this.camera.lookAt(0, 1.95 - 0.2 * k, 0);
    this.camera.updateProjectionMatrix();
  }

  setLook(x: number, y: number) {
    this.look = [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))];
  }

  /** Направление ходьбы: −1 влево, 1 вправо, 0 — стоит и смотрит на пользователя */
  setWalking(direction: -1 | 0 | 1) {
    if (this.reduced) direction = 0;
    this.walkPhase = direction === 0 ? null : (this.walkPhase ?? 0);
    this.facingTarget = direction * 0.75;
  }

  setReducedMotion(v: boolean) {
    this.reduced = v;
    if (v) this.setWalking(0);
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
    } else if (this.running) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  private frame = (now: number) => {
    if (!this.running || document.hidden) return;
    this.raf = requestAnimationFrame(this.frame);
    const delta = now - this.last;
    this.last = now;
    this.acc += delta;
    if (this.acc < FRAME_MS) return;
    const dt = Math.min(0.1, this.acc / 1000);
    this.acc = 0;
    this.t += dt;

    if (this.pedestalK !== this.pedestalTarget) {
      const step = dt * 2.5;
      this.pedestalK = this.pedestalK < this.pedestalTarget ? Math.min(this.pedestalTarget, this.pedestalK + step) : Math.max(this.pedestalTarget, this.pedestalK - step);
      this.applyPedestal();
    }
    this.facing += (this.facingTarget - this.facing) * Math.min(1, dt * 6);
    this.barys.root.rotation.y = this.facing;
    if (this.walkPhase !== null) this.walkPhase += dt * 9;

    this.barys.update(dt, this.t, {
      motion: !this.reduced,
      look: this.walkPhase === null ? this.look : [0, 0],
      walk: this.walkPhase,
    });
    this.renderer.render(this.scene, this.camera);
  };

  /** Один кадр без анимации — для режима «уменьшение движения» */
  renderOnce() {
    this.barys.update(0.016, this.t, { motion: false });
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.renderer.dispose();
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
