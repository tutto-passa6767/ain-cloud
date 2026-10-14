// Облачко — 3D-маскот AIN Cloud (Three.js r128).
// buildCloud(THREE) -> { root, pedestal, character, setPose, snap, update, poke, poses }
// Варианты формы облака: face — лицевой «клуб» [x,y,z,r], puffs — остальные клубы, hand — смещение ручек
const CLOUD_SHAPES = {
  open: { mesh: true, face: [0.03, 0.1, 0.3, 1.1], hand: [1.72, -0.58, 0.4], noHands: true,
    sats: [[-2.11, -0.84, 0.28, 0.44, 0.34, 0.36], [-0.21, -1.14, 0.28, 0.21, 0.155, 0.18]] },
  blob: { sdf: true, face: [0.0, -0.1, 0.3, 1.1], hand: [1.72, -0.58, 0.4], noHands: true,
    lobes: [[-0.48, 0.56, -0.05, 0.99, 0.99, 0.82], [0.68, 0.6, -0.08, 0.78, 0.8, 0.68], [-1.45, -0.32, 0.0, 0.98, 1.0, 0.78], [1.62, 0.24, -0.02, 0.46, 0.46, 0.44],
      [1.62, -0.48, 0.0, 0.82, 0.82, 0.72], [0.05, -0.92, 0.05, 1.1, 0.6, 0.74], [0.05, -0.1, 0.15, 1.55, 1.15, 0.9]], smooth: 0.16,
    sats: [[-2.6, -1.5, 0.3, 0.4], [-0.25, -2.05, 0.4, 0.2]] },
  puffy: { face: [0, -0.02, 0.45, 1.12], hand: [1.25, -0.4, 0.55], puffs: [[-0.72, 0.62, -0.15, 0.88], [0.62, 0.8, -0.25, 0.95], [1.12, 0.05, -0.05, 0.78], [-1.15, -0.12, -0.05, 0.74], [-0.6, -0.58, 0.02, 0.68], [0.62, -0.58, 0.02, 0.7], [0, 0.15, -0.5, 1.05], [0.05, 1.0, -0.55, 0.62]] },
  classic: { face: [0, -0.12, 0.42, 1.0], hand: [1.55, -0.45, 0.45], puffs: [[-1.3, -0.42, 0.05, 0.62], [-0.5, -0.5, 0.15, 0.68], [0.5, -0.5, 0.15, 0.68], [1.3, -0.42, 0.05, 0.62], [-0.78, 0.32, 0.0, 0.78], [0.18, 0.62, -0.05, 0.98], [1.02, 0.22, 0.0, 0.7], [0, -0.05, -0.35, 1.05], [-1.7, -0.5, -0.1, 0.42], [1.72, -0.5, -0.1, 0.42]] },
  round: { face: [0, 0, 0.2, 1.2], hand: [1.42, -0.35, 0.35], puffs: Array.from({ length: 10 }, (_, i) => { const a = i / 10 * Math.PI * 2 + 0.31; return [Math.cos(a) * 1.08, Math.sin(a) * 1.02, -0.05, 0.44]; }).concat([[0, 0, -0.25, 1.15]]) },
  long: { face: [0, -0.05, 0.4, 0.95], hand: [2.05, -0.5, 0.25], puffs: [[-1.25, -0.12, 0.05, 0.74], [1.3, -0.12, 0.05, 0.74], [-2.0, -0.28, -0.05, 0.5], [2.05, -0.28, -0.05, 0.5], [-0.62, 0.48, -0.1, 0.74], [0.62, 0.55, -0.1, 0.8], [0, 0.05, -0.4, 1.0], [-1.4, -0.4, -0.2, 0.55], [1.45, -0.4, -0.2, 0.55]] },
  mound: { face: [0, -0.05, 0.3, 1.18], hand: [1.32, -0.45, 0.45], puffs: [[-0.55, 0.78, -0.12, 0.62], [0.52, 0.88, -0.18, 0.72], [-1.02, -0.18, 0.0, 0.62], [1.05, -0.15, 0.0, 0.62], [0, 0.1, -0.35, 1.15]] }
};
function buildCloud(THREE, opts) {
  const SHAPE = CLOUD_SHAPES[(opts && opts.shape) || 'open'];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const mat = (c, r, extra) => { const m = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r === undefined ? 0.8 : r, metalness: 0 }, extra || {})); m.color.convertSRGBToLinear(); if (m.emissive) m.emissive.convertSRGBToLinear(); return m; };
  const M = {
    body: mat(0xeeeff3, 0.82), brow: mat(0x3a3d47, 0.4), blushA: mat(0xf9848f, 0.7, { transparent: true, opacity: 0.22, depthWrite: false }), blushB: mat(0xf9848f, 0.7, { transparent: true, opacity: 0.45, depthWrite: false }), blushC: mat(0xf9848f, 0.7, { transparent: true, opacity: 0.95, depthWrite: false }), eye: mat(0x101114, 0.18), line: mat(0x15171c, 0.35), white: mat(0xffffff, 0.15), blush: mat(0xf3a6a2, 0.8),
    tongue: mat(0xf28a99, 0.55), bolt: mat(0xffc93c, 0.4, { emissive: 0x7a5200 }), anger: mat(0xe5484d, 0.45),
    q: mat(0x7d95bd, 0.45), zz: mat(0x8ea6cf, 0.45), spark: mat(0xffd35c, 0.35, { emissive: 0x6b4e00 }),
    pedestal: mat(0xd8e3ef, 0.9), pedestalEdge: mat(0xc3d2e3, 0.9), drop: mat(0x8cc6f2, 0.25)
  };
  M.skin = M.body.clone(); M.skin.vertexColors = true;
  Object.keys(M).forEach(k => { M[k].name = k; });
  const RAIN = [0xff8f8f, 0xffb877, 0xffe27a, 0x9be8a6, 0x86c8fb, 0xb9a3fb].map((c, i) => { const m = mat(c, 0.55, { side: THREE.DoubleSide }); m.name = 'rainbow_' + i; return m; });
  const SPH = new THREE.SphereGeometry(1, 48, 32);
  const mesh = (g, m, name) => { const o = new THREE.Mesh(g, m); if (name) o.name = name; o.castShadow = true; o.receiveShadow = true; return o; };
  const ell = (m, s, p, name) => { const o = mesh(SPH, m, name); o.scale.set(s[0], s[1], s[2]); o.position.set(p[0], p[1], p[2]); return o; };
  const group = (name, p) => { const g = new THREE.Group(); g.name = name; if (p) g.position.set(p[0], p[1], p[2]); return g; };
  const Z = V(0, 0, 1);

  const root = group('Cloud');
  // ---------- подставка (только онбординг) ----------
  const pedestal = group('Pedestal');
  const p1 = mesh(new THREE.CylinderGeometry(2.6, 2.65, 0.24, 96), M.pedestal, 'pedestal_top'); p1.position.y = 0.12;
  const p2 = mesh(new THREE.CylinderGeometry(2.8, 2.84, 0.08, 96), M.pedestalEdge, 'pedestal_base'); p2.position.y = 0.04;
  pedestal.add(p1, p2); pedestal.visible = false; // подставка не используется

  // ---------- персонаж ----------
  const BASE_Y = 2.3;
  const character = group('Character', [0, BASE_Y, 0]); root.add(character);
  const squash = group('Squash'); character.add(squash);
  const body = group('Body'); squash.add(body);
  const FACE_C = V(SHAPE.face[0], SHAPE.face[1], SHAPE.face[2]), FACE_R = SHAPE.face[3];
  let sdf = null, bodyMesh = null;
  if (SHAPE.mesh) {
    const D = (typeof CLOUD_BODY_DATA !== 'undefined') ? CLOUD_BODY_DATA : (opts && opts.bodyData);
    const bytes = str => { if (typeof Buffer !== 'undefined') { const b = Buffer.from(str, 'base64'); return new Uint8Array(b).buffer; } const bin = atob(str), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
    const pi = new Int16Array(bytes(D.pos)), ni = new Int16Array(bytes(D.nor)), ci = new Uint8Array(bytes(D.col)), ii = new Uint32Array(bytes(D.idx));
    const pos = new Float32Array(pi.length), nor = new Float32Array(ni.length), colA = new Float32Array(ci.length);
    for (let i = 0; i < pi.length; i++) { pos[i] = pi[i] / 32767 * D.s; nor[i] = ni[i] / 32767; }
    for (let i = 0; i < ci.length; i++) colA[i] = ci[i] / 255;   // цвета вершин glTF уже линейные
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    g.setIndex(new THREE.BufferAttribute(ii, 1)); g.computeBoundingSphere();
    bodyMesh = mesh(g, M.skin, 'cloud_body'); body.add(bodyMesh);
  } else if (SHAPE.sdf) {
    const L = SHAPE.lobes, K = SHAPE.smooth;
    sdf = (x, y, z) => {
      let d = 1e9;
      for (let i = 0; i < L.length; i++) {
        const l = L[i], px = (x - l[0]) / l[3], py = (y - l[1]) / l[4], pz = (z - l[2]) / l[5];
        const e = (Math.sqrt(px * px + py * py + pz * pz) - 1) * Math.min(l[3], l[4], l[5]);
        const h = Math.max(K - Math.abs(d - e), 0) / K; d = Math.min(d, e) - h * h * K * 0.25;
      }
      return d;
    };
    bodyMesh = mesh(surfaceNets(sdf, L), M.body, 'cloud_body'); body.add(bodyMesh);
  } else {
    const PUFFS = [SHAPE.face].concat(SHAPE.puffs);
    PUFFS.forEach((p, i) => body.add(ell(M.body, [p[3], p[3], p[3]], [p[0], p[1], p[2]], i === 0 ? 'face_puff' : 'puff')));
  }
  // гладкая поверхность по SDF (surface nets): вершина в каждой ячейке со сменой знака, четырёхугольник на каждом пересечённом ребре
  function surfaceNets(f, lobes) {
    const h = 0.045, pad = 0.25;
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    lobes.forEach(l => { for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], l[a] - l[3 + a] - pad); mx[a] = Math.max(mx[a], l[a] + l[3 + a] + pad); } });
    const n = mn.map((v, a) => Math.ceil((mx[a] - v) / h));
    const sx = n[0] + 1, sy = n[1] + 1, sz = n[2] + 1, idx = (i, j, k) => i + sx * (j + sy * k);
    const val = new Float32Array(sx * sy * sz);
    for (let k = 0; k < sz; k++) for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) val[idx(i, j, k)] = f(mn[0] + i * h, mn[1] + j * h, mn[2] + k * h);
    const cell = new Int32Array(n[0] * n[1] * n[2]).fill(-1), cidx = (i, j, k) => i + n[0] * (j + n[1] * k);
    const pos = [], nor = [], ind = [];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
      const v = C.map(c => val[idx(i + c[0], j + c[1], k + c[2])]);
      let neg = 0; v.forEach(x => { if (x < 0) neg++; }); if (neg === 0 || neg === 8) continue;
      let ax = 0, ay = 0, az = 0, cnt = 0;
      E.forEach(e => { const a = v[e[0]], b = v[e[1]]; if ((a < 0) === (b < 0)) return; const t = a / (a - b), ca = C[e[0]], cb = C[e[1]];
        ax += ca[0] + (cb[0] - ca[0]) * t; ay += ca[1] + (cb[1] - ca[1]) * t; az += ca[2] + (cb[2] - ca[2]) * t; cnt++; });
      const x = mn[0] + (i + ax / cnt) * h, y = mn[1] + (j + ay / cnt) * h, z = mn[2] + (k + az / cnt) * h;
      cell[cidx(i, j, k)] = pos.length / 3; pos.push(x, y, z);
      const g = 0.01, gx = f(x + g, y, z) - f(x - g, y, z), gy = f(x, y + g, z) - f(x, y - g, z), gz = f(x, y, z + g) - f(x, y, z - g), gl = Math.hypot(gx, gy, gz) || 1;
      nor.push(gx / gl, gy / gl, gz / gl);
    }
    const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) ind.push(a, b, c, a, c, d); else ind.push(a, c, b, a, d, c); };
    for (let k = 1; k < n[2]; k++) for (let j = 1; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
      const a = val[idx(i, j, k)], b = val[idx(i + 1, j, k)]; if ((a < 0) === (b < 0)) continue;
      quad(cell[cidx(i, j - 1, k - 1)], cell[cidx(i, j, k - 1)], cell[cidx(i, j, k)], cell[cidx(i, j - 1, k)], a < 0);
    }
    for (let k = 1; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 1; i < n[0]; i++) {
      const a = val[idx(i, j, k)], b = val[idx(i, j + 1, k)]; if ((a < 0) === (b < 0)) continue;
      quad(cell[cidx(i - 1, j, k - 1)], cell[cidx(i - 1, j, k)], cell[cidx(i, j, k)], cell[cidx(i, j, k - 1)], a < 0);
    }
    for (let k = 0; k < n[2]; k++) for (let j = 1; j < n[1]; j++) for (let i = 1; i < n[0]; i++) {
      const a = val[idx(i, j, k)], b = val[idx(i, j, k + 1)]; if ((a < 0) === (b < 0)) continue;
      quad(cell[cidx(i - 1, j - 1, k)], cell[cidx(i, j - 1, k)], cell[cidx(i, j, k)], cell[cidx(i - 1, j, k)], a < 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(ind); return geo;
  }
  // маленькие облачка-спутники рядом (как на референсе)
  const sats = (SHAPE.sats || []).map((s, i) => { const m = ell(M.body, s.length > 4 ? [s[3], s[4], s[5]] : [s[3] * 1.15, s[3], s[3]], [s[0], s[1], s[2]], 'satellite'); m.userData = { base: s, i }; return m; });

  // точка на «лицевой» сфере
  function onFace(d, lift) {
    const n = V(d[0], d[1], d[2]).normalize();
    if (!sdf) return { p: FACE_C.clone().addScaledVector(n, FACE_R + (lift || 0)), q: new THREE.Quaternion().setFromUnitVectors(Z, n) };
    let lo = 0, hi = 3; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, q = FACE_C.clone().addScaledVector(n, m); (sdf(q.x, q.y, q.z) < 0) ? lo = m : hi = m; }
    const p = FACE_C.clone().addScaledVector(n, lo), g = 0.01;
    const nn = V(sdf(p.x + g, p.y, p.z) - sdf(p.x - g, p.y, p.z), sdf(p.x, p.y + g, p.z) - sdf(p.x, p.y - g, p.z), sdf(p.x, p.y, p.z + g) - sdf(p.x, p.y, p.z - g)).normalize();
    return { p: p.addScaledVector(nn, lift || 0), q: new THREE.Quaternion().setFromUnitVectors(Z, nn) };
  }
  const face = group('Face'); squash.add(face);
  function place(obj, d, lift) { const f = onFace(d, lift); obj.position.copy(f.p); obj.quaternion.copy(f.q); face.add(obj); return obj; }
  const _ray = new THREE.Raycaster(), _rm = new THREE.Matrix4();
  function placeXY(obj, x, y, lift, front) {
    if (!sdf && bodyMesh) {
      const probe = new THREE.Mesh(bodyMesh.geometry); probe.updateMatrixWorld(true);
      _ray.set(V(x, y, 5), V(0, 0, -1)); const hit = _ray.intersectObject(probe)[0];
      const nn = hit ? hit.face.normal.clone() : V(0, 0, 1); if (front) nn.addScaledVector(Z, front).normalize();
      obj.position.set(x, y, hit ? hit.point.z : 1.2).addScaledVector(nn, lift || 0); obj.quaternion.setFromUnitVectors(Z, nn); face.add(obj); return obj;
    }
    let lo = 0.0, hi = 3.0; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; (sdf(x, y, m) < 0) ? lo = m : hi = m; }
    const g = 0.01, nn = V(sdf(x + g, y, lo) - sdf(x - g, y, lo), sdf(x, y + g, lo) - sdf(x, y - g, lo), sdf(x, y, lo + g) - sdf(x, y, lo - g)).normalize();
    if (front) nn.addScaledVector(Z, front).normalize();
    obj.position.set(x, y, lo).addScaledVector(nn, lift || 0); obj.quaternion.setFromUnitVectors(Z, nn); face.add(obj); return obj;
  }

  // глаза
  const eyes = [];
  [-1, 1].forEach(sx => {
    const g = placeXY(group(sx < 0 ? 'Eye_L' : 'Eye_R'), sx < 0 ? -0.405 : 0.465, 0.225, 0); g.scale.setScalar(1.6);
    const open = group('eye_open'); g.add(open);
    const pupil = group('pupil'); open.add(pupil);
    pupil.add(ell(M.eye, [0.12, 0.12, 0.045], [0, 0, 0.012], 'eye'));
    pupil.add(ell(M.white, [0.05, 0.05, 0.02], [-0.035, 0.04, 0.05], 'glint'));
    pupil.add(ell(M.white, [0.022, 0.022, 0.012], [0.045, -0.045, 0.05], 'glint_small'));
    const happy = group('eye_happy'); g.add(happy);
    const hArc = mesh(new THREE.TorusGeometry(0.1, 0.017, 8, 28, Math.PI), M.line, 'eye_happy'); hArc.position.z = 0.012; happy.add(hArc);
    const lash = ell(M.line, [0.035, 0.012, 0.012], [sx * 0.115, 0.02, 0.012], 'lash'); lash.rotation.z = sx * 0.6; happy.add(lash);
    const closed = group('eye_closed'); g.add(closed);
    const cArc = mesh(new THREE.TorusGeometry(0.095, 0.016, 8, 28, Math.PI), M.line, 'eye_closed'); cArc.rotation.z = Math.PI; cArc.scale.y = 0.55; cArc.position.set(0, 0.02, 0.012); closed.add(cArc);
    const browPivot = group('brow', [0, 0.2, 0.012]); g.add(browPivot);
    const brow = ell(M.eye, [0.12, 0.032, 0.025], [0, 0, 0], 'brow'); browPivot.add(brow);
    eyes.push({ sx, g, open, pupil, happy, closed, browPivot });
  });
  // румянец
  const blushes = [];
  const DISC = new THREE.CircleGeometry(1, 48);
  if (!SHAPE.mesh) [-1, 1].forEach(sx => {
    const g = placeXY(group('blush'), -0.08 + sx * 0.72, -0.08, 0.035, 0.8);
    [[1.35, M.blushA], [1.15, M.blushB], [1.0, M.blushC]].forEach((l, i) => { const m = new THREE.Mesh(DISC, l[1]); m.name = 'blush'; m.scale.set(0.2 * l[0], 0.1 * l[0], 1); m.position.z = 0.002 * i; m.renderOrder = 2 + i; g.add(m); });
    blushes.push(g);
  });
  // рты
  const mouths = {};
  const mouthAt = (name) => { const g = placeXY(group('mouth_' + name), 0.03, -0.1, 0.004); g.scale.setScalar(1.75); return g; };
  mouths.smile = mouthAt('smile'); { const a = mesh(new THREE.TorusGeometry(0.085, 0.017, 8, 28, Math.PI), M.line, 'mouth'); a.rotation.z = Math.PI; a.scale.y = 0.7; a.position.y = 0.03; mouths.smile.add(a); }
  function halfDisc(w, h) { const s = new THREE.Shape(); s.moveTo(-w, 0); s.lineTo(w, 0); s.absellipse(0, 0, w, h, 0, -Math.PI, true); return new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 24 }); }
  mouths.open = mouthAt('open'); { const d = mesh(halfDisc(0.1, 0.14), M.line, 'mouth'); d.position.y = 0.06; mouths.open.add(d); mouths.open.add(ell(M.tongue, [0.06, 0.055, 0.02], [0, -0.035, 0.024], 'tongue')); }
  mouths.smirk = mouthAt('smirk'); mouths.smirk.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.1, 0.02, 0), V(-0.05, -0.025, 0), V(0.0, -0.01, 0), V(0.035, -0.03, 0), V(0.08, -0.005, 0), V(0.1, 0.02, 0)]), 40, 0.016, 8, false), M.line, 'mouth'));
  mouths.w = mouthAt('w'); [-0.065, 0.065].forEach(x => { const a = mesh(new THREE.TorusGeometry(0.065, 0.017, 8, 20, Math.PI), M.line, 'mouth'); a.rotation.z = Math.PI; a.scale.y = 0.8; a.position.set(x, 0.03, 0); mouths.w.add(a); });
  mouths.o = mouthAt('o'); mouths.o.add(ell(M.line, [0.055, 0.075, 0.025], [0, -0.02, 0], 'mouth')); mouths.o.add(ell(M.tongue, [0.035, 0.045, 0.02], [0, -0.035, 0.012], 'tongue'));
  mouths.shout = mouthAt('shout'); { mouths.shout.add(ell(M.line, [0.13, 0.1, 0.025], [0, -0.01, 0], 'mouth')); mouths.shout.add(ell(M.tongue, [0.07, 0.035, 0.02], [0, -0.06, 0.012], 'tongue')); }
  mouths.frown = mouthAt('frown'); { const a = mesh(new THREE.TorusGeometry(0.1, 0.017, 8, 28, Math.PI), M.line, 'mouth'); a.scale.y = 0.6; a.position.y = -0.03; mouths.frown.add(a); }
  mouths.wavy = mouthAt('wavy'); { const pts = []; for (let i = 0; i <= 20; i++) { const x = -0.13 + 0.26 * i / 20; pts.push(V(x, Math.sin(i / 20 * Math.PI * 3) * 0.022, 0)); } mouths.wavy.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.016, 8, false), M.line, 'mouth')); }

  ['w', 'shout', 'wavy'].forEach(k => mouths[k].scale.multiplyScalar(0.62));
  // ручки-«облачка»
  const hands = SHAPE.noHands ? [] : [-1, 1].map(sx => {
    const pivot = group(sx < 0 ? 'Hand_L' : 'Hand_R', [sx * SHAPE.hand[0], SHAPE.hand[1], SHAPE.hand[2]]);
    const yaw = group('yaw'); pivot.add(yaw);
    const h = group('hand', [sx * 0.34, 0, 0]); yaw.add(h);
    h.add(ell(M.body, [0.22, 0.2, 0.2], [0, 0, 0], 'hand'));
    h.add(ell(M.body, [0.16, 0.15, 0.15], [sx * 0.15, 0.11, 0.0], 'hand_puff'));
    h.add(ell(M.body, [0.14, 0.13, 0.13], [sx * 0.1, -0.11, 0.06], 'hand_puff'));
    squash.add(pivot);
    return { sx, pivot, yaw };
  });

  // ---------- эффекты ----------
  const fx = {};
  const fxGroup = (name, p) => { const g = group(name, p); character.add(g); g.scale.setScalar(0.001); return g; };
  // молнии
  fx.bolts = fxGroup('fx_bolts', [0, -1.05, 0.45]);
  { const s = new THREE.Shape(); [[-0.1, 0], [0.16, 0], [0.04, -0.28], [0.2, -0.28], [-0.1, -0.8], [-0.02, -0.38], [-0.17, -0.38]].forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2 });
    [[-0.62, 0, 0.1, 0.75, 0.15], [0.08, -0.08, 0.25, 1.1, -0.05], [0.72, 0, 0.05, 0.7, -0.2]].forEach(b => { const m = mesh(g, M.bolt, 'bolt'); m.position.set(b[0], b[1], b[2]); m.scale.setScalar(b[3]); m.rotation.z = b[4]; fx.bolts.add(m); }); }
  // знак злости 💢
  fx.anger = fxGroup('fx_anger', [1.3, 1.45, 0.7]);
  { const arc = new THREE.TorusGeometry(0.13, 0.045, 10, 20, Math.PI / 2); [[0.09, 0.09, 0], [-0.09, 0.09, Math.PI / 2], [-0.09, -0.09, Math.PI], [0.09, -0.09, -Math.PI / 2]].forEach(a => { const m = mesh(arc, M.anger, 'anger'); m.position.set(a[0] * 1.6, a[1] * 1.6, 0); m.rotation.z = a[2] + Math.PI; fx.anger.add(m); }); }
  // радуга
  // радуга: плоские пастельные ленты; выходит из-за купола и заканчивается на облачке-спутнике справа
  fx.rainbow = fxGroup('fx_rainbow', [1.27, 0.22, -0.55]);
  character.remove(fx.rainbow); root.add(fx.rainbow); fx.rainbow.position.set(0.0, BASE_Y - 0.05, -0.75);   // радуга стоит в небе, не прыгает
  const rainArc = group('rainbow_arc'); rainArc.scale.x = -1; fx.rainbow.add(rainArc);   // зеркально: дуга растёт слева направо
  const RB_SEG = 72;
  const rainBands = RAIN.map((m, i) => { const R0 = 2.05 - (i + 1) * 0.09; const g0 = 0.091; const g = new THREE.RingGeometry(R0, R0 + g0, RB_SEG, 1, 0, Math.PI); const r = new THREE.Mesh(g, m); r.name = 'rainbow'; r.position.z = -i * 0.004; rainArc.add(r); return r; });
  // искорки
  fx.spark = fxGroup('fx_sparkles', [0, 0, 0]);
  const sparks = [[-1.75, 1.0, 0.6, 1.3], [1.85, 0.6, 0.5, 1.1], [-1.3, 1.65, 0.2, 0.9], [1.4, 1.6, 0.4, 1.4], [-2.0, -0.2, 0.5, 0.8], [2.0, -0.4, 0.4, 0.9]].map(s => {
    const g = group('sparkle', [s[0], s[1], s[2]]); g.add(ell(M.spark, [0.13, 0.028, 0.028], [0, 0, 0], 'spark')); g.add(ell(M.spark, [0.028, 0.13, 0.028], [0, 0, 0], 'spark'));
    g.userData.s = s[3]; fx.spark.add(g); return g; });
  // конфетти (живые частицы) и сердечки — для «Радости»
  fx.confetti = fxGroup('fx_confetti', [0, 0, 0]); character.remove(fx.confetti); root.add(fx.confetti); fx.confetti.position.set(0, BASE_Y, 0.35);
  const CONF_COL = [0xff8f8f, 0xffb877, 0xffe27a, 0x9be8a6, 0x86c8fb, 0xb9a3fb].map((c, i) => { const m = mat(c, 0.5, { side: THREE.DoubleSide }); m.name = 'confetti_' + i; return m; });
  const confGeo = new THREE.PlaneGeometry(0.1, 0.18);
  let cr = 99; const crnd = () => { cr = (cr * 16807) % 2147483647; return cr / 2147483647; };
  const conf = Array.from({ length: 18 }, (_, i) => { const m = new THREE.Mesh(confGeo, CONF_COL[i % 6]); m.name = 'confetti'; fx.confetti.add(m);
    return { m, p: V(0, 0, 0), v: V(0, 0, 0), spin: V(crnd() * 9 - 4.5, crnd() * 9 - 4.5, crnd() * 9 - 4.5), ph: crnd() * 6.28, sx: crnd() * 5.6 - 2.8 }; });
  function confettiBurst() { conf.forEach(c => { c.m.visible = true; c.p.set((crnd() - 0.5) * 0.6, 1.0 + crnd() * 0.3, (crnd() - 0.5) * 0.4); const a = crnd() * Math.PI - 0.0, sp = 2.6 + crnd() * 2.2; c.v.set(Math.cos(a) * sp * 0.9, 2.2 + crnd() * 2.6, (crnd() - 0.5) * 1.2); }); }
  function confettiStatic() { conf.forEach((c, i) => { c.p.set(c.sx, -1.2 + ((i * 0.37) % 1) * 3.6, (crnd() - 0.5) * 0.8); c.m.position.copy(c.p); c.m.rotation.set(c.ph, c.ph * 1.7, c.ph * 0.6); }); }
  confettiBurst();
  fx.hearts = fxGroup('fx_hearts', [0, 0, 0]); character.remove(fx.hearts); root.add(fx.hearts); fx.hearts.position.set(0, BASE_Y, 0.5);
  const heartGeo = (() => { const h = new THREE.Shape(); h.moveTo(0, -0.12); h.bezierCurveTo(-0.02, -0.08, -0.16, 0.0, -0.13, 0.08); h.bezierCurveTo(-0.11, 0.14, -0.03, 0.15, 0, 0.08); h.bezierCurveTo(0.03, 0.15, 0.11, 0.14, 0.13, 0.08); h.bezierCurveTo(0.16, 0.0, 0.02, -0.08, 0, -0.12);
    return new THREE.ExtrudeGeometry(h, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 3, curveSegments: 16 }); })();
  const M_heart = mat(0xff7a93, 0.4); M_heart.name = 'heart';
  const hearts = [[-1.35, 0.0], [1.45, 0.33], [-0.6, 0.66], [0.9, 0.85]].map((h, i) => { const m = mesh(heartGeo, M_heart, 'heart'); m.userData = { x: h[0], o: h[1] }; fx.hearts.add(m); return m; });
  // Zzz
  fx.zzz = fxGroup('fx_zzz', [1.25, 1.15, 0.6]);
  const zGeo = (() => { const s = new THREE.Shape(); [[-0.15, 0.15], [0.15, 0.15], [0.15, 0.09], [-0.05, -0.09], [0.15, -0.09], [0.15, -0.15], [-0.15, -0.15], [-0.15, -0.09], [0.05, 0.09], [-0.15, 0.09]].forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 1 }); })();
  const zs = [0.55, 0.75, 1.0].map((k, i) => { const m = mesh(zGeo, M.zz, 'z'); m.userData.k = k; m.userData.i = i; fx.zzz.add(m); return m; });
  // вопросы
  fx.q = fxGroup('fx_question', [0, 0, 0]);
  const qGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.12, 0.13, 0), V(-0.08, 0.24, 0), V(0.05, 0.28, 0), V(0.15, 0.2, 0), V(0.11, 0.08, 0), V(0.0, 0.01, 0), V(0, -0.08, 0)]), 40, 0.04, 10, false);
  const qs = [[1.25, 1.45, 0.5, 1.0, -0.2], [-1.15, 1.55, 0.35, 0.7, 0.25]].map(q => { const g = group('question', [q[0], q[1], q[2]]); g.add(mesh(qGeo, M.q, 'q')); g.add(ell(M.q, [0.05, 0.05, 0.05], [0, -0.2, 0], 'q_dot')); g.scale.setScalar(q[3]); g.rotation.z = q[4]; g.userData = { base: q.slice() }; fx.q.add(g); return g; });
  // «думаю» — пузырьки мысли
  fx.dots = fxGroup('fx_thought', [0, 0, 0]);
  const dots = [[1.3, 1.25, 0.65, 0.08], [1.55, 1.55, 0.6, 0.11], [1.88, 1.9, 0.55, 0.15]].map((d, i) => { const m = ell(M.body, [d[3], d[3], d[3]], [d[0], d[1], d[2]], 'thought'); m.userData = { r: d[3], i }; fx.dots.add(m); return m; });
  // капли (для «растерян» — лёгкий дождик)
  fx.rain = fxGroup('fx_rain', [0, -1.15, 0.4]);
  const drops = [[-0.5, 0], [0.1, -0.15], [0.6, -0.05]].map((d, i) => { const g = group('drop', [d[0], d[1], 0]); g.add(ell(M.drop, [0.07, 0.11, 0.07], [0, 0, 0], 'drop')); g.userData = { x: d[0], y: d[1], i }; fx.rain.add(g); return g; });

  sats.forEach(m => character.add(m));
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); sats.forEach(m => { m.receiveShadow = false; });
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // ---------- состояния ----------
  // hands: [подъём, разворот]; col: цвет тела; eyes; mouth; brows: [L, R] (угол, 0 — нет бровей); fx: какие эффекты видны
  const P = {
    hello:    { col: 0xeeeff3, eyes: 'open', mouth: 'open', brows: [0, 0], hands: [[0, 0], [0, 0]], tilt: 0, look: [0, 0], fx: { spark: 0.8 } },
    idle:     { col: 0xeeeff3, eyes: 'open', mouth: 'w', brows: [0, 0], hands: [[0, 0], [0, 0]], tilt: 0, look: [0, 0], fx: {} },
    think:    { col: 0xe9eef6, eyes: 'open', mouth: 'o', brows: [0, 0], hands: [[0, 0], [0, 0]], tilt: 0.08, look: [0.7, 0.8], fx: { dots: 1 } },
    happy:    { col: 0xf3f4fa, eyes: 'happy', mouth: 'open', brows: [0, 0], hands: [[0, 0], [0, 0]], tilt: 0, look: [0, 0], fx: { rainbow: 1, confetti: 1 } },
    angry:    { col: 0x7a8597, eyes: 'open', mouth: 'shout', brows: [0.5, 0.5], hands: [[0, 0], [0, 0]], tilt: 0, look: [0, -0.2], fx: { bolts: 1, anger: 1, rain: 1 } },
    confused: { col: 0xdde2ec, eyes: 'open', mouth: 'wavy', brows: [-0.3, 0.3], hands: [[0, 0], [0, 0]], tilt: 0.1, look: [-0.3, 0.3], fx: { q: 1 } },
    sleep:    { col: 0xe6ebf6, eyes: 'closed', mouth: 'w', brows: [0, 0], hands: [[0, 0], [0, 0]], tilt: 0.06, look: [0, 0], fx: { zzz: 1 } }
  };

  const FX = Object.keys(fx);
  // пружины (как в анимированных стикерах Telegram: перелёт и мягкая остановка)
  function spring(x, k, d) { return { x, v: 0, t: x, k: k || 170, d: d || 12 }; }
  function stepSpring(s, dt) { const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n; for (let i = 0; i < n; i++) { const a = -s.k * (s.x - s.t) - s.d * s.v; s.v += a * h; s.x += s.v * h; } }
  const S = { squash: spring(0, 260, 9), hop: spring(0, 120, 9), brL: spring(0), brR: spring(0), tilt: spring(0, 90, 11), lookX: spring(0, 120, 14), lookY: spring(0, 120, 14) };
  const HS = hands.map(() => ({ a: spring(-0.65, 140, 11), y: spring(0, 140, 12) }));
  const FS = {}; FX.forEach(k => { FS[k] = spring(0, 220, 13); });
  const col = new THREE.Color(0xeeeff3).convertSRGBToLinear(), colT = col.clone();
  let target = P.idle, poseName = 'idle', pokeT = 0, stT = 0, lastCycle = -1;
  function setVis(p) {
    Object.keys(mouths).forEach(k => { mouths[k].visible = k === p.mouth; });
    eyes.forEach(e => { e.open.visible = p.eyes === 'open'; e.happy.visible = p.eyes === 'happy'; e.closed.visible = p.eyes === 'closed'; });
  }
  function setPose(name, quiet) {
    if (!P[name]) return; const changed = name !== poseName; target = P[name]; poseName = name; setVis(target); if (changed) { stT = 0; lastCycle = -1; if (name === 'happy') confettiBurst(); }
    colT.setHex(target.col).convertSRGBToLinear();
    S.brL.t = target.brows[0]; S.brR.t = target.brows[1]; S.tilt.t = target.tilt;
    hands.forEach((h, i) => { HS[i].a.t = target.hands[i][0]; HS[i].y.t = target.hands[i][1]; });
    FX.forEach(k => { FS[k].t = target.fx[k] || 0; });
    if (changed && !quiet) { S.squash.v += 3.2; S.hop.v += 2.2; } // «поп» при смене состояния
  }
  function snap(name) {
    setPose(name, true); stT = 0; col.copy(colT);
    [S.brL, S.brR, S.tilt].forEach(s => { s.x = s.t; s.v = 0; });
    HS.forEach(h => { h.a.x = h.a.t; h.y.x = h.y.t; h.a.v = h.y.v = 0; });
    FX.forEach(k => { FS[k].x = FS[k].t; FS[k].v = 0; });
    S.lookX.x = S.lookX.t = target.look[0]; S.lookY.x = S.lookY.t = target.look[1];
    update(0, 1.0, { motion: false });
  }
  function poke() { S.squash.v += 5; S.hop.v += 4; pokeT = 0.45; }
  // ---------- индивидуальные «постановки» состояний (как анимированные стикеры) ----------
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
  const bump = (p, a, b) => (p > a && p < b) ? Math.sin((p - a) / (b - a) * Math.PI) : 0;
  const ramp = (p, a, b) => ease((p - a) / (b - a));
  const _sv = V(0, 0, 0);
  function update(dt, t, o) {
    o = o || {}; const motion = o.motion !== false;
    stT += Math.max(0, dt);
    [S.squash, S.hop, S.brL, S.brR, S.tilt, S.lookX, S.lookY].forEach(s => stepSpring(s, dt));
    FX.forEach(k => stepSpring(FS[k], dt));
    col.lerp(colT, 1 - Math.exp(-Math.max(0, dt) * 4)); M.body.color.copy(col); M.skin.color.copy(col);
    const T = stT;
    let y = 0, x = 0, s = S.squash.x * 0.09, rz = S.tilt.x, rx = 0, ry = 0, puff = 1;
    let look = null, eyeK = [1, 1], wink = [false, false], mouth = target.mouth, blinkOK = true;
    const satT = (SHAPE.sats || []).map(b => V(b[0], b[1], b[2]));
    const fxp = { bolt: 0, spark: 1, anger: 1, qL: 1, qR: 1 };
    if (motion) {
      if (poseName === 'idle') {
        // спокойное дыхание, оглядывается по сторонам, раз в цикл — лёгкий «подпрыг» с подмигиванием
        const P6 = (T % 6) / 6;
        y += Math.sin(T * 1.6) * 0.08; s += -Math.cos(T * 1.6) * 0.016 + bump(P6, 0.78, 0.86) * 0.12 - bump(P6, 0.86, 0.95) * 0.06;
        y += bump(P6, 0.84, 0.94) * 0.22;
        if (P6 > 0.32 && P6 < 0.44) look = [-0.85, 0.15]; else if (P6 > 0.48 && P6 < 0.6) look = [0.85, 0.15];
        if (P6 > 0.88 && P6 < 0.96) wink[1] = true;
        rz += Math.sin(T * 0.7) * 0.03;
        satT.forEach((v, i) => { v.x += Math.cos(T * 0.9 + i * 2) * 0.12; v.y += Math.sin(T * 1.2 + i * 2) * 0.12; });
      } else if (poseName === 'hello') {
        // подготовка → прыжок с пируэтом → покачивание «привет» и подмигивание; спутники облетают вокруг
        const P3 = (T % 3.2) / 3.2;
        s += bump(P3, 0.0, 0.1) * 0.22 - bump(P3, 0.1, 0.32) * 0.1 + bump(P3, 0.32, 0.42) * 0.18;
        y += bump(P3, 0.1, 0.34) * 0.75 - bump(P3, 0.0, 0.1) * 0.08;
        ry += ramp(P3, 0.12, 0.32) * Math.PI * 2;
        rz += Math.sin((P3 - 0.42) * Math.PI * 6) * 0.16 * bump(P3, 0.42, 0.92);
        y += Math.abs(Math.sin(T * 6)) * 0.06 * bump(P3, 0.42, 0.92);
        if (P3 > 0.62 && P3 < 0.74) { wink[1] = true; mouth = 'w'; }
        const orb = ramp(P3, 0.05, 0.6) * Math.PI * 2;
        satT.forEach((v, i) => { const r = 2.4 + i * 0.5, a = orb + Math.PI + i * 0.7; if (P3 < 0.62) { v.set(Math.cos(a) * r, -0.7 + Math.sin(a * 2) * 0.25, Math.sin(a) * 1.3 * (i ? 0.8 : 1)); } });
      } else if (poseName === 'think') {
        // задумчиво наклоняется и медленно поворачивается, глаза «сканируют», спутники кружат как индикатор загрузки
        rz += 0.06 + Math.sin(T * 0.8) * 0.06; ry += Math.sin(T * 0.5) * 0.18;
        y += Math.sin(T * 1.3) * 0.05; s += Math.sin(T * 1.3) * 0.01;
        look = [Math.sin(T * 1.4) * 0.85, 0.65 + Math.sin(T * 2.8) * 0.15];
        const P4 = (T % 4) / 4; s += bump(P4, 0.82, 0.9) * 0.09; y -= bump(P4, 0.82, 0.9) * 0.06;
        satT.forEach((v, i) => { const a = T * 2.2 - i * 0.7; v.set(Math.cos(a) * 2.5, -0.45 - Math.sin(a) * 0.75, Math.sin(a) * 1.35); });
      } else if (poseName === 'happy') {
        // вход: присел → большой прыжок (радуга раскрывается, залп конфетти) → смачное приземление; дальше — танец прыжками влево-вправо
        if (T < 1.0) {
          const e = T;
          s += bump(e, 0.0, 0.16) * 0.28 - bump(e, 0.16, 0.5) * 0.16 + bump(e, 0.62, 0.86) * 0.32 - bump(e, 0.86, 1.0) * 0.08;
          y += -bump(e, 0.0, 0.16) * 0.12 + (e > 0.16 && e < 0.64 ? Math.sin((e - 0.16) / 0.48 * Math.PI) * 1.25 : 0) - bump(e, 0.64, 0.86) * 0.1;
          rz += Math.sin(e * Math.PI * 2) * 0.06;
        } else {
          const T2 = T - 1.0, P = (T2 % 1.1) / 1.1, side = P < 0.5 ? -1 : 1, Q = P < 0.5 ? P / 0.5 : (P - 0.5) / 0.5;
          const air = clamp01((Q - 0.12) / 0.7), h = (Q > 0.12 && Q < 0.82) ? 4 * air * (1 - air) : 0;
          y += h * 0.5 - bump(Q, 0.82, 1.0) * 0.06;
          x += side * 0.22 * Math.sin(air * Math.PI);
          rz += -side * 0.14 * Math.sin(air * Math.PI);
          s += bump(Q, 0.0, 0.12) * 0.16 - h * 0.07 + bump(Q, 0.82, 1.0) * 0.22;
          if (Q > 0.82) mouth = 'w';
        }
                satT.forEach((v, i) => { const P = ((T + i * 0.55) % 1.1) / 1.1; const hh = P < 0.7 ? Math.sin(P / 0.7 * Math.PI) : 0; v.y += hh * 0.45; v.x += (i ? 1 : -1) * hh * 0.1; });
      } else if (poseName === 'angry') {
        // надувается → удар вниз с молнией → трясётся → дрожит от злости
        const P = (T % 1.8) / 1.8;
        puff = 1 + ramp(P, 0.0, 0.2) * 0.07 * (1 - ramp(P, 0.24, 0.4)) + Math.sin(T * 9) * 0.008;
        y += ramp(P, 0, 0.2) * 0.12 * (1 - ramp(P, 0.2, 0.27)) - bump(P, 0.2, 0.4) * 0.2;
        s += bump(P, 0.2, 0.36) * 0.26 - bump(P, 0.0, 0.2) * 0.05;
        const shake = P > 0.27 && P < 0.85 ? (1 - (P - 0.27) / 0.58) : 0.08;
        x += Math.sin(T * 52) * 0.07 * shake; rz += Math.sin(T * 37) * 0.04 * shake;
        fxp.bolt = bump(P, 0.18, 0.5); fxp.anger = 1 + bump(P, 0.18, 0.4) * 0.6;
        satT.forEach((v, i) => { v.x += Math.sin(T * 47 + i) * 0.06 * shake; v.y += Math.sin(T * 41 + i * 2) * 0.05 * shake - bump(P, 0.2, 0.4) * 0.12; });
      } else if (poseName === 'confused') {
        // «а?» — наклон влево, пожимает плечами, наклон вправо; глаза по очереди большие, вопросы — по очереди
        const P = (T % 3.6) / 3.6, side = P < 0.5 ? -1 : 1, Q = P < 0.5 ? P / 0.5 : (P - 0.5) / 0.5;
        rz += side * 0.2 * bump(Q, 0.05, 0.95) * 1.0;
        s += bump(Q, 0.42, 0.56) * 0.12; y += bump(Q, 0.5, 0.66) * 0.18 + Math.sin(T * 2) * 0.03;
        look = [side * 0.7, 0.45];
        const big = 1 + 0.22 * bump(Q, 0.05, 0.95); eyeK = side < 0 ? [big, 1] : [1, big];
        fxp.qL = side < 0 ? 0.4 + bump(Q, 0.05, 0.6) * 0.9 : 0.3; fxp.qR = side > 0 ? 0.4 + bump(Q, 0.05, 0.6) * 0.9 : 0.3;
        satT.forEach((v, i) => { const a = T * 1.1 + i * 3; v.x += Math.sin(a) * 0.25; v.y += Math.sin(a * 2) * 0.12; });
      } else if (poseName === 'sleep') {
        // глубокое дыхание, опускается ниже, покачивается как маятник, клюёт носом и вздрагивает; на вдохе — «храп»
        const P = (T % 5.5) / 5.5;
        y += -0.22 + Math.sin(T * 1.2) * 0.06; s += Math.sin(T * 1.2) * 0.045;
        rz += Math.sin(T * 0.6) * 0.07;
        rx += ramp(P, 0.62, 0.82) * 0.3 * (1 - ramp(P, 0.84, 0.88)); y -= ramp(P, 0.62, 0.82) * 0.1 * (1 - ramp(P, 0.84, 0.88));
        if (P > 0.84 && P < 0.9) { s -= 0.06; }
        if (Math.sin(T * 1.2) > 0.85) mouth = 'o';
        blinkOK = false;
        satT.forEach((v, i) => { v.y += -0.2 + Math.sin(T * 0.7 + i) * 0.08; v.x += Math.sin(T * 0.4 + i) * 0.1; });
      }
    }
    if (o.drift) rz += -o.drift * 0.12;
    // спутники плавно догоняют свои цели
    sats.forEach((m, i) => { const k = motion ? 1 - Math.exp(-Math.max(0, dt) * 9) : 1; m.position.lerp(satT[i], k); });
    y += S.hop.x * 0.12;
    character.position.set(x, BASE_Y + y, 0); character.rotation.set(rx, ry, rz);
    squash.scale.set((1 + s * 0.6) * puff, (1 - s) * puff, (1 + s * 0.6) * puff);
    // брови
    eyes.forEach(e => { const b = e.sx < 0 ? S.brL.x : S.brR.x; e.browPivot.rotation.z = e.sx * b; const vis = Math.min(1, Math.abs(b) * 4); e.browPivot.scale.set(Math.max(0.001, vis), Math.max(0.001, vis), 1); });
    // взгляд
    const free = poseName === 'idle' || poseName === 'hello';
    const lk = look || ((free && o.look) ? [Math.max(-1, Math.min(1, o.look[0])), Math.max(-1, Math.min(1, -o.look[1]))] : target.look);
    S.lookX.t = lk[0]; S.lookY.t = lk[1];
    eyes.forEach(e => { e.pupil.position.set(S.lookX.x * 0.035, S.lookY.x * 0.035, 0); });
    // моргание, подмигивание, размер глаз
    const blink = motion && blinkOK && target.eyes === 'open' && ((t + 1.3) % 3.8) < 0.12;
    eyes.forEach((e, i) => {
      const k = eyeK[i] || 1;
      const wk = wink[i] || pokeT > 0;
      e.open.visible = target.eyes === 'open' && !wk; e.happy.visible = target.eyes === 'happy' || (target.eyes === 'open' && wk); e.closed.visible = target.eyes === 'closed';
      e.open.scale.set(k, k * (blink ? 0.12 : 1), 1);
    });
    if (pokeT > 0) pokeT -= dt;
    Object.keys(mouths).forEach(m => { mouths[m].visible = m === mouth; });
    // эффекты
    FX.forEach(k => { const v = Math.max(0.001, FS[k].x); fx[k].scale.setScalar(v); fx[k].visible = FS[k].x > 0.01 || FS[k].t > 0; });
    {
      const on = FS.rainbow.t > 0, prog = on ? (motion ? ease(Math.min(1, stT / 0.7)) : 1) : clamp01(FS.rainbow.x);
      fx.rainbow.scale.setScalar(1); fx.rainbow.visible = prog > 0.01;
      rainBands.forEach((b, i) => { const k = clamp01(prog * 1.15 - i * 0.03); b.geometry.setDrawRange(0, Math.round(k * RB_SEG) * 6); });
    }
    if (motion && fx.confetti.visible) {
      const d = Math.min(0.05, Math.max(0, dt));
      conf.forEach(c => { c.v.y -= 4.2 * d; c.v.multiplyScalar(1 - 1.4 * d); c.v.y = Math.max(c.v.y, -1.1); c.p.addScaledVector(c.v, d); c.p.x += Math.sin(t * 3 + c.ph) * 0.006;
        c.m.visible = c.p.y > -2.4;
        c.m.position.copy(c.p); c.m.rotation.x += c.spin.x * d; c.m.rotation.y += c.spin.y * d; c.m.rotation.z += c.spin.z * d; });
    } else if (!motion) { confettiStatic(); fx.confetti.visible = false; }
    if (motion) hearts.forEach((h, i) => { const ph = ((t * 0.42 + h.userData.o) % 1); h.position.set(h.userData.x + Math.sin(t * 2.2 + i) * 0.15, 0.6 + ph * 2.2, 0); h.rotation.z = Math.sin(t * 3 + i) * 0.25; h.scale.setScalar(Math.max(0.001, Math.sin(ph * Math.PI) * 1.2)); });
    else hearts.forEach((h, i) => { const ph = 0.3 + i * 0.15; h.position.set(h.userData.x, 0.6 + ph * 2.2, 0); h.scale.setScalar(Math.sin(ph * Math.PI) * 1.2); });
    blushes.forEach(b => { const k = poseName === 'happy' && motion ? 1 + 0.12 * Math.sin(t * 6) : 1; b.scale.set(k, k, 1); });
    if (motion) {
      fx.bolts.children.forEach((b, i) => { const base = [0.75, 1.1, 0.7][i]; const on = fxp.bolt > 0.05 ? fxp.bolt : (((t * 3 + i * 0.7) % 1.6) < 0.25 ? 0.5 : 0.08); b.scale.set(base * (0.6 + on * 0.5), base * (0.15 + on * 1.0), base); b.position.y = (1 - on) * 0.25 + (i === 1 ? -0.08 : 0); });
      fx.anger.scale.multiplyScalar(fxp.anger);
      sparks.forEach((g, i) => { const k = 0.5 + 0.5 * Math.sin(t * 4 + i * 1.7); g.scale.setScalar(Math.max(0.001, g.userData.s * (0.3 + 0.7 * k) * fxp.spark)); g.rotation.z = t * 0.8 + i; });
      zs.forEach(z => { const ph = ((t * 0.45 + z.userData.i / 3) % 1); z.position.set(ph * 0.7, ph * 1.3, 0); z.scale.setScalar(Math.max(0.001, z.userData.k * Math.sin(ph * Math.PI))); z.rotation.z = -0.25 + Math.sin(t * 2 + z.userData.i) * 0.15; });
      qs.forEach((g, i) => { const b = g.userData.base, k = i === 0 ? fxp.qR : fxp.qL; g.position.y = b[1] + Math.sin(t * 3 + i) * 0.08; g.rotation.z = b[4] + Math.sin(t * 2.4 + i) * 0.2; g.scale.setScalar(Math.max(0.001, b[3] * k)); });
      // пузырьки мыслей поднимаются по очереди и лопаются
      dots.forEach(d => { const ph = ((t * 0.5 + d.userData.i / 3) % 1); d.position.set(1.25 + ph * 0.75, 1.15 + ph * 0.95, 0.6); d.scale.setScalar(Math.max(0.001, d.userData.r * 1.4 * Math.sin(ph * Math.PI) * (0.6 + ph))); });
      drops.forEach(d => { const sp = poseName === 'angry' ? 1.6 : 0.9, ph = (t * sp + d.userData.i * 0.33) % 1; d.position.y = d.userData.y - ph * 1.0; d.scale.setScalar(Math.max(0.001, Math.sin(ph * Math.PI))); });
      fx.rainbow.rotation.z = 0;
    } else {
      zs.forEach(z => { const ph = z.userData.i / 3 + 0.15; z.position.set(ph * 0.7, ph * 1.3, 0); z.scale.setScalar(z.userData.k * Math.sin(ph * Math.PI)); z.rotation.z = -0.25; });
      drops.forEach(d => { d.position.y = d.userData.y - d.userData.i * 0.25; });
      dots.forEach(d => { const ph = d.userData.i / 3 + 0.2; d.position.set(1.25 + ph * 0.75, 1.15 + ph * 0.95, 0.6); d.scale.setScalar(d.userData.r * 1.2); });
    }
  }

  snap('idle');
  return { root, pedestal, character, setPose, snap, update, poke, poses: Object.keys(P) };
}
if (typeof module !== 'undefined') module.exports = { buildCloud, CLOUD_SHAPES };
