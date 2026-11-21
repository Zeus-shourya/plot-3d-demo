// Builds the plotted colony entirely from data/layout.json + data/plots.json.
// Metres throughout. North = -Z, east = +X.
import * as THREE from 'three';

export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}
const shapeOf = (poly) => new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
const bbox = (poly) => {
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
};

export function buildPlotWorld(scene, layout, plots, project) {
  const W = { plotMesh: {}, pickables: [], beacons: [], cars: [], houses: new Map() };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const R = rng(9);

  // ---------- layering: flat surfaces never z-fight ----------
  const layerCache = new Map();
  const onLayer = (mat, layer) => {
    if (!layer) return mat;
    const key = mat.uuid + ':' + layer;
    if (!layerCache.has(key)) {
      const m = mat.clone();
      m.polygonOffset = true; m.polygonOffsetFactor = -layer; m.polygonOffsetUnits = -layer * 4;
      layerCache.set(key, m);
    }
    return layerCache.get(key);
  };
  const flatGeo = (geo, mat, x, z, layer, y = 0) => {
    const m = new THREE.Mesh(geo, onLayer(mat, layer));
    m.position.set(x, y, z); m.receiveShadow = true; m.renderOrder = layer;
    scene.add(m); return m;
  };
  const flat = (w, d, mat, x, z, layer, y = 0) => flatGeo(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat, x, z, layer, y);
  const flatPoly = (poly, mat, layer, holes = []) => {
    const s = shapeOf(poly);
    holes.forEach((h) => s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z)))));
    return flatGeo(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2), mat, 0, 0, layer);
  };
  const LAYER = { ground: 0, site: 1, walk: 1, road: 2, junction: 3, green: 3, path: 4, water: 5 };
  const box = (w, h, d, mat, x, y, z, parent = scene) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };

  // ---------- ground + site ----------
  flat(4000, 4000, std({ color: '#c8c1ad', roughness: 1 }), 0, 0, LAYER.ground);
  flatPoly(layout.site, std({ color: '#d6c8ab', roughness: 1 }), LAYER.site);

  // ---------- roads ----------
  const SEG = 16, texCache = {};
  function roadTex(w) {
    if (texCache[w]) return texCache[w];
    const t = canvasTex(512, 256, (g, cw, ch) => {
      g.fillStyle = '#55595e'; g.fillRect(0, 0, cw, ch);
      const r = rng(w * 31);
      for (let i = 0; i < 1400; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)'; g.fillRect(r() * cw, r() * ch, 2, 2); }
      const px = (m) => (m / w) * ch;
      const line = (yM, dashed, thick = 0.15) => {
        g.fillStyle = 'rgba(242,239,230,0.92)';
        const h = Math.max(2, px(thick)), y = px(yM) - h / 2;
        if (dashed) g.fillRect(cw * 0.1, y, cw * 0.38, h); else g.fillRect(0, y, cw, h);
      };
      line(0.4, false); line(w - 0.4, false);
      if (w >= 20) { line(w / 2 - 0.2, false); line(w / 2 + 0.2, false); line(w / 4, true); line((w * 3) / 4, true); }
      else if (w >= 14) { line(w / 2, false, 0.12); line(w / 4, true); line((w * 3) / 4, true); }
      else line(w / 2, true);
    });
    t.wrapS = THREE.RepeatWrapping;
    return (texCache[w] = t);
  }
  const walk = std({ color: '#bdb6a6', roughness: 1 });
  const plain = std({ color: '#55595e', roughness: 0.95 });
  for (const r of layout.roads) {
    const len = r.b - r.a, mid = (r.a + r.b) / 2;
    const carriage = r.ext ? r.w : r.w - 3;            // internal roads: footpaths inside the ROW
    const tex = roadTex(carriage).clone(); tex.needsUpdate = true; tex.repeat.set(len / SEG, 1);
    const geo = new THREE.PlaneGeometry(len, carriage).rotateX(-Math.PI / 2);
    const wgeo = new THREE.PlaneGeometry(len, r.ext ? 3 : 1.5).rotateX(-Math.PI / 2);
    if (r.axis === 'z') { geo.rotateY(Math.PI / 2); wgeo.rotateY(Math.PI / 2); }
    const mat = std({ map: tex, roughness: 0.92 });
    const off = r.ext ? r.w / 2 + 1.5 : r.w / 2 - 0.75;
    const [x, z] = r.axis === 'x' ? [mid, r.at] : [r.at, mid];
    flatGeo(geo, mat, x, z, LAYER.road);
    if (r.axis === 'x') { flatGeo(wgeo, walk, x, z - off, LAYER.walk); flatGeo(wgeo, walk, x, z + off, LAYER.walk); }
    else { flatGeo(wgeo, walk, x - off, z, LAYER.walk); flatGeo(wgeo, walk, x + off, z, LAYER.walk); }
  }
  // junctions
  for (const a of layout.roads) if (a.axis === 'x') for (const b of layout.roads) if (b.axis === 'z') {
    if (b.at >= a.a - 0.1 && b.at <= a.b + 0.1 && a.at >= b.a - 0.1 && a.at <= b.b + 0.1) {
      const aw = a.ext ? a.w : a.w - 3, bw = b.ext ? b.w : b.w - 3;
      flat(bw + 0.1, aw + 0.1, plain, b.at, a.at, LAYER.junction);
    }
  }
  const onRoad = (x, z, pad = 0) => layout.roads.some((r) => {
    const half = r.w / 2 + pad;
    return r.axis === 'x' ? Math.abs(z - r.at) < half && x > r.a - pad && x < r.b + pad
      : Math.abs(x - r.at) < half && z > r.a - pad && z < r.b + pad;
  });
  W.onRoad = onRoad;

  // ---------- greens ----------
  const lawn = std({ color: '#79a660', roughness: 1 });
  const lawnDark = std({ color: '#6b9856', roughness: 1 });
  const pathMat = std({ color: '#d9cdb5', roughness: 1 });
  const trees = [];
  const treeAt = (x, z, s = 1) => trees.push([x, z, s * (0.8 + R() * 0.45)]);
  for (const g of layout.greens) {
    flatPoly(g.poly, g.kind === 'belt' ? lawnDark : lawn, LAYER.green);
    const b = bbox(g.poly);
    if (g.kind === 'park') {
      const inset = (d) => [[b.x0 + d, b.z0 + d], [b.x1 - d, b.z0 + d], [b.x1 - d, b.z1 - d], [b.x0 + d, b.z1 - d]];
      flatPoly(inset(4), pathMat, LAYER.path, [inset(6.5)]);
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 0.6, 32), std({ color: '#e7dcc6' }));
      ring.position.set(cx, 0.3, cz); ring.castShadow = ring.receiveShadow = true; scene.add(ring);
      const water = new THREE.Mesh(new THREE.CircleGeometry(5.2, 32).rotateX(-Math.PI / 2), onLayer(std({ color: '#2db3d6', roughness: 0.05, metalness: 0.2, emissive: '#0e7fa3', emissiveIntensity: 0.3 }), LAYER.water));
      water.position.set(cx, 0.6, cz); scene.add(water);
      // gazebo
      const gz = cz + (b.z1 - b.z0) * 0.3;
      const wood = std({ color: '#8f6540', roughness: 0.7 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; box(0.25, 2.8, 0.25, wood, cx + Math.cos(a) * 3, 1.4, gz + Math.sin(a) * 3); }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2, 6), std({ color: '#a7473a', roughness: 0.8 }));
      roof.position.set(cx, 3.8, gz); roof.castShadow = true; scene.add(roof);
      for (let i = 0; i < 60; i++) {
        const x = b.x0 + 9 + R() * (b.x1 - b.x0 - 18), z = b.z0 + 9 + R() * (b.z1 - b.z0 - 18);
        if (Math.hypot(x - cx, z - cz) < 12 || Math.hypot(x - cx, z - gz) < 7) continue;
        treeAt(x, z, 1.15);
      }
      for (let x = b.x0 + 2; x < b.x1; x += 9) { treeAt(x, b.z0 + 2, 1); treeAt(x, b.z1 - 2, 1); }
    } else if (g.kind === 'belt') {
      const alongX = b.x1 - b.x0 > b.z1 - b.z0;
      if (alongX) {
        const zc = (b.z0 + b.z1) / 2;
        flat(b.x1 - b.x0 - 4, 2.4, pathMat, (b.x0 + b.x1) / 2, zc, LAYER.path);
        for (let x = b.x0 + 3; x < b.x1; x += 6) { treeAt(x, b.z0 + 3 + R() * 6); treeAt(x + 3, b.z1 - 3 - R() * 6); }
      } else {
        const xc = (b.x0 + b.x1) / 2;
        flat(2.4, b.z1 - b.z0 - 4, pathMat, xc, (b.z0 + b.z1) / 2, LAYER.path);
        for (let z = b.z0 + 3; z < b.z1; z += 6) { treeAt(b.x0 + 3 + R() * 6, z); treeAt(b.x1 - 3 - R() * 6, z + 3); }
      }
    } else if (g.kind === 'plaza') {
      for (let i = 0; i < 6; i++) treeAt(b.x0 + 4 + R() * (b.x1 - b.x0 - 8), b.z0 + 4 + R() * (b.z1 - b.z0 - 8), 0.9);
    } else {
      // narrow green strips between plot rows: a single tree line
      const alongX = b.x1 - b.x0 > b.z1 - b.z0;
      if (alongX) for (let x = b.x0 + 4; x < b.x1 - 2; x += 10) treeAt(x, (b.z0 + b.z1) / 2, 0.85);
      else for (let z = b.z0 + 4; z < b.z1 - 2; z += 10) treeAt((b.x0 + b.x1) / 2, z, 0.85);
    }
  }

  // ---------- amenity buildings ----------
  const M = {
    slab: std({ color: '#f2efe9', roughness: 0.8 }),
    glass: std({ color: '#86a8bd', roughness: 0.06, metalness: 0.55, emissive: '#ffd08f', emissiveIntensity: 0 }),
    bronze: std({ color: '#b98f5e', roughness: 0.55, metalness: 0.25 }),
    dark: std({ color: '#2f343b', roughness: 0.6 }),
    lamp: std({ color: '#fff3d6', emissive: '#ffd08a', emissiveIntensity: 0 }),
  };
  W.M = M;
  for (const a of layout.amenities) {
    const b = bbox(a.poly), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
    if (a.kind === 'club') {
      flatPoly(a.poly, pathMat, LAYER.path);
      box(w - 6, 4.2, d - 8, M.glass, cx, 2.1, cz);
      box(w - 3, 0.5, d - 5, M.slab, cx, 4.45, cz);
      box(w - 12, 3.6, d - 12, M.slab, cx - 2, 6.5, cz);
      box(w - 10, 0.4, d - 10, M.slab, cx - 2, 8.5, cz);
      box(0.5, 8.6, 3, M.bronze, cx + (w - 6) / 2 + 0.3, 4.3, cz);
    } else if (a.kind === 'temple') {
      flatPoly(a.poly, std({ color: '#efe2c8', roughness: 0.9 }), LAYER.path);
      const stone = std({ color: '#f1dfbf', roughness: 0.8 }), saffron = std({ color: '#e59a3a', roughness: 0.6 });
      box(12, 1.2, 12, stone, cx, 0.6, cz);
      box(7, 5, 7, stone, cx, 3.7, cz);
      box(9, 0.5, 9, saffron, cx, 6.4, cz);
      const sh = new THREE.Mesh(new THREE.ConeGeometry(4.2, 7.5, 4), stone);
      sh.position.set(cx, 10.4, cz); sh.rotation.y = Math.PI / 4; sh.castShadow = true; scene.add(sh);
      const kal = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), saffron); kal.position.set(cx, 14.4, cz); scene.add(kal);
      box(0.06, 2.2, 0.06, M.dark, cx, 15.6, cz);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), std({ color: '#ff7a1a', side: THREE.DoubleSide }));
      flag.position.set(cx + 0.7, 16.2, cz); scene.add(flag);
    } else if (a.kind === 'creche') {
      flatPoly(a.poly, std({ color: '#efb04a', roughness: 1 }), LAYER.path);
      box(w - 8, 3.6, d - 10, std({ color: '#f6efe2', roughness: 0.8 }), cx, 1.8, cz - 3);
      box(w - 7, 0.4, d - 9, std({ color: '#3d7de0' }), cx, 3.8, cz - 3);
      for (const [dx, col] of [[-4, '#e05a47'], [0, '#3fae6a'], [4, '#3d7de0']]) box(1, 1.6, 1, std({ color: col }), cx + dx, 0.8, cz + d / 2 - 3);
    } else if (a.kind === 'gate') {
      const gx = layout.gate[0], gzs = [-9.6, 9.6];
      for (const gz of gzs) box(1.6, 6, 1.6, M.dark, gx, 3, gz);
      box(1.6, 1.2, 20.8, M.dark, gx, 6.6, 0);
      box(0.3, 0.7, 14, M.bronze, gx + 0.95, 6.6, 0);
      box(3, 3, 3.4, std({ color: '#ece6da' }), gx - 4, 1.5, 12.6);
      const boom = box(0.18, 0.18, 7.5, std({ color: '#e5484d' }), gx + 1.5, 1.1, -4.5);
      boom.castShadow = false;
    }
  }

  // ---------- plots ----------
  const plotMats = {
    available: std({ color: '#3fbf6e', roughness: 0.85 }),
    hold: std({ color: '#f0a630', roughness: 0.85 }),
    sold: std({ color: '#d0575a', roughness: 0.85 }),
    natural: std({ color: '#c7a97b', roughness: 1 }),
    naturalSold: std({ color: '#b99b6f', roughness: 1 }),
    dim: std({ color: '#a59d8f', roughness: 1 }),
    selected: std({ color: '#3d7bff', roughness: 0.6, emissive: '#3d7bff', emissiveIntensity: 0.35 }),
    hover: std({ color: '#e6eeff', roughness: 0.7, emissive: '#ffffff', emissiveIntensity: 0.15 }),
  };
  W.plotMats = plotMats;
  const edgeMat = new THREE.LineBasicMaterial({ color: '#f7f2e8', transparent: true, opacity: 0.85 });
  const pegs = [];
  const SLAB = 0.3;
  for (const p of plots) {
    const geo = new THREE.ExtrudeGeometry(shapeOf(p.poly), { depth: SLAB, bevelEnabled: false }).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, plotMats.natural);
    m.castShadow = false; m.receiveShadow = true;
    m.userData = { id: p.id, kind: 'plot' };
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat);
    m.add(edges);
    scene.add(m);
    W.plotMesh[p.id] = m;
    W.pickables.push(m);
    for (const [x, z] of p.poly) pegs.push([x, z]);
  }
  const pegIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.8, 0.22).translate(0, 0.4, 0), std({ color: '#ffffff', roughness: 0.6 }), pegs.length);
  const tmp = new THREE.Object3D();
  pegs.forEach(([x, z], i) => { tmp.position.set(x, 0, z); tmp.updateMatrix(); pegIM.setMatrixAt(i, tmp.matrix); });
  pegIM.castShadow = true;
  scene.add(pegIM);

  // ---------- sample houses ----------
  const winTex = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (const x of [30, 150]) {
      g.fillStyle = '#4d6478'; g.fillRect(x, 26, 76, 70);
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x, 26, 30, 70);
      g.fillStyle = '#e9e4da'; g.fillRect(x + 36, 26, 4, 70); g.fillRect(x - 4, 96, 84, 6);
    }
  });
  const wallColors = ['#f3ead8', '#efe6dc', '#e7d3b5', '#f4f1ea', '#d9c3a5', '#e9dfcf', '#cdbfae'];
  const accent = ['#b5654a', '#7d8a6a', '#5e6b7a', '#a37b52', '#8c4f3f'];
  const houseMats = new Map();
  const hm = (col) => { if (!houseMats.has(col)) houseMats.set(col, std({ color: col, map: winTex, roughness: 0.8 })); return houseMats.get(col); };
  const plainMat = new Map();
  const pm = (col) => { if (!plainMat.has(col)) plainMat.set(col, std({ color: col, roughness: 0.7 })); return plainMat.get(col); };
  const railMat = std({ color: '#bcd6e4', roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.45, depthWrite: false });
  const shopGlass = std({ color: '#7aa0b8', roughness: 0.05, metalness: 0.6 });

  W.makeHouse = (p, highlight = false) => {
    const r = rng(p.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    const g = new THREE.Group();
    g.position.set(p.cx, SLAB, p.cz);
    g.rotation.y = Math.atan2(p.front[0], p.front[1]);       // local +Z = towards the front road
    const commercial = p.type === 'commercial';
    const front = commercial ? 1.5 : 3, rear = commercial ? 0 : 2, side = p.w > 11 ? 1.2 : 0;
    const hw = p.w - side * 2 - 0.2, hd = p.d - front - rear;
    const zc = (rear - front) / 2;
    const floors = commercial ? 4 : p.type === 'villa' ? 2 : r() < 0.55 ? 2 : 3;
    const H = 3.2;
    const wallCol = highlight ? '#f7f9ff' : wallColors[Math.floor(r() * wallColors.length)];
    const acc = highlight ? '#3d7bff' : accent[Math.floor(r() * accent.length)];
    for (let f = 0; f < floors; f++) {
      const y = f * H;
      if (commercial) box(hw, H - 0.25, hd, f === 0 ? shopGlass : hm(wallCol), 0, y + (H - 0.25) / 2, zc, g);
      else box(hw, H - 0.25, hd, hm(wallCol), 0, y + (H - 0.25) / 2, zc, g);
      box(hw + 0.3, 0.25, hd + 0.3, pm('#f4f1ea'), 0, y + H - 0.12, zc, g);
      if (f > 0 && !commercial) {
        const bw = Math.min(hw * 0.6, 5);
        box(bw, 0.18, 1.3, pm('#f4f1ea'), hw / 2 - bw / 2 - 0.3, y + 0.09, zc + hd / 2 + 0.65, g);
        box(bw, 1.0, 0.05, railMat, hw / 2 - bw / 2 - 0.3, y + 0.6, zc + hd / 2 + 1.28, g);
      }
    }
    const top = floors * H;
    // accent fin + roof parapet + stair room
    box(0.35, top + 0.9, Math.min(2.2, hd * 0.3), pm(acc), -hw / 2 + 0.3, (top + 0.9) / 2, zc + hd / 2 - 1.1, g);
    box(hw + 0.3, 0.9, 0.18, pm('#f4f1ea'), 0, top + 0.45, zc + hd / 2 + 0.06, g);
    box(hw + 0.3, 0.9, 0.18, pm('#f4f1ea'), 0, top + 0.45, zc - hd / 2 - 0.06, g);
    if (!commercial) box(Math.min(3, hw * 0.4), 2.6, 3, pm(wallCol), hw / 2 - 1.8, top + 1.3, zc - hd / 2 + 1.8, g);
    if (commercial) box(hw - 0.4, 0.9, 0.12, pm(acc), 0, H - 0.6, zc + hd / 2 + 0.08, g);   // shop signage band
    // front boundary wall with gate opening
    if (!commercial) {
      const gw = Math.min(3.4, p.w * 0.38), sideW = (p.w - gw) / 2 - 0.1;
      box(sideW, 1.1, 0.2, pm('#ece5d8'), -p.w / 2 + sideW / 2 + 0.1, 0.55, p.d / 2 - 0.15, g);
      box(sideW * 0.4, 1.1, 0.2, pm('#ece5d8'), p.w / 2 - sideW * 0.2 - 0.1, 0.55, p.d / 2 - 0.15, g);
      box(0.12, 1.3, gw * 0.95, M.dark, p.w / 2 - sideW * 0.4 - 0.1 - gw / 2, 0.65, p.d / 2 - 0.15, g).rotation.y = Math.PI / 2;
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData = { builtUp: Math.round(hw * hd * floors * 10.764), floors, footprint: hw * hd };
    return g;
  };
  W.showHouse = (p, on, highlight = false) => {
    const key = p.id;
    const cur = W.houses.get(key);
    if (cur && (!on || cur.userData.highlight !== highlight)) { scene.remove(cur); W.houses.delete(key); }
    if (on && !W.houses.has(key)) { const h = W.makeHouse(p, highlight); h.userData.highlight = highlight; scene.add(h); W.houses.set(key, h); return h; }
    return W.houses.get(key);
  };

  // ---------- boundary wall ----------
  const wallMat = std({ color: '#e5ddcf', roughness: 0.9 });
  for (const [[x0, z0], [x1, z1]] of layout.wall) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = box(len, 2, 0.35, wallMat, (x0 + x1) / 2, 1, (z0 + z1) / 2);
    m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  }

  // ---------- road-side trees + lights ----------
  const lamps = [];
  for (const r of layout.roads) {
    const off = r.ext ? r.w / 2 + 4.5 : r.w / 2 - 0.6;
    const lo = r.ext ? -420 : r.a, hi = r.ext ? 420 : r.b;
    const step = r.ext ? 16 : 11;
    for (let s = lo + 4; s < hi - 3; s += step) {
      for (const side of [-1, 1]) {
        const [x, z] = r.axis === 'x' ? [s, r.at + side * off] : [r.at + side * off, s];
        const clash = layout.roads.some((o) => o !== r && (o.axis === 'x' ? Math.abs(z - o.at) < o.w / 2 + 3 && x > o.a - 3 && x < o.b + 3 : Math.abs(x - o.at) < o.w / 2 + 3 && z > o.a - 3 && z < o.b + 3));
        if (clash) continue;
        if (r.ext && x > -140 && x < 118 && z > -158 && z < 158) continue;     // keep the site frontage clear
        if (side > 0 || r.id === 'spine' || r.ext) treeAt(x, z, r.id === 'spine' ? 1.2 : 0.95);
        if (!r.ext && side < 0 && Math.round(s / step) % 3 === 0) lamps.push([x, z, r.axis]);
      }
    }
  }
  const poleIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.12, 7, 6).translate(0, 3.5, 0), M.dark, lamps.length);
  const headIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.2, 1.4), M.lamp, lamps.length);
  lamps.forEach(([x, z, axis], i) => {
    tmp.position.set(x, 0, z); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); poleIM.setMatrixAt(i, tmp.matrix);
    tmp.position.set(x, 7, z); tmp.rotation.set(0, axis === 'x' ? Math.PI / 2 : 0, 0); tmp.updateMatrix(); headIM.setMatrixAt(i, tmp.matrix);
  });
  poleIM.castShadow = true;
  scene.add(poleIM, headIM);

  // ---------- context city ----------
  const siteB = bbox(layout.site);
  const blocked = (x0, x1, z0, z1) => {
    if (x1 > siteB.x0 - 10 && x0 < siteB.x1 + 22 && z1 > siteB.z0 - 10 && z0 < siteB.z1 + 10) return true;
    for (const r of layout.roads) {
      if (!r.ext) continue;
      const half = r.w / 2 + 10;
      if (r.axis === 'x' ? z1 > r.at - half && z0 < r.at + half : x1 > r.at - half && x0 < r.at + half) return true;
    }
    for (const lm of project.landmarks) { const [lx, lz] = lm.pos; if (x1 > lx - 22 && x0 < lx + 22 && z1 > lz - 22 && z0 < lz + 22) return true; }
    return false;
  };
  const placed = [];
  const C = rng(5);
  for (let t = 0; t < 4000 && placed.length < 330; t++) {
    const ang = C() * Math.PI * 2, rad = 170 + Math.pow(C(), 0.8) * 380;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    const w = 10 + C() * 18, d = 10 + C() * 16, h = rad > 260 && C() < 0.14 ? 24 + C() * 26 : 6 + C() * 13;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    if (blocked(x0, x1, z0, z1)) continue;
    if (placed.some((p) => x1 + 4 > p.x0 && x0 - 4 < p.x1 && z1 + 4 > p.z0 && z0 - 4 < p.z1)) continue;
    placed.push({ x, z, w, d, h, x0, x1, z0, z1 });
  }
  for (const lm of project.landmarks) if (lm.kind !== 'highway') placed.push({ x: lm.pos[0], z: lm.pos[1], w: 26, d: 18, h: lm.kind === 'mall' ? 16 : 11, lm: true });
  const bIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), std({ color: '#ffffff', roughness: 0.85 }), placed.length);
  const pal = ['#ece6da', '#e2dacb', '#d6cfc2', '#e8dccb', '#cdd1d5', '#f1ede5'].map((c) => new THREE.Color(c));
  placed.forEach((p, i) => {
    tmp.position.set(p.x, 0, p.z); tmp.rotation.set(0, 0, 0); tmp.scale.set(p.w, p.h, p.d); tmp.updateMatrix();
    bIM.setMatrixAt(i, tmp.matrix); bIM.setColorAt(i, p.lm ? new THREE.Color('#c9d8ee') : pal[Math.floor(C() * pal.length)]);
  });
  tmp.scale.set(1, 1, 1);
  bIM.castShadow = bIM.receiveShadow = true;
  scene.add(bIM);
  for (let i = 0, n = 0; i < 1500 && n < 200; i++) {
    const x = (C() - 0.5) * 900, z = (C() - 0.5) * 900;
    if (blocked(x - 2, x + 2, z - 2, z + 2)) continue;
    if (placed.some((p) => x > p.x - p.w / 2 - 2 && x < p.x + p.w / 2 + 2 && z > p.z - p.d / 2 - 2 && z < p.z + p.d / 2 + 2)) continue;
    treeAt(x, z, 1.1); n++;
  }

  // ---------- trees (instanced) ----------
  const trunkIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 1, 6).translate(0, 0.5, 0), std({ color: '#6b5240' }), trees.length);
  const leafIM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), std({ color: '#ffffff', roughness: 0.9, flatShading: true }), trees.length);
  const greens = ['#4d7a3a', '#5e8c44', '#3f6c35', '#6e9a4e', '#577f3c'].map((c) => new THREE.Color(c));
  const origT = [], origL = [];
  trees.forEach(([x, z, s], i) => {
    const h = 5 * s;
    tmp.position.set(x, 0, z); tmp.scale.set(1, h * 0.5, 1); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); trunkIM.setMatrixAt(i, tmp.matrix); origT.push(tmp.matrix.clone());
    tmp.position.set(x, h * 0.62, z); tmp.scale.set(h * 0.36, h * 0.42, h * 0.36); tmp.rotation.set(0, C() * 3, 0); tmp.updateMatrix(); leafIM.setMatrixAt(i, tmp.matrix); origL.push(tmp.matrix.clone());
    leafIM.setColorAt(i, greens[i % greens.length]);
  });
  // hide trees matching fn(x, z) (e.g. the ones blocking a street-level view); null restores all
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  W.hideTrees = (fn) => {
    trees.forEach(([x, z], i) => {
      const hide = fn && fn(x, z);
      trunkIM.setMatrixAt(i, hide ? zero : origT[i]);
      leafIM.setMatrixAt(i, hide ? zero : origL[i]);
    });
    trunkIM.instanceMatrix.needsUpdate = leafIM.instanceMatrix.needsUpdate = true;
  };
  tmp.scale.set(1, 1, 1);
  trunkIM.castShadow = leafIM.castShadow = true; leafIM.receiveShadow = true;
  scene.add(trunkIM, leafIM);

  // ---------- landmark beacons ----------
  const beamMat = new THREE.MeshBasicMaterial({ color: '#8ab4ff', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#8ab4ff', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -32 });
  for (const lm of project.landmarks) {
    const [x, z] = lm.pos;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 70, 10, 1, true), beamMat); beam.position.set(x, 35, z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(9, 10.5, 40).rotateX(-Math.PI / 2), ringMat); ring.position.set(x, 0.02, z); ring.renderOrder = 8;
    scene.add(beam, ring);
    W.beacons.push({ id: lm.id, beam, ring, top: new THREE.Vector3(x, 72, z) });
  }

  // ---------- cars on outside roads ----------
  const carCols = ['#f4f4f2', '#1f2329', '#a8adb3', '#b23a35', '#2f5aa8', '#e8e3d6', '#565b61'];
  const cab = std({ color: '#26303a', roughness: 0.15, metalness: 0.6 });
  const lanes = [
    { axis: 'z', at: 125 - 3.5, dir: -1 }, { axis: 'z', at: 125 + 3.5, dir: 1 },
    { axis: 'x', at: -168 - 2.5, dir: 1 }, { axis: 'x', at: -168 + 2.5, dir: -1 },
  ];
  for (let i = 0; i < 16; i++) {
    const lane = lanes[i % lanes.length];
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.3, 1.0, 1.9), std({ color: carCols[i % carCols.length], roughness: 0.35, metalness: 0.5 }));
    body.position.y = 0.75; body.castShadow = true;
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.75, 1.7), cab); c2.position.set(-0.2, 1.6, 0); c2.castShadow = true;
    car.add(body, c2);
    car.rotation.y = lane.axis === 'x' ? (lane.dir > 0 ? 0 : Math.PI) : (lane.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    scene.add(car);
    W.cars.push({ car, lane, s: -450 + C() * 900, speed: 9 + C() * 6 });
  }
  W.updateCars = (dt) => {
    for (const c of W.cars) {
      c.s += c.lane.dir * c.speed * dt;
      if (c.s > 460) c.s = -460; else if (c.s < -460) c.s = 460;
      if (c.lane.axis === 'x') c.car.position.set(c.s, 0, c.lane.at); else c.car.position.set(c.lane.at, 0, c.s);
    }
  };
  return W;
}
