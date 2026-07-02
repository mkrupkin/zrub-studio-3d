// ═══════════════════════════════════════════════
//  world.js — realistic Carpathian valley (PBR + HDRI + postFX)
//  rolling FBM terrain · patchwork meadow/spruce · hazy layered
//  ridges · valley mist · HDRI image-based lighting · bloom grade
// ═══════════════════════════════════════════════
import * as THREE from 'three';
import { buildCabin } from './cabin.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ── procedural spruce (смерека) texture — fluffy, tiered, irregular ──
function makeSpruceTexture() {
  const w = 256, h = 384, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  // trunk
  g.strokeStyle = '#3b2a1a'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, h * 0.72); g.stroke();
  const rnd = (s) => { let n = Math.sin(s * 91.7) * 4375.85; return n - Math.floor(n); };
  const tiers = 26;
  let seed = 1;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);                    // 0 top .. 1 bottom
    const y = h * 0.06 + t * h * 0.9;
    const width = (h * 0.46) * Math.pow(t, 0.82) + 8;
    const blobs = 5 + Math.floor(t * 20);
    for (let b = 0; b < blobs; b++) {
      const fx = (rnd(seed++) * 2 - 1);
      const bx = w / 2 + fx * width * 0.5;
      const by = y + rnd(seed++) * 9 + Math.abs(fx) * width * 0.18;  // branches droop at edges
      const r = 5 + rnd(seed++) * 10 * (0.5 + t);
      const shade = 0.55 + 0.45 * (1 - Math.abs(fx)) - t * 0.12;     // darker at base/edges
      const lit = fx < 0 ? 1.18 : 0.86;                              // sun from the left
      const rr = Math.min(255, 26 * shade * lit) | 0;
      const gg = Math.min(255, 74 * shade * lit) | 0;
      const bb = Math.min(255, 40 * shade * lit) | 0;
      g.fillStyle = `rgb(${rr},${gg},${bb})`;
      g.beginPath(); g.arc(bx, by, r, 0, Math.PI * 2); g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ── soft cumulus cloud sprite ──
function makeCloudTexture() {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const rnd = (k) => { let n = Math.sin(k * 57.3) * 4375.5; return n - Math.floor(n); };
  let seed = 3;
  for (let i = 0; i < 16; i++) {
    const px = s * 0.5 + (rnd(seed++) - 0.5) * s * 0.7;
    const py = s * 0.58 + (rnd(seed++) - 0.5) * s * 0.34;
    const r = s * 0.1 + rnd(seed++) * s * 0.17;
    const grd = g.createRadialGradient(px, py, 0, px, py, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.92)');
    grd.addColorStop(0.55, 'rgba(248,250,252,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── deterministic value-noise + fbm ──
function hash(x, z) { let n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, z, oct = 5) {
  let s = 0, amp = 1, freq = 1, norm = 0;
  for (let o = 0; o < oct; o++) { s += amp * vnoise(x * freq, z * freq); norm += amp; amp *= 0.5; freq *= 2; }
  return s / norm;
}
const smooth = (a, b, t) => { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };

function terrainH(x, z) {
  // HYBRID: the photo backdrop provides the mountains — the 3D ground is just a
  // gentle green alpine meadow the cabins sit on (rolls, then falls away toward -Z)
  let h = fbm(x * 0.012, z * 0.012) * 9 - 2;
  h += fbm(x * 0.035 + 9, z * 0.035 - 5) * 2.6;
  h += fbm(x * 0.08 + 21, z * 0.08 - 13, 3) * 1.1;   // micro terraces
  h -= smooth(-30, -150, z) * 14;                    // land dips away toward the backdrop
  return h;
}
function forestMask(x, z) { return smooth(0.42, 0.62, fbm(x * 0.012 + 40, z * 0.012 + 17, 4)); }

export function createWorld(canvas, { onStats = null, onReady = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  const scene = new THREE.Scene();
  const HAZE = new THREE.Color(0x9fb27a);   // greenish haze so the meadow stays green to its far edge (blends into photo)
  scene.fog = new THREE.FogExp2(HAZE.getHex(), 0.0009);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1200);

  // ── procedural sky dome (fallback / always-on background) ──
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(700, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, fog: false,
      uniforms: {
        zenith: { value: new THREE.Color(0x3f7ec4) },   // deep alpine blue
        horizon: { value: new THREE.Color(0xcfe0ec) },
        glow: { value: new THREE.Color(0xf4ecd8) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec3 vP; uniform vec3 zenith,horizon,glow;
        void main(){ float h=normalize(vP).y; float t=smoothstep(-0.05,0.55,h);
          vec3 c=mix(horizon,zenith,t); float g=pow(max(0.0,1.0-abs(h-0.03)*5.0),2.0);
          c=mix(c,glow,g*0.3); gl_FragColor=vec4(c,1.0);}`,
    })
  );
  sky.visible = false;                         // hybrid: photo backdrop replaces the procedural sky
  scene.add(sky);

  // ── PHOTO BACKDROP: the WHOLE Carpathian panorama, always fully visible (screen-fixed) ──
  new THREE.TextureLoader().load('assets/backdrop.jpg', t => {
    t.colorSpace = THREE.SRGBColorSpace;
    scene.background = t;                        // entire photo always in frame — never cropped
  });

  // ── lighting (afternoon sun; HDRI adds IBL on top when loaded) ──
  const hemi = new THREE.HemisphereLight(0xcfdbe0, 0x4b543a, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4d8, 3.0);   // strong key light → bright sunlit slopes vs shaded folds
  sun.position.set(46, 118, 52);                           // high overhead: broad lighting, folds shade for contrast
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { near: 1, far: 340, left: -80, right: 80, top: 80, bottom: -80 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // ── living clouds: soft drifting sprites high in the sky, matched to the photo ──
  const cloudTex = makeCloudTexture();
  const clouds = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const w = 55 + hash(i, 71) * 85, h = w * 0.52;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.35 + hash(i, 72) * 0.28, depthWrite: false, fog: false, toneMapped: false })
    );
    const y = 60 + hash(i, 75) * 70, z = -110 - hash(i, 74) * 150;
    m.position.set((hash(i, 73) - 0.5) * 500, y, z);
    m.userData.drift = 1.4 + hash(i, 76) * 1.8;
    clouds.add(m);
  }
  scene.add(clouds);

  // ── terrain ──
  const SIZE = 700, SEG = 256;
  const tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  const pAttr = tGeo.attributes.position;
  const cAttr = new THREE.BufferAttribute(new Float32Array(pAttr.count * 3), 3);
  const meadow = new THREE.Color(0x83a53a), meadowDry = new THREE.Color(0x9cb356);  // vivid sunlit green matched to the photo
  const spruceC = new THREE.Color(0x3a5730), rockC = new THREE.Color(0x7a725e);
  const cc = new THREE.Color();
  for (let i = 0; i < pAttr.count; i++) {
    const x = pAttr.getX(i), z = pAttr.getZ(i), h = terrainH(x, z);
    pAttr.setY(i, h);
    const fm = forestMask(x, z), tint = fbm(x * 0.05, z * 0.05, 3);
    cc.copy(meadow).lerp(meadowDry, tint * 0.55);
    cc.lerp(spruceC, fm * (0.6 + tint * 0.4));
    if (h > 52) cc.lerp(rockC, smooth(52, 78, h));  // rock only on the highest crests
    cAttr.setXYZ(i, cc.r, cc.g, cc.b);
  }
  tGeo.setAttribute('color', cAttr);
  tGeo.computeVertexNormals();
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.6 });
  const terrain = new THREE.Mesh(tGeo, terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ── moving cloud shadows drifting across the meadow (synced with the clouds) ──
  const shadowTex = makeCloudTexture();          // white blobs → used as alphaMap = dark patches where clouds block the sun
  shadowTex.wrapS = shadowTex.wrapT = THREE.RepeatWrapping;
  shadowTex.repeat.set(4, 4);
  const cloudShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 340, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x1c2a12, transparent: true, opacity: 0.32, alphaMap: shadowTex, depthWrite: false })
  );
  cloudShadow.rotation.x = -Math.PI / 2;
  cloudShadow.position.set(0, 1.4, -40);
  cloudShadow.renderOrder = 1;
  scene.add(cloudShadow);

  // ── layered distant ridges (atmospheric perspective) ──
  function ridgeRing(radius, baseY, height, hazeAmt, seed) {
    const seg = 160, verts = [], cols = [];
    const cLow = new THREE.Color(0x40583f).lerp(HAZE, hazeAmt);
    const cTop = new THREE.Color(0x8ba0a6).lerp(HAZE, hazeAmt * 0.7);
    const prof = a => baseY + height * (0.35 + 0.65 * fbm(Math.cos(a) * 3 + seed, Math.sin(a) * 3 + seed, 4));
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const h0 = prof(a0), h1 = prof(a1);
      const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius, x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
      verts.push(x0, baseY - 8, z0, x0, h0, z0, x1, h1, z1, x0, baseY - 8, z0, x1, h1, z1, x1, baseY - 8, z1);
      for (const c of [cLow, cTop, cTop, cLow, cTop, cLow]) cols.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })));
  }
  // (procedural distant ridges disabled — the photo backdrop provides all mountains)
  void ridgeRing;

  // sharper distant blue peaks on the horizon (alpine silhouette)
  function peakRing(radius, baseY, height, hazeAmt, seed) {
    const seg = 220, verts = [], cols = [];
    const cLow = new THREE.Color(0x4d6478).lerp(HAZE, hazeAmt);
    const cTop = new THREE.Color(0x9fb4c4).lerp(HAZE, hazeAmt * 0.6);
    const prof = a => {
      const n = fbm(Math.cos(a) * 5 + seed, Math.sin(a) * 5 + seed, 5);
      const sharp = Math.pow(Math.abs(n * 2 - 1), 0.7);   // pointier crests
      return baseY + height * (0.25 + 0.75 * sharp);
    };
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const h0 = prof(a0), h1 = prof(a1);
      const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius, x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
      verts.push(x0, baseY - 8, z0, x0, h0, z0, x1, h1, z1, x0, baseY - 8, z0, x1, h1, z1, x1, baseY - 8, z1);
      for (const c of [cLow, cTop, cTop, cLow, cTop, cLow]) cols.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
    scene.add(m);
  }
  void peakRing;   // disabled — photo backdrop provides the far peaks

  // ── winding dirt path draped over a ridge (the iconic 7cars line) ──
  (function buildPath() {
    const ctrl = [[-2, 10], [6, -4], [-4, -18], [4, -32], [-5, -48], [3, -64], [-2, -82]]
      .map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(ctrl, false, 'catmullrom', 0.4);
    const N = 200, W = 1.05, pts = curve.getPoints(N);
    const verts = [], uvs = [];
    const up = new THREE.Vector3(0, 1, 0), tan = new THREE.Vector3(), sideV = new THREE.Vector3();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      tan.subVectors(b, a).setY(0).normalize();
      sideV.crossVectors(tan, up).normalize().multiplyScalar(W);
      const lx = pts[i].x - sideV.x, lz = pts[i].z - sideV.z;
      const rx = pts[i].x + sideV.x, rz = pts[i].z + sideV.z;
      verts.push(lx, terrainH(lx, lz) + 0.18, lz, rx, terrainH(rx, rz) + 0.18, rz);
      uvs.push(0, i / N, 1, i / N);
    }
    const idx = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x9a7b4e, roughness: 1, envMapIntensity: 0.2 }));
    m.receiveShadow = true;
    scene.add(m);
  })();

  // ── rock outcrops on the ridge crests ──
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 1, flatShading: true });
  for (let i = 0; i < 70; i++) {
    const a = hash(i, 81) * Math.PI * 2, r = 26 + hash(i, 82) * 180;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = terrainH(x, z);
    if (y < 18) continue;                       // only on the higher crests
    const rk = new THREE.Mesh(rockGeo, rockMat);
    const s = 0.8 + hash(i, 83) * 2.4;
    rk.scale.set(s, s * (0.6 + hash(i, 84) * 0.5), s);
    rk.position.set(x, y - s * 0.3, z);
    rk.rotation.set(hash(i, 85) * 3, hash(i, 86) * 3, hash(i, 87) * 3);
    rk.castShadow = rk.receiveShadow = true;
    scene.add(rk);
  }

  // ── realistic spruce billboards (crossed quads, instanced) ──
  const spruceTex = makeSpruceTexture();
  const p1 = new THREE.PlaneGeometry(4.2, 6.2); p1.translate(0, 3.1, 0);
  const p2 = p1.clone(); p2.rotateY(Math.PI / 3);       // 3 planes at 60° → full volume from any angle (no "cross" look)
  const p3 = p1.clone(); p3.rotateY(2 * Math.PI / 3);
  const treeGeo = mergeGeometries([p1, p2, p3]);
  const foliMat = new THREE.MeshStandardMaterial({
    map: spruceTex, transparent: true, alphaTest: 0.42, side: THREE.DoubleSide,
    roughness: 1, metalness: 0, envMapIntensity: 0.25,
  });
  const spots = [];
  for (let i = 0; i < 9000; i++) {
    const x = (hash(i, 11) - 0.5) * 220, z = -60 - hash(i, 23) * 90;    // well behind the cabins, at the seam — frame only
    if (Math.abs(x) < 20 && z > -90) continue;                          // keep the central corridor clear (config cabin sightline)
    const fm = forestMask(x, z);
    if (fm < 0.36) continue;
    if (hash(i, 31) > fm) continue;
    spots.push([x, terrainH(x, z), z, 0.5 + hash(i, 41) * 0.7]);
    if (spots.length >= 260) break;
  }
  const treeIM = new THREE.InstancedMesh(treeGeo, foliMat, spots.length);
  treeIM.castShadow = true; treeIM.receiveShadow = true;
  const dm = new THREE.Object3D();
  spots.forEach(([x, y, z, s], i) => {
    dm.position.set(x, y, z);
    dm.scale.set(s, s * (0.9 + hash(i, 3) * 0.5), s);
    dm.rotation.y = hash(i, 5) * Math.PI; dm.updateMatrix();
    treeIM.setMatrixAt(i, dm.matrix);
  });
  scene.add(treeIM);

  // ── cabins ──
  const ground = (x, z) => terrainH(x, z);
  function placeCabin(cfg, x, z, rotY = 0) {
    const c = buildCabin(cfg); c.position.set(x, ground(x, z), z); c.rotation.y = rotY; scene.add(c); return c;
  }
  placeCabin({ length: 9, width: 6.5, courses: 15, roofDeg: 52, diaCm: 28, wood: 'pine', porch: true }, 0, 3, -0.3);  // tall gable + veranda

  let configCabin = null;
  const CFGP = { x: 32, z: -4 };
  function updateConfigCabin(cfg) {
    if (configCabin) { scene.remove(configCabin); disposeGroup(configCabin); }
    configCabin = buildCabin(cfg);
    configCabin.position.set(CFGP.x, ground(CFGP.x, CFGP.z), CFGP.z);
    scene.add(configCabin);
    if (onStats) onStats(configCabin.userData.stats);
  }
  updateConfigCabin({ length: 8, width: 6, courses: 14, roofDeg: 42, diaCm: 26, wood: 'pine', roof: 'gable' });

  placeCabin({ length: 7, width: 5, courses: 18, roofDeg: 34, diaCm: 24, wood: 'oak', porch: true }, -30, 6, 0.6);     // two-storey + porch, low roof
  placeCabin({ length: 6, width: 4.5, courses: 9, roofDeg: 48, diaCm: 22, wood: 'ash', roof: 'hip' }, -16, -10, -0.5); // small hip-roof cottage
  placeCabin({ length: 11, width: 7, courses: 13, roofDeg: 42, diaCm: 32, wood: 'smoke', roof: 'hip', porch: true }, 8, -24, 0.9); // wide hip villa + veranda

  const hayMat = new THREE.MeshStandardMaterial({ color: 0x9c8340, roughness: 1, envMapIntensity: 0.2 });
  for (const [hx, hz] of [[-8, -6], [24, 6], [-22, 7]]) {
    const hay = new THREE.Mesh(new THREE.ConeGeometry(1.05, 2.3, 9), hayMat);
    hay.position.set(hx, ground(hx, hz) + 1.15, hz); hay.castShadow = true; scene.add(hay);
  }

  // ── distant village houses scattered on the far ridges ──
  const dhWall = new THREE.MeshStandardMaterial({ color: 0x6f5842, roughness: 1 });
  const dhRoof = new THREE.MeshStandardMaterial({ color: 0x3d3229, roughness: 1 });
  const dhWallGeo = new THREE.BoxGeometry(1, 1, 1);
  const dhRoofGeo = new THREE.CylinderGeometry(0.02, 0.75, 1.5, 3);
  function distantHouse(x, z, s) {
    const y = ground(x, z);
    if (y < 4) return;                         // only up on the slopes, not in the pit
    const gr = new THREE.Group();
    const body = new THREE.Mesh(dhWallGeo, dhWall);
    body.scale.set(3.4 * s, 2 * s, 2.4 * s); body.position.y = s; body.castShadow = true;
    const roof = new THREE.Mesh(dhRoofGeo, dhRoof);
    roof.scale.set(2.6 * s, 3.6 * s, 1); roof.rotation.z = Math.PI / 2; roof.position.y = 2 * s;
    gr.add(body, roof);
    gr.position.set(x, y, z); gr.rotation.y = hash(x, z) * Math.PI;
    scene.add(gr);
  }
  void distantHouse;   // photo backdrop already has distant houses on its ridges

  const fire = new THREE.PointLight(0xff7a2a, 0, 16, 2);
  fire.position.set(44, ground(44, -6) + 1.5, -6); scene.add(fire);

  // ── camera journey ──
  const gy = (x, z) => ground(x, z);
  // camera travels the valley (+X) but always looks across it (−Z) toward the
  // layered mountains + sky → the epic Carpathian reveal, never the flat floor
  // hybrid: camera faces the photo backdrop (−Z); meadow + cabins in the 3D foreground
  const camPts = [
    new THREE.Vector3(0, gy(0, 40) + 13, 46),          // hero: meadow + cabins in foreground, whole photo behind
    new THREE.Vector3(-8, gy(-8, 30) + 11, 34),        // craft
    new THREE.Vector3(52, gy(52, 8) + 8, 15),          // configurator approach
    new THREE.Vector3(52, gy(52, 8) + 8, 15),          // configurator: whole cabin framed, backdrop behind
    new THREE.Vector3(10, gy(10, 30) + 12, 36),        // gallery sweep
    new THREE.Vector3(44, gy(44, 6) + 9, 22),          // contact
  ];
  const lookPts = [
    new THREE.Vector3(0, 44, -160),  new THREE.Vector3(-2, 34, -150),
    new THREE.Vector3(31, 4, -6),    new THREE.Vector3(31, 4, -6),
    new THREE.Vector3(-4, 30, -150), new THREE.Vector3(36, 6, -20),
  ];
  const camCurve = new THREE.CatmullRomCurve3(camPts, false, 'catmullrom', 0.4);
  const lookCurve = new THREE.CatmullRomCurve3(lookPts, false, 'catmullrom', 0.4);
  let scroll = 0, scrollEased = 0;
  const setScroll = p => { scroll = Math.max(0, Math.min(1, p)); };
  const CFG_RANGE = [0.42, 0.62];

  // ── post-processing ──
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.16, 0.6, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // ── async HDRI (image-based lighting + real sky) ──
  const HDRI = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr';
  new RGBELoader().load(HDRI, tex => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = tex;                 // IBL only — our procedural sky + clouds stay
    hemi.intensity = 0.38;                    // enough sky fill so shadows keep detail (not black)
    terrainMat.envMapIntensity = 0.28;
    foliMat.envMapIntensity = 0.22;
  }, undefined, () => { /* keep sky dome + lights */ });

  // ── async PBR grass terrain texture ──
  const TX = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/aerial_grass_rock/';
  const tl = new THREE.TextureLoader();
  const setRepeat = t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(SIZE / 11, SIZE / 11); };
  tl.load(TX + 'aerial_grass_rock_diff_2k.jpg', t => { t.colorSpace = THREE.SRGBColorSpace; setRepeat(t); terrainMat.map = t; terrainMat.needsUpdate = true; }, undefined, () => {});
  tl.load(TX + 'aerial_grass_rock_nor_gl_2k.jpg', t => { setRepeat(t); terrainMat.normalMap = t; terrainMat.normalScale.set(0.8, 0.8); terrainMat.needsUpdate = true; }, undefined, () => {});
  tl.load(TX + 'aerial_grass_rock_rough_2k.jpg', t => { setRepeat(t); terrainMat.roughnessMap = t; terrainMat.needsUpdate = true; }, undefined, () => {});

  // ── loop ──
  const tmp = new THREE.Vector3();
  let t0 = 0, raf, first = true;
  function tick(t) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (t - t0) / 1000 || 0); t0 = t;
    scrollEased += (scroll - scrollEased) * Math.min(1, dt * 4.2);
    const s = scrollEased;
    camCurve.getPointAt(s, camera.position);
    lookCurve.getPointAt(s, tmp);
    const idle = t * 0.0004;
    camera.position.x += Math.sin(idle) * 0.3;
    camera.position.y += Math.cos(idle * 1.3) * 0.18;
    camera.lookAt(tmp);
    clouds.children.forEach(c => {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 300) c.position.x = -300;
    });
    shadowTex.offset.x -= dt * 0.006;   // cloud shadows drift across the meadow, same way as the clouds
    const nf = Math.max(0, (s - 0.8) / 0.2);
    fire.intensity = nf * (2.6 + Math.sin(t * 0.02) * 0.8);
    if (configCabin && s > CFG_RANGE[0] && s < CFG_RANGE[1]) configCabin.rotation.y += dt * 0.12;
    composer.render();
    if (first) { first = false; onReady && onReady(); }
  }
  raf = requestAnimationFrame(tick);

  return { setScroll, updateConfigCabin, getScrollEased: () => scrollEased, dispose: () => { cancelAnimationFrame(raf); renderer.dispose(); } };
}

function disposeGroup(g) {
  g.traverse(o => { o.geometry?.dispose?.(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material?.dispose?.(); });
}
