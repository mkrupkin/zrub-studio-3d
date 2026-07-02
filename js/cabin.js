// ═══════════════════════════════════════════════
//  cabin.js — pure procedural log-cabin builder
//  returns a THREE.Group (no renderer / no scene)
// ═══════════════════════════════════════════════
import * as THREE from 'three';

// bright honey peeled-log tones (real зруб — light smooth wood, not dark bark)
export const WOOD = {
  pine:  { base: 0xe4b674, end: 0xf0d3a0, rough: 0.62 },
  oak:   { base: 0xd39a55, end: 0xe4bd82, rough: 0.6 },
  ash:   { base: 0xecd0a0, end: 0xf4e2c0, rough: 0.66 },
  smoke: { base: 0x9a7038, end: 0xb89258, rough: 0.55 },
};

// ── shared PBR textures (loaded once; graceful fallback to flat colour) ──
const _tl = new THREE.TextureLoader();
function _tex(url, { srgb = false, rep = 2 } = {}) {
  const t = _tl.load(url, x => { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.set(rep, rep); }, undefined, () => {});
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const _P = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/';
// LIGHT smooth wood grain for the logs (not bark)
const LOG_DIFF  = _tex(_P + 'plywood/plywood_diff_2k.jpg', { srgb: true, rep: 2 });
const LOG_NOR   = _tex(_P + 'bark_brown_02/bark_brown_02_nor_gl_2k.jpg', { rep: 3 });  // subtle log-surface relief
const LOG_ROUGH = _tex(_P + 'plywood/plywood_rough_2k.jpg', { rep: 2 });
// dark slate shingle roof
const ROOF_DIFF = _tex(_P + 'roof_slates_02/roof_slates_02_diff_2k.jpg', { srgb: true, rep: 4 });
const ROOF_NOR  = _tex(_P + 'roof_slates_02/roof_slates_02_nor_gl_2k.jpg', { rep: 4 });
const END_DIFF  = _tex(_P + 'plywood/plywood_diff_2k.jpg', { srgb: true, rep: 1 });

function vary(hex) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(0.92 + Math.random() * 0.16);
  return c;
}

export function buildCabin(cfg = {}) {
  const {
    length = 8, width = 6, courses = 14, roofDeg = 42, diaCm = 26,
    wood = 'pine', roof = 'gable',
  } = cfg;

  const group = new THREE.Group();
  const L = length, W = width, dia = diaCm / 100;
  const overhang = dia * 1.6;
  const w = WOOD[wood];

  const logMat = () => new THREE.MeshStandardMaterial({
    color: vary(w.base), map: LOG_DIFF, normalMap: LOG_NOR, roughnessMap: LOG_ROUGH,
    normalScale: new THREE.Vector2(0.6, 0.6), roughness: w.rough,
  });
  const endMat = new THREE.MeshStandardMaterial({ color: w.end, map: END_DIFF, roughness: w.rough * 0.9 });

  // stone foundation
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(L + overhang * 2 + 0.4, 0.5, W + overhang * 2 + 0.4),
    new THREE.MeshStandardMaterial({ color: 0x6f6a60, roughness: 1 })
  );
  pad.position.y = 0.25;
  pad.castShadow = pad.receiveShadow = true;
  group.add(pad);

  const baseY = 0.5 + dia / 2;
  // real logs are scribed into a groove — each sits DEEP on the one below, no gap.
  // heavy overlap (0.6 of a diameter) simulates the tight seam; also flatten each
  // log a touch vertically so the contact face is flush like a profiled beam.
  const COURSE = dia * 0.56;
  const doorHalf = 0.55;
  const doorTopCourse = Math.min(courses - 2, Math.round(courses * 0.62));
  let logCount = 0;

  function addLog(len, axis, cx, cy, cz) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(dia / 2, dia / 2, len, 16, 1), logMat());
    mesh.castShadow = mesh.receiveShadow = true;
    if (axis === 'x') { mesh.rotation.z = Math.PI / 2; mesh.position.set(cx, cy, cz); }
    else { mesh.rotation.x = Math.PI / 2; mesh.position.set(cx, cy, 0); }
    group.add(mesh);
    const cap = new THREE.CircleGeometry(dia / 2 * 0.96, 12);
    for (const s of [1, -1]) {
      const c = new THREE.Mesh(cap, endMat);
      if (axis === 'x') { c.rotation.y = s * Math.PI / 2; c.position.set(cx + s * len / 2, cy, cz); }
      else { c.position.set(cx, cy, s * len / 2); c.lookAt(cx, cy, s * 100); }
      group.add(c);
    }
    logCount++;
  }

  for (let i = 0; i < courses; i++) {
    const y = baseY + i * COURSE;
    if (i % 2 === 0) {
      for (const z of [-W / 2, W / 2]) {
        const isFront = z < 0, len = L + overhang * 2;
        if (isFront && i < doorTopCourse) {
          const leftLen = (-doorHalf) - (-len / 2);
          if (leftLen > 0.1) addLog(leftLen, 'x', (-len / 2 - doorHalf) / 2, y, z);
          const rightLen = (len / 2) - doorHalf;
          if (rightLen > 0.1) addLog(rightLen, 'x', (doorHalf + len / 2) / 2, y, z);
        } else addLog(len, 'x', 0, y, z);
      }
    } else {
      for (const x of [-L / 2, L / 2]) addLog(W + overhang * 2, 'z', x, y, 0);
    }
  }

  const wallTopY = baseY + (courses - 1) * COURSE + dia / 2;

  // door
  const doorH = doorTopCourse * COURSE;
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(doorHalf * 2, doorH, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x3a2a19, roughness: 0.6 })
  );
  door.position.set(0, 0.5 + doorH / 2, -W / 2 - dia / 2 + 0.02);
  door.castShadow = true;
  group.add(door);

  // windows
  const winMat = new THREE.MeshStandardMaterial({ color: 0x88b0c4, roughness: 0.15, metalness: 0.3, emissive: 0x3a5566, emissiveIntensity: 0.3 });
  const winFrame = new THREE.MeshStandardMaterial({ color: 0x3a2a19, roughness: 0.6 });
  const winY = 0.5 + COURSE * Math.round(courses * 0.4);
  for (const x of [-L / 4, L / 4]) {
    for (const z of [-W / 2, W / 2]) {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), winFrame);
      fr.position.set(x, winY, z + (z < 0 ? -dia / 2 + 0.02 : dia / 2 - 0.02));
      group.add(fr);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84), winMat);
      gl.position.set(x, winY, z + (z < 0 ? -dia / 2 - 0.02 : dia / 2 + 0.02));
      gl.rotation.y = z < 0 ? Math.PI : 0;
      group.add(gl);
    }
  }

  // roof
  const roofH = Math.tan(roofDeg * Math.PI / 180) * (W / 2);
  const eave = 0.6;
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4c52, map: ROOF_DIFF, normalMap: ROOF_NOR, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
  const gableMat = new THREE.MeshStandardMaterial({ color: vary(w.base), map: LOG_DIFF, normalMap: LOG_NOR, roughness: w.rough });

  if (roof === 'gable') {
    const slope = Math.hypot(W / 2 + eave, roofH);
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(L + eave * 2, slope), roofMat);
      p.position.set(0, wallTopY + roofH / 2, s * (W / 2 + eave) / 2);
      const ang = Math.atan2(roofH, W / 2 + eave);
      p.rotation.x = s > 0 ? -(Math.PI / 2 - ang) : (Math.PI / 2 - ang);
      p.castShadow = p.receiveShadow = true;
      group.add(p);
    }
    for (const x of [-L / 2, L / 2]) {
      const sh = new THREE.Shape();
      sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(0, roofH); sh.closePath();
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), gableMat);
      m.position.set(x, wallTopY, 0); m.rotation.y = Math.PI / 2; m.castShadow = true;
      group.add(m);
    }
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(dia / 2.4, dia / 2.4, L + eave * 2, 10), logMat());
    ridge.rotation.z = Math.PI / 2; ridge.position.set(0, wallTopY + roofH, 0); ridge.castShadow = true;
    group.add(ridge);
  } else {
    const ridgeLen = L * 0.4, apexY = wallTopY + roofH;
    const P = {
      fl: [-L / 2 - eave, wallTopY, -W / 2 - eave], fr: [L / 2 + eave, wallTopY, -W / 2 - eave],
      br: [L / 2 + eave, wallTopY, W / 2 + eave], bl: [-L / 2 - eave, wallTopY, W / 2 + eave],
      r1: [-ridgeLen / 2, apexY, 0], r2: [ridgeLen / 2, apexY, 0],
    };
    const faces = [[P.fl, P.fr, P.r2, P.r1], [P.br, P.bl, P.r1, P.r2], [P.bl, P.fl, P.r1], [P.fr, P.br, P.r2]];
    for (const f of faces) {
      const v = [];
      if (f.length === 4) { v.push(...f[0], ...f[1], ...f[2], ...f[0], ...f[2], ...f[3]); }
      else { v.push(...f[0], ...f[1], ...f[2]); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, roofMat); m.castShadow = m.receiveShadow = true;
      group.add(m);
    }
  }

  // chimney
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 1 }));
  chim.position.set(L * 0.28, wallTopY + roofH * 0.65, 0.3); chim.castShadow = true;
  group.add(chim);

  // ── optional front porch / veranda (a covered overhang on posts + a rail) ──
  if (cfg.porch) {
    const pDepth = 2.2, frontZ = -W / 2 - dia / 2, porchZ = frontZ - pDepth;
    const postMat = logMat();
    const beamY = 0.5 + doorH + 0.5;
    // porch floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.25, pDepth),
      new THREE.MeshStandardMaterial({ color: 0x8a6a44, map: END_DIFF, roughness: 0.7 }));
    floor.position.set(0, 0.55, frontZ - pDepth / 2); floor.receiveShadow = true; group.add(floor);
    // 3 posts
    for (const px of [-L * 0.4, 0, L * 0.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(dia / 3, dia / 3, beamY, 12), postMat);
      post.position.set(px, 0.55 + beamY / 2, porchZ + 0.15); post.castShadow = true; group.add(post);
    }
    // porch roof (single slope out from the wall)
    const pr = new THREE.Mesh(new THREE.BoxGeometry(L * 0.94, 0.14, pDepth + 0.5), roofMat);
    pr.position.set(0, beamY + 0.6, frontZ - pDepth / 2 + 0.1);
    pr.rotation.x = -0.28; pr.castShadow = true; group.add(pr);
    // rail beam
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(dia / 5, dia / 5, L * 0.9, 8), postMat);
    rail.rotation.z = Math.PI / 2; rail.position.set(0, 1.35, porchZ + 0.15); group.add(rail);
  }

  group.userData = {
    stats: { area: L * W, logCount, volume: Math.PI * (dia / 2) ** 2 * (L + W) * courses, L, W },
    wallTopY, roofH,
  };
  return group;
}
