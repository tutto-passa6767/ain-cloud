import type * as THREE from 'three';

export type BarysPose = 'idle' | 'wave' | 'sleep' | 'think' | 'happy' | 'confused';

export interface Barys {
  root: THREE.Group;
  board: THREE.Group;
  pedestal: THREE.Group;
  character: THREE.Group;
  poses: BarysPose[];
  setPose(name: BarysPose): void;
  snap(name: BarysPose): void;
  update(dt: number, t: number, opts?: { motion?: boolean; look?: [number, number]; walk?: number | null }): void;
}

export function buildBarys(three: typeof THREE): Barys;
