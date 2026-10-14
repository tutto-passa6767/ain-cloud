// Рендер Облачка через Three.js (ТЗ маскота §9): прозрачный холст, не более 30 FPS,
// пауза на неактивной вкладке и когда холст вне экрана.
import * as THREE from 'three';
import type { CloudBody } from './cloud-body';
import { buildCloud, type Cloud, type CloudPose } from './cloud-model';

export interface SceneOptions {
  reducedMotion: boolean;
}

const FRAME_MS = 1000 / 30;

export class CloudScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1.3, 0.1, 100);
  private cloud: Cloud;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private t = 0;
  private running = false;
  private onScreen = true;
  private look: [number, number] = [0, 0];
  private drift = 0;
  private driftTarget = 0;
  private reduced: boolean;

  constructor(canvas: HTMLCanvasElement, body: CloudBody, opts: SceneOptions) {
    this.reduced = opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // Мягкий студийный свет: матовая 3D-игрушка без контуров (ТЗ маскота §2)
    this.scene.add(new THREE.HemisphereLight(0xf4f6ff, 0x9aa6bd, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(3, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -3;
    key.shadow.radius = 8;
    key.shadow.bias = -0.0008;
    this.scene.add(key);
    // Тёплая контровая подсветка в тон сайта
    const rim = new THREE.DirectionalLight(0xff8a6a, 0.7);
    rim.position.set(-5, 4, -4);
    this.scene.add(rim);

    this.cloud = buildCloud(THREE, body);
    this.scene.add(this.cloud.root);

    // Облачко парит и отбрасывает мягкую тень прямо на интерфейс; сама плоскость прозрачна
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.16 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.receiveShadow = true;
    this.scene.add(shadow);

    // Кадр с запасом под радугу, Zzz и спутников, облетающих облачко
    this.camera.position.set(0, 3.1, 10.6);
    this.camera.lookAt(0, 2.55, 0);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  setPose(pose: CloudPose) {
    // При «уменьшении движения» состояния меняются без прыжков и тряски (ТЗ маскота §7, вариант 5)
    if (this.reduced) this.snapRender(pose);
    else this.cloud.setPose(pose);
  }

  snap(pose: CloudPose) {
    this.snapRender(pose);
  }

  private snapRender(pose: CloudPose) {
    this.cloud.snap(pose);
    this.renderer.render(this.scene, this.camera);
  }

  poke() {
    if (!this.reduced) this.cloud.poke();
  }

  setLook(x: number, y: number) {
    this.look = [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))];
  }

  /** Направление полёта вдоль края экрана: −1 влево, 1 вправо, 0 — зависает */
  setDrift(direction: -1 | 0 | 1) {
    this.driftTarget = this.reduced ? 0 : direction;
  }

  setReducedMotion(v: boolean) {
    this.reduced = v;
    if (v) this.driftTarget = 0;
  }

  /** Холст ушёл за край экрана — не рисуем */
  setOnScreen(v: boolean) {
    this.onScreen = v;
    if (v && this.running) this.kick();
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.kick();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private kick() {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private onVisibility = () => {
    if (document.hidden) cancelAnimationFrame(this.raf);
    else if (this.running) this.kick();
  };

  private frame = (now: number) => {
    if (!this.running || document.hidden || !this.onScreen) return;
    this.raf = requestAnimationFrame(this.frame);
    this.acc += now - this.last;
    this.last = now;
    if (this.acc < FRAME_MS) return;
    const dt = Math.min(0.1, this.acc / 1000);
    this.acc = 0;
    this.t += dt;
    this.drift += (this.driftTarget - this.drift) * Math.min(1, dt * 4);
    this.cloud.update(dt, this.t, { motion: !this.reduced, look: this.look, drift: this.drift });
    this.renderer.render(this.scene, this.camera);
  };

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
