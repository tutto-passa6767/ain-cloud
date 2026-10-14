import type * as THREE from 'three';
import type { CloudBody } from './cloud-body';

/** Семь состояний Облачка (ТЗ маскота §3) */
export type CloudPose = 'hello' | 'idle' | 'think' | 'happy' | 'angry' | 'confused' | 'sleep';

export interface Cloud {
  root: THREE.Group;
  character: THREE.Group;
  poses: CloudPose[];
  setPose(name: CloudPose, quiet?: boolean): void;
  snap(name: CloudPose): void;
  poke(): void;
  update(dt: number, t: number, opts?: { motion?: boolean; look?: [number, number]; drift?: number }): void;
}

export function buildCloud(three: typeof THREE, body: CloudBody): Cloud;
