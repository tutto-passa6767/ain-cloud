// @ts-nocheck
// Барыс — процедурная модель из прототипа (mascot/barys-model.js), подключена без изменений геометрии и поз.
// Отличие от прототипа: в Three.js r152+ цвета материалов уже переводятся из sRGB в линейное пространство,
// поэтому явный convertSRGBToLinear выполняется только при выключенном ColorManagement.
// Барыс — 3D-маскот AIN Cloud. Процедурная модель (Three.js r128).
// buildBarys(THREE) -> { root, rig, setPose(name), update(dt, t, opts) }
export function buildBarys(THREE) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const mat = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r === undefined ? 0.78 : r, metalness: 0 });
  const M = {
    fur: mat(0xf4f6fa, 0.74), spot: mat(0xa9b6c9), spotDark: mat(0x7f90a9), inner: mat(0xe2e8f1),
    eye: mat(0x1c2638, 0.25), white: mat(0xffffff, 0.2), emblem: mat(0xe1e7f0), emblemInk: mat(0x8292ab),
    pad: mat(0x95a5bb), board: mat(0xc3cdda, 0.66), pit: mat(0xa8b5c6, 0.8),
    stoneBlue: mat(0x8fb7dc, 0.32), stoneGrey: mat(0x7b8593, 0.32), pedestal: mat(0xcfdbe8, 0.9), pedestalEdge: mat(0xbccbdc, 0.9)
  };
  const toLinear = (c) => { if (!(THREE.ColorManagement && THREE.ColorManagement.enabled)) c.convertSRGBToLinear(); };
  Object.keys(M).forEach(k => { M[k].name = k; toLinear(M[k].color); });
  const SPH = new THREE.SphereGeometry(1, 48, 32);
  const mesh = (geo, m, name) => { const o = new THREE.Mesh(geo, m); if (name) o.name = name; o.castShadow = true; o.receiveShadow = true; return o; };
  const ell = (m, s, p, name) => { const o = mesh(SPH, m, name); o.scale.set(s[0], s[1], s[2]); o.position.set(p[0], p[1], p[2]); return o; };
  const group = (name, p) => { const g = new THREE.Group(); g.name = name; if (p) g.position.set(p[0], p[1], p[2]); return g; };
  let seed = 7;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  // Точка и нормаль на эллипсоиде по направлению
  function onEll(c, r, d) {
    const n0 = V(d[0], d[1], d[2]).normalize();
    const k = 1 / Math.sqrt((n0.x / r[0]) ** 2 + (n0.y / r[1]) ** 2 + (n0.z / r[2]) ** 2);
    const p = n0.clone().multiplyScalar(k);
    const n = V(p.x / r[0] ** 2, p.y / r[1] ** 2, p.z / r[2] ** 2).normalize();
    return { p: p.add(V(c[0], c[1], c[2])), n };
  }
  const Z = V(0, 0, 1);
  function spotsOn(parent, c, r, list, m, flat) {
    list.forEach(s => {
      const { p, n } = onEll(c, r, s);
      const size = s[3];
      const o = mesh(SPH, m || M.spot, 'spot');
      o.scale.set(size * (s[4] || 1), size, size * (flat || 0.2));
      o.quaternion.setFromUnitVectors(Z, n);
      o.position.copy(p).addScaledVector(n, -size * 0.06);
      parent.add(o);
    });
  }

  const root = group('Barys');
  // ---------- Подставка ----------
  const pedestal = group('Pedestal');
  const ped1 = mesh(new THREE.CylinderGeometry(3.2, 3.25, 0.24, 96), M.pedestal, 'pedestal_top'); ped1.position.y = 0.12;
  const ped2 = mesh(new THREE.CylinderGeometry(3.42, 3.46, 0.08, 96), M.pedestalEdge, 'pedestal_base'); ped2.position.y = 0.04;
  pedestal.add(ped1, ped2); root.add(pedestal);

  // ---------- Доска тогыз кумалак ----------
  const board = group('TogyzKumalak', [0, 0.24, 2.12]);
  function roundRect(w, d, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  }
  const halfGeo = new THREE.ExtrudeGeometry(roundRect(3.5, 0.5, 0.2), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4, curveSegments: 10 });
  halfGeo.rotateX(-Math.PI / 2);
  const pitGeo = new THREE.CylinderGeometry(0.125, 0.11, 0.02, 32);
  const kazanGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.02, 32);
  const STONE = new THREE.SphereGeometry(1, 20, 14);
  [-0.29, 0.29].forEach((zz, side) => {
    const half = group(side ? 'Board_near' : 'Board_far', [0, 0, zz]);
    const b = mesh(halfGeo, M.board, 'board'); half.add(b);
    const top = 0.135;
    for (let i = 0; i < 9; i++) {
      const x = -1.5 + i * 0.335;
      const pit = mesh(pitGeo, M.pit, 'otau'); pit.position.set(x - 0.08, top, 0); half.add(pit);
      const n = Math.floor(rnd() * 4) + 1;
      for (let j = 0; j < n; j++) {
        const st = mesh(STONE, rnd() > 0.45 ? M.stoneBlue : M.stoneGrey, 'kumalak');
        const a = rnd() * 6.28, rr = rnd() * 0.06;
        st.scale.set(0.045, 0.03, 0.035); st.rotation.y = rnd() * 3;
        st.position.set(x - 0.08 + Math.cos(a) * rr, top + 0.025 + (j > 2 ? 0.02 : 0), Math.sin(a) * rr);
        half.add(st);
      }
    }
    const kz = mesh(kazanGeo, M.pit, 'kazan'); kz.scale.set(1, 1, 1); kz.position.set(1.52, top, 0); half.add(kz);
    for (let j = 0; j < 6; j++) {
      const st = mesh(STONE, rnd() > 0.5 ? M.stoneBlue : M.stoneGrey, 'kumalak');
      st.scale.set(0.045, 0.03, 0.035); st.position.set(1.52 + (rnd() - 0.5) * 0.17, top + 0.025, (rnd() - 0.5) * 0.17); half.add(st);
    }
    board.add(half);
  });
  // доска тогыз кумалак убрана по решению заказчика (объект остаётся в коде, но не добавляется в сцену)

  // ---------- Персонаж ----------
  const char = group('Character');
  root.add(char);
  const bodyC = [0, 1.48, 0], bodyR = [1.15, 1.25, 1.0];
  const torso = group('Torso');
  // обтекаемое тело: мягкие покатые плечи, ровные бока, лёгкое сужение вниз к ногам (тело вращения)
  const BODY_ZS = 0.9;
  const prof = new THREE.SplineCurve([[0, -1.25], [0.5, -1.18], [0.78, -1.0], [0.92, -0.7], [0.99, -0.35], [1.03, 0.0], [1.04, 0.3], [1.0, 0.6], [0.9, 0.88], [0.72, 1.1], [0.45, 1.3], [0, 1.4]].map(a => new THREE.Vector2(a[0], a[1])));
  const BODY_K = 0.82; // укороченное тело: высота профиля × 0.82 от низа
  const profPts = prof.getSpacedPoints(56).map(v => new THREE.Vector2(v.x, -1.25 + (v.y + 1.25) * BODY_K)); profPts[0].x = 0; profPts[profPts.length - 1].x = 0;
  const bodyMesh = mesh(new THREE.LatheGeometry(profPts, 64), M.fur, 'body');
  bodyMesh.position.set(bodyC[0], bodyC[1], bodyC[2]); bodyMesh.scale.z = BODY_ZS; torso.add(bodyMesh);
  const rAtY = y => { // радиус профиля на высоте y (локально)
    if (y <= profPts[0].y || y >= profPts[profPts.length - 1].y) return 0;
    for (let i = 1; i < profPts.length; i++) if (profPts[i].y >= y) { const a = profPts[i - 1], b = profPts[i]; return a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y || 1); }
    return 0;
  };
  function onBody(d) {
    const dir = V(d[0], d[1], d[2]).normalize();
    let lo = 0, hi = 2;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, q = dir.clone().multiplyScalar(m); (Math.hypot(q.x, q.z / BODY_ZS) < rAtY(q.y)) ? lo = m : hi = m; }
    const q = dir.multiplyScalar(lo), h = Math.max(1e-4, Math.hypot(q.x, q.z / BODY_ZS));
    const dr = (rAtY(q.y + 0.01) - rAtY(q.y - 0.01)) / 0.02;
    const n = V(q.x / h, -dr, q.z / (BODY_ZS * BODY_ZS) / h).normalize();
    return { p: q.add(V(bodyC[0], bodyC[1], bodyC[2])), n };
  }
  // пятна на теле (не на груди)
  const bodySpots = [];
  for (let i = 0; i < 70 && bodySpots.length < 34; i++) {
    const d = [rnd() * 2 - 1, rnd() * 1.6 - 0.6, rnd() * 2 - 1];
    const L = Math.hypot(d[0], d[1], d[2]); if (L < 0.3) continue;
    const nz = d[2] / L, nx = d[0] / L;
    if (nz > 0.45 && Math.abs(nx) < 0.62) continue;
    bodySpots.push([d[0], d[1], d[2], 0.07 + rnd() * 0.07]);
  }
  bodySpots.forEach(sp => {
    const { p, n } = onBody(sp); const size = sp[3];
    const o = mesh(SPH, M.spot, 'spot'); o.scale.set(size, size, size * 0.2);
    o.quaternion.setFromUnitVectors(Z, n); o.position.copy(p).addScaledVector(n, -size * 0.012); torso.add(o);
  });
  // шов на животе, как у игрушки
  // эмблема на груди (заглушка: ain.kz / Байтерек — утвердить)
  const em = onBody([0, -0.08, 1]);
  const emblem = group('ChestEmblem'); emblem.position.copy(em.p); emblem.quaternion.setFromUnitVectors(Z, em.n);
  // эмблема Astana Innovations: тёмный диск + фирменный знак (зелёный, #2EF2A3) из SVG-логотипа
  const M_logoBg = mat(0x16233a, 0.55), M_logo = mat(0x2ef2a3, 0.45), M_ring = mat(0xc9d3df, 0.6);
  [M_logoBg, M_logo, M_ring].forEach((m, i) => { m.name = ['logo_bg', 'logo_mark', 'logo_ring'][i]; toLinear(m.color); });
  const disc = mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.04, 64), M_logoBg, 'emblem_disc'); disc.rotation.x = Math.PI / 2; emblem.add(disc);
  const ring = mesh(new THREE.TorusGeometry(0.335, 0.026, 12, 72), M_ring, 'emblem_ring'); ring.position.z = 0.012; emblem.add(ring);
  const LOGO_PATHS = ['M46.3697 27.2576L46.3264 27.6721C46.1166 29.7503 44.4436 31.3772 42.3633 31.5318L4.61463 34.3151C1.94785 34.5131 -0.243613 32.2493 0.0218321 29.5895L1.7071 12.8519C1.91698 10.7736 3.5899 9.1407 5.67023 8.99224L14.9793 8.30566L16.3066 21.4743C16.5164 23.5527 18.1832 25.1794 20.2636 25.334L46.3697 27.2576Z', 'M58.0184 28.1185L46.3699 27.2586L48.0118 10.9355C48.2774 8.27582 46.086 6.01197 43.4192 6.20991L14.9795 8.30677L14.6215 4.73779C14.3561 2.07188 16.5476 -0.185707 19.2081 0.0122256L56.9631 2.78945C59.0431 2.94408 60.7163 4.57083 60.9263 6.65533L62.6118 23.3928C62.8769 26.0525 60.6852 28.3102 58.0184 28.1185Z'];
  function svgShapes(d) {
    const sp = new THREE.ShapePath(), tk = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/g); let i = 0, cmd = '';
    const num = () => parseFloat(tk[i++]);
    while (i < tk.length) {
      if (/[MLCZ]/.test(tk[i])) cmd = tk[i++];
      if (cmd === 'M') { sp.moveTo(num(), num()); cmd = 'L'; }
      else if (cmd === 'L') sp.lineTo(num(), num());
      else if (cmd === 'C') sp.bezierCurveTo(num(), num(), num(), num(), num(), num());
      else if (cmd === 'Z') { /* контур замкнут */ }
    }
    return sp.toShapes(true);
  }
  const logo = group('logo_mark');
  const LOGO_W = 62.65, LOGO_H = 34.33, LOGO_S = 0.46 / LOGO_W;
  LOGO_PATHS.forEach(d => {
    const g = new THREE.ExtrudeGeometry(svgShapes(d), { depth: 1.4, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.35, bevelSegments: 1, curveSegments: 5 });
    g.translate(-LOGO_W / 2, -LOGO_H / 2, 0);
    const m = mesh(g, M_logo, 'logo_part'); m.scale.set(LOGO_S, -LOGO_S, LOGO_S); logo.add(m);
  });
  logo.position.set(0, 0.0, 0.021); emblem.add(logo);
  torso.add(emblem);
  char.add(torso);

  // ---------- Гибкие «трубки» (руки, ноги, хвост) с параллельным переносом рамки ----------
  function makeTube(name, rings, radial, radiusFn, nPts) {
    const g = new THREE.BufferGeometry();
    const n = (rings + 1) * (radial + 1);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const idx = [];
    for (let i = 0; i < rings; i++) for (let j = 0; j < radial; j++) {
      const a0 = i * (radial + 1) + j, a1 = a0 + radial + 1;
      idx.push(a0, a0 + 1, a1, a1, a0 + 1, a1 + 1);
    }
    g.setIndex(idx);
    const m = mesh(g, M.fur, name); m.frustumCulled = false;
    const pts = []; for (let i = 0; i < nPts; i++) pts.push(V(0, -i * 0.1, 0));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const frames = []; for (let i = 0; i <= rings; i++) frames.push({ p: V(0, 0, 0), t: V(0, 0, 0), n: V(0, 0, 0), b: V(0, 0, 0), r: 0 });
    const tube = { mesh: m, curve, frames, rings, radial, radiusFn, spots: [] };
    tube.update = function () {
      const pos = g.attributes.position.array, nor = g.attributes.normal.array;
      let k = 0;
      for (let i = 0; i <= rings; i++) {
        const f = frames[i], t = i / rings;
        curve.getPoint(t, f.p); curve.getTangent(t, f.t);
        if (i === 0) {
          const ref = Math.abs(f.t.z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0);
          f.n.crossVectors(f.t, ref).normalize();
        } else {
          f.n.copy(frames[i - 1].n).addScaledVector(f.t, -frames[i - 1].n.dot(f.t));
          if (f.n.lengthSq() < 1e-8) f.n.copy(frames[i - 1].b); f.n.normalize();
        }
        f.b.crossVectors(f.t, f.n).normalize();
        f.r = radiusFn(t);
        for (let j = 0; j <= radial; j++) {
          const th = j / radial * Math.PI * 2, c = Math.cos(th), s2 = Math.sin(th);
          const nx = c * f.n.x + s2 * f.b.x, ny = c * f.n.y + s2 * f.b.y, nz = c * f.n.z + s2 * f.b.z;
          pos[k] = f.p.x + f.r * nx; pos[k + 1] = f.p.y + f.r * ny; pos[k + 2] = f.p.z + f.r * nz;
          nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz; k += 3;
        }
      }
      g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; g.computeBoundingSphere();
      tube.spots.forEach(sp => {
        const f = frames[Math.round(sp.t * rings)];
        // угол отсчитывается от «наружной» стороны (sideRef), чтобы пятна не крутились
        const a = Math.atan2(f.b.dot(sp.side), f.n.dot(sp.side)) + sp.a;
        const nrm = V(0, 0, 0).addScaledVector(f.n, Math.cos(a)).addScaledVector(f.b, Math.sin(a)).normalize();
        sp.o.scale.set(sp.size, sp.size, sp.size * 0.2);
        sp.o.quaternion.setFromUnitVectors(Z, nrm);
        sp.o.position.copy(f.p).addScaledVector(nrm, f.r - sp.size * 0.012);
      });
    };
    tube.addSpots = function (parent, list, side, matFn) {
      list.forEach((s, i) => { const o = mesh(SPH, matFn ? matFn(i) : M.spot, 'spot'); parent.add(o); tube.spots.push({ t: s[0], a: s[1], size: s[2], side, o }); });
    };
    return tube;
  }
  // двухзвенная IK: от начала (0,0,0) к цели T, сгиб в сторону pole
  const _u = V(0, 0, 0), _w = V(0, 0, 0);
  function solve2(T, pole, L1, L2, outE, outT) {
    _u.copy(T); let d = _u.length();
    d = Math.min(L1 + L2 - 0.002, Math.max(Math.abs(L1 - L2) + 0.05, d)); _u.normalize();
    _w.copy(pole); _w.addScaledVector(_u, -_w.dot(_u)); if (_w.lengthSq() < 1e-6) _w.set(0, 0, -1); _w.normalize();
    const cosA = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    outE.copy(_u).multiplyScalar(cosA * L1).addScaledVector(_w, Math.sqrt(1 - cosA * cosA) * L1);
    outT.copy(_u).multiplyScalar(d);
  }
  function setLimbCurve(tube, E, T, start) {
    const p = tube.curve.points;
    p[0].copy(start || V(0, 0, 0)); p[1].copy(p[0]).lerp(E, 0.5); p[2].copy(E); p[3].copy(E).lerp(T, 0.5); p[4].copy(T);
    tube.update();
  }

  // ---------- Хвост: два положения (сидя — обвивает лапы, стоя — поднят сзади) ----------
  const TAIL_SIT = [[-0.05, 0.8, -0.4], [-0.45, 0.55, -0.92], [-1.15, 0.36, -0.7], [-1.55, 0.3, 0.1], [-1.5, 0.28, 0.9], [-1.1, 0.28, 1.5], [-0.45, 0.3, 1.72]];
  const TAIL_STAND = [[-0.05, 0.8, -0.4], [-0.05, 0.62, -0.95], [0.0, 0.62, -1.45], [0.12, 0.95, -1.85], [0.22, 1.4, -1.95], [0.26, 1.82, -1.72], [0.22, 2.0, -1.4]];
  const tailTube = makeTube('tail', 60, 20, t => 0.235 - 0.02 * t, 7);
  const tail = group('Tail'); tail.add(tailTube.mesh);
  const tailTip = ell(M.fur, [0.215, 0.215, 0.215], [0, 0, 0], 'tail_tip'); tail.add(tailTip);
  tailTube.addSpots(tail, [[0.2, 0.3, 0.085], [0.34, -0.6, 0.08], [0.48, 0.5, 0.085], [0.6, -0.3, 0.08], [0.72, 0.9, 0.08], [0.86, -0.5, 0.075], [0.97, 0.1, 0.12]], V(0, 1, 0), i => i === 6 ? M.spotDark : M.spot);
  char.add(tail);
  function setTail(k) {
    tailTube.curve.points.forEach((p, i) => p.set(
      TAIL_SIT[i][0] + (TAIL_STAND[i][0] - TAIL_SIT[i][0]) * k,
      TAIL_SIT[i][1] + (TAIL_STAND[i][1] - TAIL_SIT[i][1]) * k,
      TAIL_SIT[i][2] + (TAIL_STAND[i][2] - TAIL_SIT[i][2]) * k));
    tailTube.update(); tailTip.position.copy(tailTube.curve.points[6]);
  }

  // ---------- Ноги: короткие, как у игрушки ----------
  const THIGH = 0.32, SHIN = 0.3, LIFT = 0.55;
  function makeLeg(sx) {
    const hip = group(sx < 0 ? 'Leg_L' : 'Leg_R', [sx * 0.55, 0.62, 0.22]);
    const tube = makeTube('leg', 24, 24, t => 0.42 - 0.1 * Math.sqrt(t), 5); hip.add(tube.mesh);
    tube.addSpots(hip, [[0.2, 0.2, 0.09], [0.45, 1.3, 0.08], [0.7, -0.3, 0.075]], V(sx, 0, 0));
    const foot = group('foot'); hip.add(foot);
    foot.add(ell(M.fur, [0.32, 0.32, 0.32], [0, 0, 0], 'foot'));
    const pads = group('pads', [0, -0.3, 0]); pads.rotation.x = Math.PI / 2; foot.add(pads);
    pads.add(ell(M.pad, [0.12, 0.1, 0.03], [0, -0.05, 0], 'pad_main'));
    [[-0.11, 0.1], [0, 0.145], [0.11, 0.1]].forEach(t => pads.add(ell(M.pad, [0.048, 0.048, 0.026], [t[0], t[1], -0.012], 'pad_toe')));
    char.add(hip);
    return { hip, tube, foot, sx };
  }
  const legL = makeLeg(-1), legR = makeLeg(1);
  const _E = V(0, 0, 0), _T = V(0, 0, 0), _tmp = V(0, 0, 0), DOWN = V(0, -1, 0);
  // v: [x, y(над полом), z, pole x, y, z, наклон стопы]
  function applyLeg(L, v, lift) {
    _tmp.set(v[0], v[1] - lift, v[2]).sub(L.hip.position);
    solve2(_tmp, V(v[3], v[4], v[5]), THIGH, SHIN, _E, _T);
    setLimbCurve(L.tube, _E, _T, V(-L.sx * 0.1, 0.5, -0.05));
    L.foot.position.copy(_T);
    L.foot.quaternion.setFromUnitVectors(DOWN, _tmp.copy(_T).sub(_E).normalize());
  }

  // ---------- Руки: короткие и пухлые ----------
  const UPPER = 0.46, FORE = 0.42;
  function makeArm(sx) {
    const sh = group(sx < 0 ? 'Arm_L' : 'Arm_R', [sx * 0.8, 1.72, 0.3]);
    const tube = makeTube('arm', 24, 24, t => 0.265 + 0.035 * t, 5); sh.add(tube.mesh);
    tube.addSpots(sh, [[0.25, 0.2, 0.08], [0.45, 1.2, 0.07], [0.62, -0.4, 0.07], [0.8, 0.7, 0.065]], V(sx, 0, 0));
    const paw = group('paw'); sh.add(paw);
    paw.add(ell(M.fur, [0.3, 0.3, 0.3], [0, 0, 0], 'paw'));
    char.add(sh);
    return { sh, tube, paw, sx };
  }
  const armL = makeArm(-1), armR = makeArm(1);
  function applyArm(A, v, off) {
    _tmp.set(v[0] + (off ? off[0] : 0), v[1] + (off ? off[1] : 0), v[2]).sub(A.sh.position);
    solve2(_tmp, V(v[3], v[4], v[5]), UPPER, FORE, _E, _T);
    setLimbCurve(A.tube, _E, _T, V(-A.sx * 0.3, 0.02, -0.02));
    A.paw.position.copy(_T);
    A.paw.quaternion.setFromUnitVectors(DOWN, _tmp.copy(_T).sub(_E).normalize());
  }

  // голова
  const neck = group('Head', [0, 2.05, 0.05]);
  const head = group('head_inner'); neck.add(head);
  const hc = [0, 0.82, 0], hr = [1.12, 0.98, 1.0];
  head.add(ell(M.fur, hr, hc, 'head'));
  [-1, 1].forEach(sx => head.add(ell(M.fur, [0.44, 0.4, 0.42], [sx * 0.58, 0.48, 0.52], 'cheek')));
  head.add(ell(M.fur, [0.42, 0.3, 0.3], [0, 0.46, 0.9], 'muzzle'));
  head.add(ell(M.fur, [0.2, 0.14, 0.16], [0, 0.3, 0.86], 'chin'));
  const nose = ell(M.spotDark, [0.12, 0.072, 0.07], [0, 0.6, 1.17], 'nose'); head.add(nose);
  const phil = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), M.eye, 'philtrum'); phil.position.set(0, 0.5, 1.185); head.add(phil);
  // рты
  const mouths = {};
  const mN = group('mouth_neutral', [0, 0.455, 1.175]);
  const arcGeo = new THREE.TorusGeometry(0.065, 0.014, 8, 20, Math.PI);
  [-0.065, 0.065].forEach(x => { const a = mesh(arcGeo, M.eye, 'mouth_arc'); a.position.x = x; a.rotation.z = Math.PI; a.scale.y = 0.55; mN.add(a); });
  mouths.neutral = mN;
  const mS = group('mouth_smile', [0, 0.45, 1.17]);
  const big = mesh(new THREE.TorusGeometry(0.13, 0.017, 8, 24, Math.PI), M.eye, 'mouth_smile'); big.rotation.z = Math.PI; big.scale.y = 0.75; mS.add(big); mouths.smile = mS;
  const mO = group('mouth_open', [0, 0.43, 1.185]); mO.add(ell(M.eye, [0.1, 0.07, 0.035], [0, 0, 0], 'mouth_open')); mouths.open = mO;
  const mF = group('mouth_frown', [0, 0.41, 1.165]);
  const fr = mesh(new THREE.TorusGeometry(0.1, 0.015, 8, 24, Math.PI), M.eye, 'mouth_frown'); fr.scale.y = 0.45; mF.add(fr); mouths.frown = mF;
  Object.values(mouths).forEach(m => { m.rotation.x = -0.15; head.add(m); });

  // глаза
  const eyes = { L: {}, R: {} };
  [-1, 1].forEach(sx => {
    const E = sx < 0 ? eyes.L : eyes.R;
    const at = onEll(hc, hr, [sx * 0.36, 0.08, 0.93]);
    const g = group(sx < 0 ? 'Eye_L' : 'Eye_R'); g.position.copy(at.p); g.quaternion.setFromUnitVectors(Z, at.n); head.add(g);
    const patch = ell(M.spot, [0.29, 0.21, 0.07], [0, -0.01, -0.01], 'eye_patch'); patch.rotation.z = sx * 0.12; g.add(patch);
    const open = group('eye_open'); g.add(open);
    open.add(ell(M.eye, [0.13, 0.125, 0.06], [sx * 0.02, -0.01, 0.04], 'pupil'));
    open.add(ell(M.white, [0.038, 0.038, 0.02], [sx * 0.02 + 0.04, 0.035, 0.09], 'glint'));
    open.add(ell(M.white, [0.016, 0.016, 0.01], [sx * 0.02 - 0.035, -0.04, 0.09], 'glint_small'));
    // веко (белое), делает взгляд сосредоточенным
    const lidPivot = group('lid', [0, 0.05, 0.03]); open.add(lidPivot);
    const lid = ell(M.fur, [0.19, 0.09, 0.07], [0, 0.07, 0.02], 'eyelid'); lidPivot.add(lid);
    const brow = ell(M.spotDark, [0.17, 0.028, 0.03], [0, 0.0, 0.07], 'brow'); lidPivot.add(brow);
    const happy = group('eye_happy'); g.add(happy);
    const hArc = mesh(new THREE.TorusGeometry(0.09, 0.022, 8, 20, Math.PI), M.eye, 'eye_happy_arc'); hArc.position.z = 0.06; happy.add(hArc);
    const closed = group('eye_closed'); g.add(closed);
    const cArc = mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 20, Math.PI), M.eye, 'eye_closed_arc'); cArc.rotation.z = Math.PI; cArc.scale.y = 0.6; cArc.position.set(0, 0.01, 0.06); closed.add(cArc);
    Object.assign(E, { g, open, happy, closed, lidPivot, sx });
  });
  // уши
  [-1, 1].forEach(sx => {
    const ear = group(sx < 0 ? 'Ear_L' : 'Ear_R', [sx * 0.66, 1.62, -0.05]);
    ear.rotation.set(-0.1, 0, -sx * 0.42);
    ear.add(ell(M.spot, [0.31, 0.3, 0.15], [0, 0, 0], 'ear'));
    ear.add(ell(M.inner, [0.19, 0.18, 0.08], [0, -0.02, 0.09], 'ear_inner'));
    head.add(ear);
  });
  // пятна на голове
  spotsOn(head, hc, hr, [
    [0, 1, 0.35, 0.11], [0.3, 0.95, 0.45, 0.085], [-0.3, 0.95, 0.45, 0.085], [0.55, 0.8, 0.2, 0.1], [-0.55, 0.8, 0.2, 0.1],
    [0.15, 0.85, 0.75, 0.065], [-0.15, 0.85, 0.75, 0.065], [0.85, 0.5, 0.15, 0.09], [-0.85, 0.5, 0.15, 0.09],
    [0.95, 0.15, -0.1, 0.1], [-0.95, 0.15, -0.1, 0.1], [0.4, 0.9, -0.4, 0.1], [-0.4, 0.9, -0.4, 0.1], [0, 0.7, -0.8, 0.12],
    [0.7, 0.3, -0.7, 0.1], [-0.7, 0.3, -0.7, 0.1], [0.62, 0.62, 0.48, 0.06], [-0.62, 0.62, 0.48, 0.06]
  ]);
  // крупные «румяна» на щеках
  [-1, 1].forEach(sx => spotsOn(head, [sx * 0.58, 0.48, 0.52], [0.44, 0.4, 0.42], [[sx * 0.85, 0.1, 0.55, 0.17]], M.spot, 0.12));
  char.add(neck);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // ---------- Позы ----------
  // руки: [лапа x, y, z, локоть x, y, z]; ноги: [стопа x, y над полом, z, колено x, y, z, наклон стопы]; stand: 0 — сидит, 1 — стоит
  const ARM_SIT_L = [-0.86, 0.98, 0.78, -1, 0, -0.6], ARM_SIT_R = [0.86, 0.98, 0.78, 1, 0, -0.6];
  const ARM_HANG_L = [-1.0, 1.06, 0.42, -1, 0, -0.4], ARM_HANG_R = [1.0, 1.06, 0.42, 1, 0, -0.4];
  const LEG_SIT_L = [-0.64, 0.55, 0.82, -0.2, 1, 0.1, 0], LEG_SIT_R = [0.64, 0.55, 0.82, 0.2, 1, 0.1, 0];
  const LEG_STAND_L = [-0.55, 0.55, 0.22, 0, 0, 1, 0], LEG_STAND_R = [0.55, 0.55, 0.22, 0, 0, 1, 0];
  const SIT = { LL: LEG_SIT_L, LR: LEG_SIT_R, stand: 0 }, STAND = { LL: LEG_STAND_L, LR: LEG_STAND_R, stand: 1 };
  const P = {
    idle:     Object.assign({ L: ARM_SIT_L, R: ARM_SIT_R, head: [0, 0, 0], brow: 0.3, lid: 0.0, eyes: 'open', mouth: 'neutral' }, SIT),
    wave:     Object.assign({ L: ARM_SIT_L, R: [1.22, 2.31, 0.62, 1, -1, -0.2], head: [-0.05, 0.05, -0.1], brow: 0.05, lid: 0.07, eyes: 'open', mouth: 'smile' }, SIT),
    sleep:    Object.assign({ L: [-0.8, 0.96, 0.82, -1, 0, -0.6], R: [0.8, 0.96, 0.82, 1, 0, -0.6], head: [0.32, 0, 0.14], brow: 0.0, lid: 0.0, eyes: 'closed', mouth: 'neutral' }, SIT),
    think:    Object.assign({ L: ARM_HANG_L, R: [0.42, 2.25, 1.02, 1, -1, 0.3], head: [0.12, -0.1, 0.12], brow: 0.42, lid: 0.02, eyes: 'open', mouth: 'neutral' }, STAND),
    happy:    Object.assign({ L: [-1.22, 2.43, 0.5, -1, -0.6, -0.2], R: [1.22, 2.43, 0.5, 1, -0.6, -0.2], head: [-0.12, 0, 0], brow: -0.1, lid: 0.1, eyes: 'happy', mouth: 'open' }, STAND),
    confused: Object.assign({ L: ARM_HANG_L, R: [1.02, 2.45, 0.42, 1, -1, -0.4], head: [0.02, -0.1, 0.26], brow: -0.15, lid: 0.06, eyes: 'open', mouth: 'frown', asym: true }, STAND)
  };
  const cur = JSON.parse(JSON.stringify(P.idle));
  let target = P.idle, poseName = 'idle';
  function setVisibility(p) {
    Object.keys(mouths).forEach(k => { mouths[k].visible = k === p.mouth; });
    [eyes.L, eyes.R].forEach(E => { E.open.visible = p.eyes === 'open'; E.happy.visible = p.eyes === 'happy'; E.closed.visible = p.eyes === 'closed'; });
  }
  function apply(c, t, motion, bounce) {
    const wave = poseName === 'wave' && motion ? [Math.sin(t * 9) * 0.16, Math.abs(Math.cos(t * 9)) * 0.04] : null;
    const lift = c.stand * LIFT;
    char.position.y = lift + (bounce || 0);
    applyLeg(legL, c.LL, lift); applyLeg(legR, c.LR, lift);
    setTail(c.stand);
    applyArm(armL, c.L); applyArm(armR, c.R, wave);
    head.rotation.set(c.head[0], c.head[1], c.head[2]);
    [eyes.L, eyes.R].forEach(E => {
      let b = c.brow; if (target.asym && E.sx < 0) b = 0.35;
      E.lidPivot.rotation.z = E.sx * b; E.lidPivot.position.y = 0.05 + c.lid;
    });
  }
  function setPose(name) { if (!P[name]) return; target = P[name]; poseName = name; setVisibility(target); }
  function snap(name) { setPose(name); Object.assign(cur, JSON.parse(JSON.stringify(P[name]))); apply(cur, 0, false, 0); }
  const lerpArr = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  function update(dt, t, o) {
    o = o || {};
    const k = Math.min(1, Math.max(0, 1 - Math.exp(-Math.max(0, dt) * 6)));
    ['L', 'R', 'LL', 'LR', 'head'].forEach(key => { cur[key] = lerpArr(cur[key], target[key], k); });
    cur.brow += (target.brow - cur.brow) * k; cur.lid += (target.lid - cur.lid) * k; cur.stand += (target.stand - cur.stand) * k;
    const c = { L: cur.L, R: cur.R, LL: cur.LL, LR: cur.LR, head: cur.head.slice(), brow: cur.brow, lid: cur.lid, stand: cur.stand };
    let bounce = 0;
    if (o.motion !== false) {
      if (o.look && poseName !== 'sleep') { c.head[1] += o.look[0] * 0.35; c.head[0] += -o.look[1] * 0.15; }
      const breath = poseName === 'sleep' ? Math.sin(t * 1.4) * 0.02 : Math.sin(t * 2.2) * 0.008;
      torso.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 0.5);
      bounce = poseName === 'happy' ? Math.abs(Math.sin(t * 6)) * 0.14 : 0;
      if (poseName === 'sleep') c.head[2] += Math.sin(t * 1.4) * 0.03;
      const blink = ((t + 2) % 4.2) < 0.12 && poseName !== 'sleep' && poseName !== 'happy';
      [eyes.L, eyes.R].forEach(E => { E.open.scale.y = blink ? 0.12 : 1; });
    }
    char.rotation.z = 0;
    if (o.motion !== false && o.walk != null && c.stand > 0.85) {
      const ph = o.walk, up = 0.16;
      c.LL = c.LL.slice(); c.LR = c.LR.slice();
      c.LL[1] += Math.max(0, Math.sin(ph)) * up; c.LL[2] += Math.sin(ph) * 0.08;
      c.LR[1] += Math.max(0, -Math.sin(ph)) * up; c.LR[2] -= Math.sin(ph) * 0.08;
      char.rotation.z = Math.sin(ph) * 0.06;
      bounce += Math.abs(Math.cos(ph)) * 0.04;
    }
    apply(c, t, o.motion !== false, bounce);
  }
  snap('idle');
  return { root, board, pedestal, character: char, setPose, snap, update, poses: Object.keys(P) };
}

